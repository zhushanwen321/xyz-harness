"""Electron IPC 解析器 — 从 ipcMain.handle 通道发现 IPC 入口点。"""

from __future__ import annotations

import re

from .base import EntryResolver, EntryPoint, TS_EXTS, walk_source_files


class IPCResolver(EntryResolver):
    """发现 Electron ipcMain.handle / ipcMain.on 通道入口。"""

    def discover_all(self, project: str) -> list[EntryPoint]:
        entries: list[EntryPoint] = []
        for abs_path, rel_path, source in walk_source_files(project, TS_EXTS, content_filter="ipcMain"):
            entries.extend(self._parse_file(rel_path, source))
        return entries

    def _parse_file(self, rel_path: str, source: str) -> list[EntryPoint]:
        results: list[EntryPoint] = []
        for m in re.finditer(
            r"ipcMain\.(?:handle|on)\s*\(\s*['\"`]([\w-]+)['\"`]",
            source,
        ):
            channel = m.group(1)
            handler = self._find_handler_name(source, m.start())
            results.append(
                EntryPoint(
                    name=channel,
                    entry_type="ipc",
                    file=rel_path,
                    handler=handler or channel,
                )
            )
        return results

    def _find_handler_name(self, source: str, pos: int) -> str:
        before = source[:pos].rstrip()
        m = re.search(r"(\w+)\s*=\s*$", before.split("\n")[-1])
        if m:
            return m.group(1)
        return ""
