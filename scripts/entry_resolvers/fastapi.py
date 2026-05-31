"""FastAPI 路由解析器 — 从 @router.get/post/... 装饰器发现 HTTP 端点。"""

from __future__ import annotations

import ast
import re

from .base import EntryResolver, EntryPoint, PYTHON_EXTS, walk_source_files


class FastAPIResolver(EntryResolver):
    """发现 FastAPI 项目中所有 HTTP 端点。

    解析 APIRouter(prefix=...) + @router.get("/path") 模式，
    产出 EntryPoint 列表。
    """

    HTTP_METHODS = {"get", "post", "put", "delete", "patch"}

    def discover_all(self, project: str) -> list[EntryPoint]:
        entries: list[EntryPoint] = []
        for _, rel_path, source in walk_source_files(project, PYTHON_EXTS, content_filter="APIRouter"):
            entries.extend(self._parse_file(rel_path, source))
        return entries

    def match(self, query: str, entries: list[EntryPoint]) -> list[EntryPoint]:
        matched: list[tuple[int, EntryPoint]] = []
        for ep in entries:
            score = _match_score(ep.name, query)
            if score > 0:
                matched.append((score, ep))

        if not matched:
            return [
                ep
                for ep in entries
                if ep.name.startswith(query) or query.startswith(ep.name.rstrip("/"))
            ]

        matched.sort(key=lambda x: x[0], reverse=True)
        return [ep for _, ep in matched]

    # ── 内部方法 ──────────────────────────────────────────────────────

    def _parse_file(self, rel_path: str, source: str) -> list[EntryPoint]:
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return []

        prefix = _extract_router_prefix(tree)
        results: list[EntryPoint] = []

        for node in ast.iter_child_nodes(tree):
            if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                continue
            for decorator in node.decorator_list:
                method, path = _parse_route_decorator(decorator)
                if method is None:
                    continue
                full_path = re.sub(r"/+", "/", prefix + path)
                results.append(
                    EntryPoint(
                        name=full_path,
                        entry_type="http",
                        file=rel_path,
                        handler=node.name,
                        method=method.upper(),
                    )
                )
        return results


# ── 模块级工具函数 ──────────────────────────────────────────────────────


def _extract_router_prefix(tree: ast.Module) -> str:
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if not isinstance(target, ast.Name) or target.id != "router":
                continue
            if not isinstance(node.value, ast.Call):
                continue
            for kw in node.value.keywords:
                if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                    return kw.value.value
    return ""


def _parse_route_decorator(decorator: ast.expr) -> tuple[str | None, str | None]:
    if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute):
        method = decorator.func.attr
        if method in FastAPIResolver.HTTP_METHODS:
            if decorator.args and isinstance(decorator.args[0], ast.Constant):
                return method, decorator.args[0].value
    return None, None


def _match_score(pattern: str, query: str) -> int:
    if pattern == query:
        return 10
    if pattern.rstrip("/") == query.rstrip("/"):
        return 3
    regex_parts: list[str] = []
    for seg in pattern.split("/"):
        if not seg:
            regex_parts.append("")
            continue
        if re.match(r"^\{\w+\}$", seg):
            regex_parts.append("[^/]+")
        elif re.match(r"^\{\w+:\w+\}$", seg):
            # {param:type} → 通配
            regex_parts.append("[^/]+")
        else:
            regex_parts.append(re.escape(seg))
    regex = "/".join(regex_parts)
    if re.fullmatch(regex, query):
        return 5
    return 0
