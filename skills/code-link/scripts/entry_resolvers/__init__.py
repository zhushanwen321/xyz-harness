"""Entry resolvers — 框架特定的入口点发现。"""

from .base import (
    EntryPoint,
    EntryResolver,
    SKIP_DIRS,
    PYTHON_EXTS,
    TS_EXTS,
    VUE_EXTS,
    FRONTEND_EXTS,
    walk_source_files,
)
from .fastapi import FastAPIResolver
from .ws_message import WSMessageResolver
from .ipc import IPCResolver
from .auto_detect import auto_detect, classify_query

__all__ = [
    "EntryPoint",
    "EntryResolver",
    "SKIP_DIRS",
    "PYTHON_EXTS",
    "TS_EXTS",
    "VUE_EXTS",
    "FRONTEND_EXTS",
    "walk_source_files",
    "FastAPIResolver",
    "WSMessageResolver",
    "IPCResolver",
    "auto_detect",
    "classify_query",
]
