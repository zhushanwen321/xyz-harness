"""EntryResolver 基类、数据结构和公共工具。"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

# ── 公共常量 ──────────────────────────────────────────────────────────

SKIP_DIRS: frozenset[str] = frozenset({
    # VCS
    ".git", ".svn", ".hg",
    # 依赖
    "node_modules", ".venv", "venv", "env", "__pycache__",
    # 构建产物
    "dist", "out", "build", ".next", ".nuxt",
    # IDE
    ".idea", ".vscode",
})

# 各语言源文件扩展名
PYTHON_EXTS: frozenset[str] = frozenset({".py"})
TS_EXTS: frozenset[str] = frozenset({".ts", ".js", ".tsx", ".jsx"})
VUE_EXTS: frozenset[str] = frozenset({".vue"})
FRONTEND_EXTS: frozenset[str] = TS_EXTS | VUE_EXTS
ALL_SOURCE_EXTS: frozenset[str] = PYTHON_EXTS | FRONTEND_EXTS

# 文件大小上限（1MB），防止读取 bundle 等大文件
MAX_FILE_SIZE: int = 1 * 1024 * 1024


# ── 数据结构 ──────────────────────────────────────────────────────────

@dataclass
class EntryPoint:
    """一个入口点的信息。"""

    name: str           # "/api/task/runs" 或 "session.create"
    entry_type: str     # "http" | "ws_message" | "ipc" | "direct"
    file: str           # handler 所在文件（相对于项目根）
    handler: str        # handler 函数/方法名（qualified）
    method: str = ""    # HTTP method（仅 http 类型）
    extra: dict = field(default_factory=dict)


# ── 抽象基类 ──────────────────────────────────────────────────────────

class EntryResolver(ABC):
    """入口点发现抽象基类。"""

    @abstractmethod
    def discover_all(self, project: str) -> list[EntryPoint]:
        """扫描项目，发现所有入口点。"""

    @abstractmethod
    def discover_all(self, project: str) -> list[EntryPoint]:
        """扫描项目，发现所有入口点。"""

    def match(self, query: str, entries: list[EntryPoint]) -> list[EntryPoint]:
        """默认匹配：精确 → 前缀 → 子串。子类可覆盖以自定义匹配逻辑。"""
        exact = [ep for ep in entries if ep.name == query]
        if exact:
            return exact
        prefix = [ep for ep in entries if ep.name.startswith(query)]
        if prefix:
            return prefix
        return [ep for ep in entries if query in ep.name]

    def resolve(self, project: str, query: str) -> list[EntryPoint]:
        """便捷方法：discover + match。"""
        return self.match(query, self.discover_all(project))


# ── 公共文件遍历工具 ──────────────────────────────────────────────────

def walk_source_files(
    project: str,
    extensions: frozenset[str] | tuple[str, ...] = ALL_SOURCE_EXTS,
    *,
    content_filter: str | None = None,
) -> Iterator[tuple[str, str, str]]:
    """遍历项目中的源代码文件。

    Args:
        project: 项目根目录的绝对路径。
        extensions: 要包含的文件扩展名集合。
        content_filter: 快速过滤 — 只产出包含此字符串的文件。

    Yields:
        (abs_path, rel_path, content) 三元组。
    """
    for dirpath, _, filenames in os.walk(project):
        if any(p in SKIP_DIRS for p in Path(dirpath).parts):
            continue
        for fn in filenames:
            if not any(fn.endswith(ext) for ext in extensions):
                continue
            abs_path = os.path.join(dirpath, fn)
            try:
                if os.path.getsize(abs_path) > MAX_FILE_SIZE:
                    continue
                content = Path(abs_path).read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if content_filter and content_filter not in content:
                continue
            rel_path = os.path.relpath(abs_path, project)
            yield abs_path, rel_path, content
