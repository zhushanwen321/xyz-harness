#!/usr/bin/env python3
"""
Vue/TS tracer — 从前端文件出发，递归提取所有 import 的相关文件和 API URL 调用。

用法:
  python3 vue_tracer.py --project /path/to/project --file frontend/src/views/SomeView.vue
  python3 vue_tracer.py --project /path/to/project --file frontend/src/services/someService.ts

输出 JSON 到 stdout，包含文件依赖树和 API 调用列表。
"""

import argparse
import json
import os
import re
import sys
from collections import deque
from pathlib import Path
from typing import Optional


# ─── 路径别名解析 ───────────────────────────────────────────────


def detect_path_aliases(project_root: str, file_relative: str) -> dict[str, str]:
    """
    从 tsconfig.json 或 vite.config.ts 探测路径别名。
    返回 { 别名前缀: 对应的相对于项目根的目录 }。
    """
    aliases: dict[str, str] = {}

    # 从入口文件的相对路径推断 frontend 根目录
    # 例如 file_relative = "frontend/src/views/X.vue" → frontend_root = "frontend"
    parts = Path(file_relative).parts
    frontend_root: Optional[str] = None
    for i, p in enumerate(parts):
        if p == "src" and i > 0:
            frontend_root = str(Path(*parts[:i]))
            break

    # 1. 尝试从 tsconfig.json 解析
    tsconfig_paths = [
        os.path.join(project_root, "tsconfig.json"),
    ]
    if frontend_root:
        tsconfig_paths.insert(0, os.path.join(project_root, frontend_root, "tsconfig.json"))

    for tsconfig_path in tsconfig_paths:
        if os.path.isfile(tsconfig_path):
            try:
                with open(tsconfig_path, "r", encoding="utf-8") as f:
                    content = f.read()
                paths_match = re.search(r'"paths"\s*:\s*\{([^}]+)\}', content)
                if paths_match:
                    paths_body = paths_match.group(1)
                    for m in re.finditer(r'"([^"]+)"\s*:\s*\["([^"]+)"\]', paths_body):
                        alias_prefix = m.group(1)
                        target = m.group(2)
                        alias_key = alias_prefix.rstrip("*").rstrip("/")
                        target_dir = target.rstrip("*").rstrip("/")
                        tsconfig_dir = os.path.dirname(tsconfig_path)
                        abs_target = os.path.normpath(os.path.join(tsconfig_dir, target_dir))
                        rel_target = os.path.relpath(abs_target, project_root)
                        aliases[alias_key + "/"] = rel_target + "/"
            except Exception:
                pass

    # 2. 尝试从 vite.config.ts 解析 alias
    vite_paths = [
        os.path.join(project_root, "vite.config.ts"),
        os.path.join(project_root, "vite.config.js"),
    ]
    if frontend_root:
        vite_paths.insert(0, os.path.join(project_root, frontend_root, "vite.config.ts"))
        vite_paths.insert(1, os.path.join(project_root, frontend_root, "vite.config.js"))

    for vite_path in vite_paths:
        if os.path.isfile(vite_path):
            try:
                with open(vite_path, "r", encoding="utf-8") as f:
                    content = f.read()
                alias_match = re.search(r'alias\s*:\s*\{([^}]+)\}', content)
                if alias_match:
                    alias_body = alias_match.group(1)
                    for m in re.finditer(r'"([^"]+)"\s*:\s*[^,]+?["\'](\.[^"\']+)["\']', alias_body):
                        alias_key = m.group(1).rstrip("/")
                        target_dir = m.group(2).rstrip("/")
                        vite_dir = os.path.dirname(vite_path)
                        abs_target = os.path.normpath(os.path.join(vite_dir, target_dir))
                        rel_target = os.path.relpath(abs_target, project_root)
                        aliases[alias_key + "/"] = rel_target + "/"
            except Exception:
                pass

    # 3. 回退默认值
    if not aliases and frontend_root:
        aliases["@/"] = os.path.join(frontend_root, "src") + "/"

    return aliases


def resolve_import_path(
    import_specifier: str,
    current_file: str,
    project_root: str,
    aliases: dict[str, str],
) -> Optional[str]:
    """
    将 import 路径解析为相对于 project_root 的文件路径。
    返回 None 表示无法解析（第三方库、动态路径等）。
    """
    is_relative = import_specifier.startswith(".")
    is_alias = any(import_specifier.startswith(k) for k in aliases)

    if not is_relative and not is_alias:
        return None

    resolved: Optional[str] = None

    if is_alias:
        for alias_prefix, alias_target in aliases.items():
            if import_specifier.startswith(alias_prefix):
                rest = import_specifier[len(alias_prefix):]
                resolved = os.path.join(alias_target, rest)
                break
    elif is_relative:
        current_dir = os.path.dirname(current_file)
        resolved = os.path.normpath(os.path.join(current_dir, import_specifier))

    if resolved is None:
        return None

    resolved = os.path.normpath(resolved)

    # 尝试添加扩展名
    extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".vue"]
    for ext in extensions:
        candidate = resolved + ext
        full_path = os.path.join(project_root, candidate)
        if os.path.isfile(full_path):
            return candidate

    # 尝试 index 文件
    for index_name in ["index.ts", "index.js", "index.vue"]:
        candidate = os.path.join(resolved, index_name)
        full_path = os.path.join(project_root, candidate)
        if os.path.isfile(full_path):
            return candidate

    return None


# ─── Vue SFC 解析 ──────────────────────────────────────────────


def extract_script_content(content: str) -> str:
    """从 Vue SFC 提取 <script setup> 或 <script> 块内容。"""
    m = re.search(r'<script\s+setup[^>]*>(.*?)</script>', content, re.DOTALL)
    if m:
        return m.group(1)
    m = re.search(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
    if m:
        return m.group(1)
    return ""


def extract_template_tags(content: str) -> list[str]:
    """从 Vue SFC template 提取大写开头的自定义组件标签名。"""
    m = re.search(r'<template>(.*?)</template>', content, re.DOTALL)
    if not m:
        return []
    template = m.group(1)
    tags = re.findall(r'<([A-Z][A-Za-z0-9]*)[\s/>]', template)
    return list(set(tags))


# ─── Import 提取 ────────────────────────────────────────────────


def extract_imports(content: str) -> list[str]:
    """
    从 TS/JS 内容提取所有 import 语句的来源路径。
    支持多行 import（先折叠换行再匹配）。
    """
    results = []
    seen = set()

    # 预处理：将多行 import 合并为单行
    flat = re.sub(r'\n', ' ', content)
    flat = re.sub(r'\s+', ' ', flat)

    # 匹配: import [type] {... / * as X / X} from 'path'
    pattern = r'''import\s+(?:type\s+)?(?:[\w\s{},*]+?)\s+from\s+['"]([^'"]+)['"]'''
    for m in re.finditer(pattern, flat):
        spec = m.group(1)
        if spec not in seen:
            seen.add(spec)
            results.append(spec)

    # 副作用导入：import 'path'
    side_effect_pattern = r'''(?:^|;|})\s*import\s+['"]([^'"]+)['"]'''
    for m in re.finditer(side_effect_pattern, flat):
        spec = m.group(1)
        if spec not in seen:
            seen.add(spec)
            results.append(spec)

    return results


# ─── API URL 提取 ──────────────────────────────────────────────


def extract_api_urls(content: str, file_path: str) -> list[dict]:
    """
    从 TS/JS 内容提取 API URL 调用。
    匹配 api.get('/xxx'), axios.post('/xxx'), client.put(`/path/${id}`) 等。
    对单引号/双引号保持原样，对模板字符串中的 ${...} 替换为 :id。
    """
    results = []
    seen = set()
    methods = ["get", "post", "put", "delete", "patch"]
    method_pattern = "|".join(methods)
    prefix = r'(?:api|axios|http|client)\s*\.\s*(' + method_pattern + r')\s*\(\s*'

    # 单引号字符串：完整路径，无变量插值
    sq_pattern = prefix + r"'([^']+)'"
    # 双引号字符串：完整路径，无变量插值
    dq_pattern = prefix + r'"([^"]+)"'
    # 反引号模板字符串：可能包含 ${var}
    bt_pattern = prefix + r'`([^`]+)`'

    for is_template, pat in [(False, sq_pattern), (False, dq_pattern), (True, bt_pattern)]:
        for m in re.finditer(pat, content, re.IGNORECASE):
            method = m.group(1).upper()
            url = m.group(2)
            if is_template:
                # 只替换真正的 ${var} 插值，不影响路径本身的冒号（如 :cancel）
                url = re.sub(r'\$\{[^}]*\}', ':id', url)
            key = (method, url, file_path)
            if key not in seen:
                seen.add(key)
                results.append({
                    "url": url,
                    "method": method,
                    "file": file_path,
                })

    return results


# ─── 文件解析调度 ──────────────────────────────────────────────


def parse_file(file_path: str, project_root: str, aliases: dict[str, str]):
    """
    解析单个文件，返回 (imports, api_urls)。
    imports: 解析后的相对路径列表
    api_urls: API 调用列表
    """
    full_path = os.path.join(project_root, file_path)
    if not os.path.isfile(full_path):
        return [], []

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return [], []

    api_urls = []
    raw_imports = []

    if file_path.endswith(".vue"):
        script = extract_script_content(content)
        raw_imports = extract_imports(script)
        api_urls = extract_api_urls(script, file_path)
    else:
        raw_imports = extract_imports(content)
        api_urls = extract_api_urls(content, file_path)

    # 解析 import 路径
    resolved_imports = []
    for spec in raw_imports:
        resolved = resolve_import_path(spec, file_path, project_root, aliases)
        if resolved:
            resolved_imports.append(resolved)

    return resolved_imports, api_urls


# ─── BFS 递归追踪 ──────────────────────────────────────────────


def trace(entry_file: str, project_root: str, max_depth: int = 5) -> dict:
    """BFS 广度优先追踪文件依赖和 API 调用。"""
    entry_file = os.path.normpath(entry_file)
    project_root = os.path.normpath(project_root)

    aliases = detect_path_aliases(project_root, entry_file)

    visited: set[str] = set()
    queue: deque[tuple[str, int]] = deque()
    all_files: list[str] = []
    all_api_urls: list[dict] = []
    seen_api: set[tuple[str, str, str]] = set()

    queue.append((entry_file, 0))
    visited.add(entry_file)

    while queue:
        current_file, depth = queue.popleft()
        if depth > max_depth:
            continue

        full_path = os.path.join(project_root, current_file)
        if not os.path.isfile(full_path):
            continue

        all_files.append(current_file)
        imports, api_urls = parse_file(current_file, project_root, aliases)

        for api in api_urls:
            key = (api["file"], api["url"], api["method"])
            if key not in seen_api:
                seen_api.add(key)
                all_api_urls.append(api)

        for imp_file in imports:
            if imp_file not in visited:
                visited.add(imp_file)
                queue.append((imp_file, depth + 1))

    # 探测 baseURL 并计算 full_url
    base_url_prefix = detect_base_url(project_root, all_files)
    for api in all_api_urls:
        url = api["url"]
        if not url.startswith(base_url_prefix):
            api["full_url"] = base_url_prefix.rstrip("/") + "/" + url.lstrip("/")
        else:
            api["full_url"] = url

    all_files.sort()
    all_api_urls.sort(key=lambda x: (x["file"], x["url"]))

    return {
        "entry": entry_file,
        "base_url_prefix": base_url_prefix,
        "files": all_files,
        "api_urls": all_api_urls,
    }


def detect_base_url(project_root: str, known_files: list[str]) -> str:
    """从已知文件中探测 axios baseURL 配置，默认返回 '/api'。"""
    for f in known_files:
        full_path = os.path.join(project_root, f)
        if not os.path.isfile(full_path):
            continue
        try:
            with open(full_path, "r", encoding="utf-8") as fh:
                content = fh.read()
        except Exception:
            continue
        m = re.search(r"baseURL\s*:\s*['\"](/[^'\"]+)['\"]", content)
        if m:
            return m.group(1)
    return "/api"


# ─── main ─────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Vue/TS 文件依赖和 API 调用追踪器")
    parser.add_argument("--project", required=True, help="项目根目录路径")
    parser.add_argument("--file", required=True, help="入口文件相对路径（相对于项目根）")
    parser.add_argument("--max-depth", type=int, default=5, help="最大递归深度（默认 5）")
    args = parser.parse_args()

    project_root = os.path.abspath(args.project)
    entry_file = args.file

    if not os.path.isdir(project_root):
        print(f"错误: 项目目录不存在: {project_root}", file=sys.stderr)
        sys.exit(1)

    full_entry = os.path.join(project_root, entry_file)
    if not os.path.isfile(full_entry):
        print(f"错误: 入口文件不存在: {full_entry}", file=sys.stderr)
        sys.exit(1)

    result = trace(entry_file, project_root, max_depth=args.max_depth)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
