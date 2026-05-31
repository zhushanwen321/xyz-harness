"""Bridge 层 — 通过通信标识（URL/消息类型）串联前后端。"""

from __future__ import annotations

import os
import re
from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass, field

from entry_resolvers.base import FRONTEND_EXTS, walk_source_files


# ── 数据结构 ──────────────────────────────────────────────────────────

@dataclass
class BridgeResult:
    """桥接结果。"""

    bridge_type: str   # "url" | "message_type" | "ipc_channel"
    identifier: str    # 匹配的标识符
    frontend_files: list[str] = field(default_factory=list)
    matches: list[dict] = field(default_factory=list)


class Bridge(ABC):
    """Bridge 抽象基类 — 所有 Bridge 类必须实现 bridge() 方法。"""

    @abstractmethod
    def bridge(
        self,
        project: str,
        identifiers: list[str],
        backend_files: list[str],
    ) -> BridgeResult: ...


# ── 公共前端文件遍历 ──────────────────────────────────────────────────

def walk_frontend_files(
    project: str,
    *,
    content_filter: str | None = None,
) -> Iterator[tuple[str, str, str]]:
    """遍历项目的前端源文件。

    自动检测前端目录：frontend/src、src、src-renderer。

    Yields:
        (abs_path, rel_path, content) 三元组。
        rel_path 相对于 project 根（不是前端子目录）。
    """
    frontend_dirs = [
        os.path.join(project, "frontend", "src"),
        os.path.join(project, "src"),
        os.path.join(project, "src-renderer"),
    ]
    for frontend_dir in frontend_dirs:
        if not os.path.isdir(frontend_dir):
            continue
        for abs_path, _, content in walk_source_files(frontend_dir, FRONTEND_EXTS, content_filter=content_filter):
            rel_path = os.path.relpath(abs_path, project)
            yield abs_path, rel_path, content


# ── Bridge 实现 ──────────────────────────────────────────────────────

class URLBridge(Bridge):
    """通过 API URL 匹配前后端。"""

    def bridge(
        self,
        project: str,
        identifiers: list[str],
        backend_files: list[str],
    ) -> BridgeResult:
        backend_urls = identifiers
        matches: list[dict] = []
        frontend_files: set[str] = set()

        for abs_path, rel_path, content in walk_frontend_files(project):
            if len(frontend_files) >= 50:
                break

            for m in re.finditer(
                r"(?:api|axios|http|fetch|request)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['\"`]([^'\"`]+)['\"`]",
                content,
            ):
                method = m.group(1).upper()
                url_path = m.group(2)
                full_url = _normalize_url(url_path)

                for back_url in backend_urls:
                    if _match_url(full_url, back_url):
                        matches.append({
                            "url": back_url,
                            "method": method,
                            "frontend_file": rel_path,
                            "line": content[:m.start()].count("\n") + 1,
                        })
                        frontend_files.add(rel_path)
                        break

        return BridgeResult(
            bridge_type="url",
            identifier=",".join(backend_urls[:3]),
            frontend_files=sorted(frontend_files),
            matches=matches,
        )


class MessageTypeBridge(Bridge):
    """通过 WebSocket 消息类型匹配前后端。"""

    def bridge(
        self,
        project: str,
        identifiers: list[str],
        backend_files: list[str],
    ) -> BridgeResult:
        message_types = identifiers
        matches: list[dict] = []
        frontend_files: set[str] = set()

        for _, rel_path, content in walk_frontend_files(project):
            for msg_type in message_types:
                if re.search(re.escape(msg_type), content):
                    matches.append({
                        "message_type": msg_type,
                        "frontend_file": rel_path,
                    })
                    frontend_files.add(rel_path)

        return BridgeResult(
            bridge_type="message_type",
            identifier=",".join(message_types[:3]),
            frontend_files=sorted(frontend_files),
            matches=matches,
        )


class IPCBridge(Bridge):
    """通过 Electron IPC 通道名匹配前后端。"""

    def bridge(
        self,
        project: str,
        identifiers: list[str],
        backend_files: list[str],
    ) -> BridgeResult:
        channels = identifiers
        matches: list[dict] = []
        frontend_files: set[str] = set()

        for _, rel_path, content in walk_frontend_files(project):
            has_ipc = "ipcRenderer" in content or "invoke" in content
            if not has_ipc:
                continue
            for ch in channels:
                if re.search(rf"\b{re.escape(ch)}\b", content):
                    matches.append({
                        "channel": ch,
                        "frontend_file": rel_path,
                    })
                    frontend_files.add(rel_path)

        return BridgeResult(
            bridge_type="ipc_channel",
            identifier=",".join(channels[:3]),
            frontend_files=sorted(frontend_files),
            matches=matches,
        )


# ── Bridge 注册表 ─────────────────────────────────────────────────────

BRIDGES: dict[str, Bridge] = {
    "http": URLBridge(),
    "ws_message": MessageTypeBridge(),
    "ipc": IPCBridge(),
}


# ── 内部工具函数 ──────────────────────────────────────────────────────

def _normalize_url(url: str) -> str:
    if url.startswith("/api"):
        return url
    if url.startswith("/"):
        return f"/api{url}"
    return url


def _match_url(front_url: str, back_url: str) -> bool:
    nf = re.sub(r":(\w+)", r"{\1}", front_url).rstrip("/")
    nb = back_url.rstrip("/")

    if nf == nb:
        return True

    fp = nf.split("/")
    bp = nb.split("/")
    if len(fp) != len(bp):
        return False
    return all(
        a.startswith("{") or b.startswith("{") or a == b
        for a, b in zip(fp, bp)
    )
