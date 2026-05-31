#!/usr/bin/env python3
"""Python AST tracer — 从 FastAPI 端点出发，提取调用链中涉及的所有文件。

用法:
    python3 py_tracer.py --project /path/to/project --endpoint "/api/task/runs"
    python3 py_tracer.py --project /path/to/project --endpoint "/api/task/runs" "/api/dag/runs"

输出 JSON 到 stdout。
"""

import argparse
import ast
import json
import os
import re
import sys
from collections import deque
from pathlib import Path
from typing import NamedTuple


# ─── 数据结构 ──────────────────────────────────────────────────────────

class EndpointInfo(NamedTuple):
    """一个 API 端点的信息。"""
    endpoint: str      # 完整路径，如 /api/task/runs/{run_id}
    method: str        # HTTP 方法
    handler: str       # handler 函数名
    file_path: str     # 路由文件相对路径


class CallTarget(NamedTuple):
    """一个调用目标。"""
    file_path: str     # 目标文件相对路径
    func_name: str     # 目标函数/方法名
    caller_func: str   # 调用者函数名


# ─── 第一步：端点发现 ────────────────────────────────────────────────────

def find_py_files(project_root: str) -> list[str]:
    """递归扫描项目目录，返回所有 .py 文件的相对路径。"""
    result = []
    for dirpath, _, filenames in os.walk(project_root):
        # 跳过隐藏目录和虚拟环境
        parts = dirpath.replace(project_root, "").split(os.sep)
        if any(p.startswith(".") or p in ("__pycache__", "node_modules", ".venv", "venv") for p in parts):
            continue
        for fn in filenames:
            if fn.endswith(".py"):
                full = os.path.join(dirpath, fn)
                result.append(os.path.relpath(full, project_root))
    return result


def extract_router_prefix(source: str) -> str:
    """从源码中提取 APIRouter 的 prefix。"""
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "router":
                    # router = APIRouter(prefix="/api/task")
                    if isinstance(node.value, ast.Call):
                        prefix = _extract_kwarg(node.value, "prefix")
                        if prefix:
                            return prefix
    return ""


def _extract_kwarg(call_node: ast.Call, keyword: str) -> str | None:
    """从 Call 节点提取关键字参数的值。"""
    for kw in call_node.keywords:
        if kw.arg == keyword and isinstance(kw.value, ast.Constant):
            return kw.value.value
    return None


def extract_endpoints(file_rel_path: str, source: str) -> list[EndpointInfo]:
    """从路由文件中提取所有端点。"""
    prefix = extract_router_prefix(source)
    tree = ast.parse(source)
    results = []

    for node in ast.iter_child_nodes(tree):
        # 找 @router.get("/runs") 等装饰器
        if not isinstance(node, ast.AsyncFunctionDef | ast.FunctionDef):
            continue
        if not node.decorator_list:
            continue

        for decorator in node.decorator_list:
            method, path = _parse_route_decorator(decorator)
            if method is None:
                continue
            full_path = _normalize_path(prefix + path)
            results.append(EndpointInfo(
                endpoint=full_path,
                method=method,
                handler=node.name,
                file_path=file_rel_path,
            ))

    return results


def _parse_route_decorator(decorator: ast.expr) -> tuple[str | None, str | None]:
    """解析路由装饰器，返回 (method, path)。"""
    if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute):
        method = decorator.func.attr
        if method in ("get", "post", "put", "delete", "patch"):
            # 第一个位置参数是路径
            if decorator.args and isinstance(decorator.args[0], ast.Constant):
                return method, decorator.args[0].value
    return None, None


def _normalize_path(path: str) -> str:
    """规范化路径：去除重复斜杠。"""
    return re.sub(r"/+", "/", path)


def match_endpoint(pattern: str, query: str) -> bool:
    """模糊匹配端点。/api/task/runs/{run_id} 可以匹配 /api/task/runs/123。

    支持的模式：
    - {param} 匹配单个路径段
    - {param}:action 匹配 段:action
    """
    # 精确匹配
    if pattern == query:
        return True

    # 去掉尾斜杠再试一次
    if pattern.rstrip("/") == query.rstrip("/"):
        return True

    # 把 pattern 中的 {xxx} / {xxx}:action 替换为正则
    regex_parts = []
    for segment in pattern.split("/"):
        if not segment:
            regex_parts.append("")
            continue
        # {param}:action 形式
        m = re.match(r"\{(\w+)\}:(\w+)$", segment)
        if m:
            regex_parts.append(f"[^/]+:{m.group(2)}")
            continue
        # {param} 形式
        if re.match(r"^\{(\w+)\}$", segment):
            regex_parts.append("[^/]+")
            continue
        # 普通段，转义特殊字符
        regex_parts.append(re.escape(segment))

    regex = "/".join(regex_parts)
    # pattern 没有 action 后缀但 query 有的情况（如 /runs/{run_id} 匹配 /runs/123:cancel）
    # 这个由上面的 {param}:action 模式处理，这里不做额外匹配

    return bool(re.fullmatch(regex, query))


def discover_all_endpoints(project_root: str) -> list[EndpointInfo]:
    """扫描项目，发现所有 FastAPI 端点。"""
    all_endpoints = []
    py_files = find_py_files(project_root)
    for rel_path in py_files:
        full_path = os.path.join(project_root, rel_path)
        try:
            with open(full_path, encoding="utf-8") as f:
                source = f.read()
            # 快速过滤：只解析包含 APIRouter 的文件
            if "APIRouter" not in source:
                continue
            endpoints = extract_endpoints(rel_path, source)
            all_endpoints.extend(endpoints)
        except (SyntaxError, UnicodeDecodeError):
            continue
    return all_endpoints


def find_matching_endpoints(all_endpoints: list[EndpointInfo], query: str) -> list[EndpointInfo]:
    """找到匹配用户查询的端点，按匹配度排序（精确 > 含 action 后缀 > 模糊）。"""
    matched = []
    for ep in all_endpoints:
        score = _match_score(ep.endpoint, query)
        if score > 0:
            matched.append((score, ep))

    if not matched:
        # 前缀匹配降级
        return [ep for ep in all_endpoints if ep.endpoint.startswith(query) or query.startswith(ep.endpoint.rstrip("/"))]

    # 按匹配度降序排列（精确匹配优先）
    matched.sort(key=lambda x: x[0], reverse=True)
    return [ep for _, ep in matched]


def _match_score(pattern: str, query: str) -> int:
    """返回匹配分数，0 表示不匹配，分数越高越精确。

    10 = 精确匹配
    8  = pattern 中有 {param}:action 且 query 包含 :action
    5  = pattern 中有 {param} 且 query 匹配
    3  = 去尾斜杠匹配
    """
    if pattern == query:
        return 10
    if pattern.rstrip("/") == query.rstrip("/"):
        return 3

    # 检查 pattern 中是否有 :action 形式
    has_action = any(":" in seg for seg in pattern.split("/") if seg)
    query_has_action = any(":" in seg for seg in query.split("/") if seg)

    # 构建 regex
    regex_parts = []
    for segment in pattern.split("/"):
        if not segment:
            regex_parts.append("")
            continue
        m = re.match(r"\{(\w+)\}:(\w+)$", segment)
        if m:
            regex_parts.append(f"[^/]+:{m.group(2)}")
            continue
        if re.match(r"^\{(\w+)\}$", segment):
            regex_parts.append("[^/]+")
            continue
        regex_parts.append(re.escape(segment))

    regex = "/".join(regex_parts)
    if re.fullmatch(regex, query):
        # 有 :action 的 pattern 匹配有 :action 的 query，得分更高
        if has_action and query_has_action:
            return 8
        return 5

    return 0


# ─── 第二步：调用链提取 ────────────────────────────────────────────────

def _find_package_roots(project_root: str) -> list[str]:
    """找到项目中可能是 Python 包根目录的目录。

    项目结构可能是：
    - project_root/app/... （根目录就是包根）
    - project_root/backend/app/... （backend 是包根）
    - project_root/src/pkg/... （src 是包根）
    """
    roots = [project_root]
    for name in ("backend", "src", "server"):
        candidate = os.path.join(project_root, name)
        if os.path.isdir(candidate):
            roots.append(candidate)
    return roots


def resolve_import_to_file(import_name: str, import_module: str | None, current_file: str, project_root: str) -> str | None:
    """将 import 语句解析为项目内文件路径。

    处理：
    - from app.services.task_run_service import TaskRunService → app/services/task_run_service.py
    - from ..service import Xxx → 相对导入
    - from app.core.event.bus import InternalBus → app/core/event/bus.py
    """
    if import_module is None:
        return None

    # 确定模块路径
    if import_module.startswith("."):
        # 相对导入：根据当前文件位置解析
        module_path = _resolve_relative_import(import_module, current_file, project_root)
        if module_path is None:
            return None
        # 相对导入只有一个搜索根
        return _try_resolve_module(module_path, [project_root], project_root)
    else:
        # 绝对导入：在多个可能的包根中搜索
        module_path = import_module.replace(".", os.sep)
        return _try_resolve_module(module_path, _find_package_roots(project_root), project_root)


def _try_resolve_module(module_path: str, search_roots: list[str], project_root: str) -> str | None:
    """在多个搜索根目录中尝试解析模块路径。"""
    for root in search_roots:
        # 尝试作为文件
        candidate = os.path.join(root, module_path + ".py")
        if os.path.isfile(candidate):
            return os.path.relpath(candidate, project_root)

        # 尝试作为包（__init__.py）
        candidate = os.path.join(root, module_path, "__init__.py")
        if os.path.isfile(candidate):
            return os.path.relpath(candidate, project_root)

    return None


def _resolve_relative_import(module: str, current_file: str, project_root: str) -> str | None:
    """解析相对导入，返回模块路径。"""
    # 计算当前文件所在包的层级
    current_dir = os.path.dirname(current_file)  # 如 backend/app/api/routes
    levels = len(module) - len(module.lstrip("."))  # 点的数量
    module_rest = module.lstrip(".")

    # 向上回溯 levels 层
    parts = current_dir.split(os.sep)
    if levels > len(parts):
        return None
    base_parts = parts[: len(parts) - levels]
    if module_rest:
        base_parts.extend(module_rest.split("."))

    return os.sep.join(base_parts)


def extract_imports(source: str, current_file: str, project_root: str) -> dict[str, str]:
    """从源码中提取 import 映射：名称 → 相对文件路径。"""
    tree = ast.parse(source)
    mapping: dict[str, str] = {}

    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module
            for alias in node.names:
                name = alias.asname or alias.name
                file_path = resolve_import_to_file(name, module, current_file, project_root)
                if file_path:
                    mapping[name] = file_path

        elif isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.asname or alias.name
                file_path = resolve_import_to_file(name, alias.name, current_file, project_root)
                if file_path:
                    mapping[name] = file_path

    return mapping


def _find_target_functions(tree: ast.Module, func_name: str) -> list[ast.AsyncFunctionDef | ast.FunctionDef]:
    """查找目标函数。支持：
    1. 顶层函数
    2. 类方法（同名方法或 __init__）
    3. 类名 → 返回类的所有公开方法
    """
    # 尝试顶层函数
    func = _find_function(tree, func_name)
    if func:
        return [func]

    # 尝试在类中找同名方法
    method = _find_method_in_classes(tree, func_name)
    if method:
        return [method]

    # func_name 可能是类名，追踪类的所有公开方法
    class_def = _find_class(tree, func_name)
    if class_def:
        methods = []
        for item in class_def.body:
            if isinstance(item, (ast.AsyncFunctionDef, ast.FunctionDef)) and not item.name.startswith("_"):
                methods.append(item)
        return methods

    return []


def _find_class(tree: ast.Module, class_name: str) -> ast.ClassDef | None:
    """在模块中查找类定义。"""
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            return node
    return None


def _build_local_var_map(func_node: ast.AsyncFunctionDef | ast.FunctionDef, import_map: dict[str, str]) -> dict[str, str]:
    """从函数体中的赋值语句推断局部变量类型。

    处理模式：
    - service = TaskRunService()  → service 映射到 TaskRunService 所在文件
    """
    var_map: dict[str, str] = {}

    for node in ast.walk(func_node):
        # x = SomeClass()
        if isinstance(node, ast.Assign):
            if (len(node.targets) == 1
                    and isinstance(node.targets[0], ast.Name)
                    and isinstance(node.value, ast.Call)):
                var_name = node.targets[0].id
                call = node.value
                # 检查是否是 import 过的类实例化
                if isinstance(call.func, ast.Name) and call.func.id in import_map:
                    var_map[var_name] = import_map[call.func.id]

    return var_map


def _extract_calls_from_func(func_node: ast.AsyncFunctionDef | ast.FunctionDef, combined_map: dict[str, str]) -> list[CallTarget]:
    """从函数中提取调用目标（使用已合并的 import + 局部变量映射）。"""
    targets = []
    seen = set()

    for node in ast.walk(func_node):
        if not isinstance(node, ast.Call):
            continue

        call_info = _resolve_call(node, combined_map)
        if call_info:
            key = f"{call_info[0]}:{call_info[1]}"
            if key not in seen:
                seen.add(key)
                targets.append(CallTarget(
                    file_path=call_info[0],
                    func_name=call_info[1],
                    caller_func=func_node.name,
                ))

    return targets


def extract_calls_in_function(func_node: ast.AsyncFunctionDef | ast.FunctionDef, import_map: dict[str, str]) -> list[CallTarget]:
    """从函数体中提取所有调用目标。"""
    local_var_map = _build_local_var_map(func_node, import_map)
    combined_map = {**import_map, **local_var_map}
    return _extract_calls_from_func(func_node, combined_map)


def _resolve_call(call_node: ast.Call, import_map: dict[str, str]) -> tuple[str, str] | None:
    """解析 Call 节点，确定目标文件和函数名。

    处理模式：
    1. service.list_runs()  → 通过 import_map 找 service 类型文件，func = list_runs
    2. TaskRunService()     → 通过 import_map 找 TaskRunService 文件（构造函数）
    3. func()               → 如果 func 在 import_map 中，指向其文件
    4. module.sub.func()    → 尝试解析 module
    """
    func = call_node.func

    if isinstance(func, ast.Attribute):
        # obj.method() 或 obj.method
        method_name = func.attr
        obj_expr = func.value

        if isinstance(obj_expr, ast.Name):
            obj_name = obj_expr.id
            if obj_name in import_map:
                return (import_map[obj_name], method_name)

        if isinstance(obj_expr, ast.Call):
            # TaskRunService().list_runs() — 链式调用
            inner_info = _resolve_call(obj_expr, import_map)
            if inner_info:
                return (inner_info[0], method_name)

        # 嵌套属性：self._task_run_repo.get_by_id()
        # 尝试找最左边的名称
        root_name = _get_root_name(obj_expr)
        if root_name and root_name in import_map:
            return (import_map[root_name], method_name)

        return None

    if isinstance(func, ast.Name):
        func_name = func.id
        # 直接调用：func() 或 ClassType()
        if func_name in import_map:
            return (import_map[func_name], func_name)
        return None

    return None


def _get_root_name(expr: ast.expr) -> str | None:
    """获取属性链最左边的名称。如 self._repo.method → self。"""
    if isinstance(expr, ast.Name):
        return expr.id
    if isinstance(expr, ast.Attribute):
        return _get_root_name(expr.value)
    return None


# ─── 第三步：BFS 递归追踪 ──────────────────────────────────────────────

MAX_DEPTH = 5


def trace_endpoint(endpoint_info: EndpointInfo, project_root: str) -> dict:
    """从端点出发，BFS 追踪所有调用链。"""
    visited_files: set[str] = set()
    # call_chain: {file:func → [file:func, ...]}
    call_chain: dict[str, list[str]] = {}
    all_files: list[str] = []

    # BFS 队列：(file_path, func_name, depth)
    queue: deque[tuple[str, str, int]] = deque()
    queue.append((endpoint_info.file_path, endpoint_info.handler, 0))
    visited_files.add(endpoint_info.file_path)

    while queue:
        current_file, current_func, depth = queue.popleft()

        if depth > MAX_DEPTH:
            continue

        full_path = os.path.join(project_root, current_file)
        if not os.path.isfile(full_path):
            continue

        try:
            with open(full_path, encoding="utf-8") as f:
                source = f.read()
            tree = ast.parse(source)
        except (SyntaxError, UnicodeDecodeError):
            continue

        # 构建 import 映射
        import_map = extract_imports(source, current_file, project_root)

        # 找到目标函数或类方法
        target_funcs = _find_target_functions(tree, current_func)
        if not target_funcs:
            continue

        for target_func in target_funcs:
            # 构建局部变量类型映射
            local_var_map = _build_local_var_map(target_func, import_map)
            combined_map = {**import_map, **local_var_map}

            # 提取调用
            calls = _extract_calls_from_func(target_func, combined_map)

            chain_key = f"{current_file}:{current_func}"
            call_targets = []

            for call in calls:
                target_key = f"{call.file_path}:{call.func_name}"
                call_targets.append(target_key)

                if call.file_path not in visited_files:
                    visited_files.add(call.file_path)
                    all_files.append(call.file_path)
                queue.append((call.file_path, call.func_name, depth + 1))

            if call_targets:
                # 合并同一 caller 的多个调用目标
                if chain_key in call_chain:
                    call_chain[chain_key].extend(call_targets)
                else:
                    call_chain[chain_key] = call_targets

    # 构建结果
    # 按发现顺序排列文件，handler 文件在最前面
    result_files = [endpoint_info.file_path]
    for f in all_files:
        if f not in result_files:
            result_files.append(f)

    return {
        "endpoint": endpoint_info.endpoint,
        "method": endpoint_info.method,
        "handler": endpoint_info.handler,
        "files": result_files,
        "call_chain": call_chain,
    }


def _find_function(tree: ast.Module, func_name: str) -> ast.AsyncFunctionDef | ast.FunctionDef | None:
    """在模块顶层查找函数。"""
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == func_name:
            return node
    return None


def _find_method_in_classes(tree: ast.Module, method_name: str) -> ast.AsyncFunctionDef | ast.FunctionDef | None:
    """在所有类中查找方法。"""
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for item in node.body:
                if isinstance(item, (ast.AsyncFunctionDef, ast.FunctionDef)) and item.name == method_name:
                    return item
    return None


# ─── 第四步：CLI 入口 ──────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Python AST tracer — 从 FastAPI 端点提取调用链")
    parser.add_argument("--project", required=True, help="项目根目录")
    parser.add_argument("--endpoint", nargs="+", required=True, help="API 端点路径，支持多个")
    args = parser.parse_args()

    project_root = os.path.abspath(args.project)

    # 第一步：发现所有端点
    all_endpoints = discover_all_endpoints(project_root)

    results = []
    for query in args.endpoint:
        matched = find_matching_endpoints(all_endpoints, query)
        if not matched:
            results.append({
                "endpoint": query,
                "error": f"未找到匹配的端点。可用端点: {[ep.endpoint for ep in all_endpoints]}",
            })
            continue

        # 如果匹配到多个，取第一个精确匹配或最佳匹配
        ep = matched[0]
        trace_result = trace_endpoint(ep, project_root)
        results.append(trace_result)

    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
