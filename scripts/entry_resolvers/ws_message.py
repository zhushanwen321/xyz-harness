"""WebSocket 消息路由解析器 — 从 switch(msg.type) 发现消息入口点。"""

from __future__ import annotations

import re

from .base import EntryResolver, EntryPoint, TS_EXTS, walk_source_files


class WSMessageResolver(EntryResolver):
    """发现 WebSocket 消息处理入口。

    解析 switch(msg.type) { case "session.create": ... } 模式。
    """

    def discover_all(self, project: str) -> list[EntryPoint]:
        entries: list[EntryPoint] = []
        for _, rel_path, source in walk_source_files(project, TS_EXTS, content_filter="msg.type"):
            entries.extend(self._parse_file(rel_path, source))
        return entries

    def _parse_file(self, rel_path: str, source: str) -> list[EntryPoint]:
        if not re.search(r"switch\s*\(\s*(?:msg|message)\s*\.\s*type\s*\)", source):
            return []

        results: list[EntryPoint] = []
        lines = source.split("\n")

        for i, line in enumerate(lines):
            m = re.match(r"\s*case\s+['\"]([\w.:\-]+)['\"]\s*:", line)
            if not m:
                continue
            msg_type = m.group(1)
            if msg_type in ("return", "break", "default", "true", "false"):
                continue
            handler = self._find_handler(lines, i)
            results.append(
                EntryPoint(
                    name=msg_type,
                    entry_type="ws_message",
                    file=rel_path,
                    handler=handler or msg_type,
                )
            )
        return results

    def _find_handler(self, lines: list[str], case_line: int) -> str:
        """从 case 行往下找 handler 函数调用。

        优先级：多级 this 调用 > 普通 await > 同步调用
        """
        # 第一遍：找 this.xxx.yyy(...) 多级调用
        for i in range(case_line + 1, min(case_line + 15, len(lines))):
            line = lines[i].strip()
            if line.startswith(("case ", "break", "}")):
                break
            m = re.match(r"await\s+(this\.(?:\w+\.)+\w+)\s*\(", line)
            if m:
                return m.group(1)
            m = re.match(r"(?:const|let|var)\s+\w+\s*=\s*await\s+(this\.(?:\w+\.)+\w+)", line)
            if m:
                return m.group(1)

        # 第二遍：普通 await 或 this.xxx()
        for i in range(case_line + 1, min(case_line + 15, len(lines))):
            line = lines[i].strip()
            if line.startswith(("case ", "break", "}")):
                break
            m = re.match(r"await\s+(\w+(?:\.\w+)*)", line)
            if m and not m.group(1).startswith("msg."):
                return m.group(1)
            m = re.match(r"(this\.\w+(?:\.\w+)*)\s*\(", line)
            if m:
                return m.group(1)
            m = re.match(r"return\s+(this\.\w+(?:\.\w+)*)", line)
            if m:
                return m.group(1)
        return ""
