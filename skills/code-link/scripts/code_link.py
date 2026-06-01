#!/usr/bin/env python3
"""
code_link.py — 从入口点出发，串联前后端所有相关代码文件。

用法：
  python3 code_link.py --project /path/to/project --entry "/api/task/runs"
  python3 code_link.py --project /path/to/project --entry "session.create"
  python3 code_link.py --project /path/to/project --entry "TaskRunService.cancel_run"
  python3 code_link.py --project /path/to/project --entry "/api/task/runs" --bridge both
  python3 code_link.py --project /path/to/project --entry "/api/task/runs" --bridge backend

graph.db 生命周期管理：
  - 首次使用自动 build（全量解析）
  - build 后自动启动 watch（后台监听文件变化，增量更新）
  - 后续使用检测 watch 进程，未运行则自动重启

输出：JSON 格式的完整文件列表。
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from entry_resolvers import auto_detect, classify_query
from graph_tracer import GraphTracer
from bridge import BRIDGES

logger = logging.getLogger("code_link")


def _resolve_handler_qn(tracer: GraphTracer, handler: str, file_path: str, project: str) -> str | None:
    """将 handler 名称解析为 graph 中的 qualified_name。"""
    abs_file = os.path.join(project, file_path)

    # 1. 直接尝试 file::handler
    qn = f"{abs_file}::{handler}"
    if tracer.find_node(qn):
        return qn

    # 2. this.xxx.yyy → 去掉 this. 后搜索
    clean = handler
    if clean.startswith("this."):
        clean = clean[5:]

    # 3. xxx.yyy → 搜索 ClassName.method（含驼峰匹配）
    if "." in clean:
        parts = clean.split(".")
        method = parts[-1]
        candidates = tracer.search_nodes(method, limit=50)
        for c in candidates:
            cq = c["qualified_name"]
            if file_path in cq and cq.endswith(f"::{method}"):
                return cq
        class_part = parts[0]
        pascal = class_part[0].upper() + class_part[1:]
        for c in candidates:
            cq = c["qualified_name"]
            if f"::{class_part}.{method}" in cq or f"::{pascal}.{method}" in cq:
                return cq

    # 4. 直接搜索函数名
    node = tracer.find_node(handler)
    if node:
        return node["qualified_name"]

    # 5. 文件 + 简单名
    qn = f"{abs_file}::{handler}"
    node = tracer.find_node(qn)
    if node:
        return node["qualified_name"]

    logger.debug("Could not resolve handler %s in %s", handler, file_path)
    return None


def _pid_is_running(pid: int) -> bool:
    """检查指定 PID 的进程是否仍在运行。"""
    try:
        os.kill(pid, 0)  # signal 0: 不发信号，只检查存在性
        return True
    except (OSError, ProcessLookupError):
        return False


def _watch_pid_file(project: str) -> Path:
    """返回 watch 进程的 PID 文件路径。"""
    return Path(project) / ".code-review-graph" / ".watch.pid"


def ensure_watch_running(project: str) -> None:
    """确保 code-review-graph watch 进程正在运行。

    通过 PID 文件跟踪进程状态：
    - PID 文件存在且进程存活 → 已在监听，跳过
    - PID 文件不存在或进程已死 → 启动新的 watch 进程
    """
    pid_file = _watch_pid_file(project)

    # 检查已有 watch 进程
    if pid_file.exists():
        try:
            old_pid = int(pid_file.read_text().strip())
            if _pid_is_running(old_pid):
                logger.debug("Watch already running (pid=%d)", old_pid)
                return
            else:
                logger.debug("Watch pid=%d is dead, restarting", old_pid)
        except (ValueError, OSError):
            logger.debug("Invalid pid file, restarting watch")

    # 启动 watch 进程（后台，脱离终端）
    logger.info("Starting code-review-graph watch for %s...", project)
    try:
        proc = subprocess.Popen(
            ["code-review-graph", "watch", "--repo", project],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,  # 脱离父进程会话
        )
        pid_file.write_text(str(proc.pid))
        logger.info("Watch started (pid=%d)", proc.pid)
    except FileNotFoundError:
        logger.warning("code-review-graph not found, skipping watch")
    except Exception as e:
        logger.warning("Failed to start watch: %s", e)


def ensure_graph_built(project: str) -> None:
    """确保 code-review-graph 已构建，并启动后台监听。

    流程：
    1. graph.db 不存在 → 全量 build
    2. graph.db 存在但为空（0 nodes）→ 重新 build
    3. build 完成后 → 确保 watch 进程运行
    """
    db_path = Path(project) / ".code-review-graph" / "graph.db"
    need_build = False

    if not db_path.exists():
        need_build = True
    else:
        # 检查 db 是否为空（可能 build 过但没数据）
        try:
            import sqlite3
            conn = sqlite3.connect(str(db_path))
            count = conn.execute("SELECT count(*) FROM nodes").fetchone()[0]
            conn.close()
            if count == 0:
                need_build = True
        except Exception:
            need_build = True

    if need_build:
        logger.info("Building code graph for %s...", project)
        try:
            result = subprocess.run(
                ["code-review-graph", "build", "--repo", project],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                logger.error("Graph build failed: %s", result.stderr)
                sys.exit(1)
        except subprocess.TimeoutExpired:
            logger.error("Graph build timed out after 120s")
            sys.exit(1)

    # 确保 watch 进程运行
    ensure_watch_running(project)

def _trace_by_resolver(
    resolvers: list, project: str, entry_query: str, tracer: GraphTracer, max_depth: int,
) -> tuple[set[str], list[str], list[dict], int]:
    """通过 EntryResolver 发现入口点并追踪调用链。

    Returns:
        (backend_files, identifiers, entry_points, trace_nodes)
    """
    backend_files: set[str] = set()
    identifiers: list[str] = []
    entry_points: list[dict] = []
    trace_nodes = 0

    for resolver in resolvers:
        matched = resolver.resolve(project, entry_query)
        if not matched:
            continue
        for ep in matched:
            ep_info = {"name": ep.name, "handler": ep.handler, "file": ep.file}
            if ep.method:
                ep_info["method"] = ep.method
            entry_points.append(ep_info)

            qn = _resolve_handler_qn(tracer, ep.handler, ep.file, project)
            if qn:
                r = tracer.trace_callees(qn, max_depth=max_depth)
                backend_files.update(r.files)
                trace_nodes += len(r.nodes)
            if ep.name:
                identifiers.append(ep.name)
        break

    return backend_files, identifiers, entry_points, trace_nodes


def _trace_direct(query: str, tracer: GraphTracer, max_depth: int) -> tuple[set[str], list[dict], int]:
    """直接搜索类名/方法名并追踪。

    Returns:
        (backend_files, entry_points, trace_nodes)
    """
    backend_files: set[str] = set()
    entry_points: list[dict] = []
    trace_nodes = 0

    node = tracer.find_node(query)
    if node:
        qn = node["qualified_name"]
        entry_points.append({"name": query, "handler": qn, "file": tracer._rel(node.get("file_path", ""))})
        r = tracer.trace_callees(qn, max_depth=max_depth)
        backend_files.update(r.files)
        trace_nodes = len(r.nodes)
    else:
        for c in tracer.search_nodes(query, limit=5):
            qn = c["qualified_name"]
            entry_points.append({"name": query, "handler": qn, "file": tracer._rel(c.get("file_path", "")), "kind": c.get("kind", "")})
            r = tracer.trace_callees(qn, max_depth=max_depth)
            backend_files.update(r.files)
            trace_nodes += len(r.nodes)

    return backend_files, entry_points, trace_nodes


def _bridge_and_expand(
    project: str, entry_type: str, identifiers: list[str],
    backend_files: list[str], tracer: GraphTracer, bridge_mode: str,
) -> tuple[list[str], list[dict]]:
    """桥接到前端并扩展 import 链。

    Returns:
        (frontend_files, frontend_matches)
    """
    bridge_impl = BRIDGES.get(entry_type)
    if not bridge_impl or not identifiers or bridge_mode not in ("both", "frontend"):
        return [], []

    bridge_result = bridge_impl.bridge(project, identifiers, backend_files)
    frontend_files = set(bridge_result.frontend_files)

    # 扩展 import 链
    for fe_file in list(frontend_files):
        frontend_files.update(tracer.trace_file_imports(fe_file))

    return sorted(frontend_files), bridge_result.matches


def trace(project: str, entry_query: str, bridge_mode: str = "both", max_depth: int = 4) -> dict:
    """核心追踪流程。"""
    resolvers = auto_detect(project)
    entry_type = classify_query(entry_query, resolvers)
    logger.debug("Detected entry_type=%s for query=%s", entry_type, entry_query)

    ensure_graph_built(project)

    with GraphTracer(project) as tracer:
        if entry_type in ("http", "ws_message", "ipc"):
            backend_files, identifiers, entry_points, trace_nodes = _trace_by_resolver(
                resolvers, project, entry_query, tracer, max_depth)
        elif entry_type == "direct":
            backend_files, entry_points, trace_nodes = _trace_direct(
                entry_query, tracer, max_depth)
            identifiers = []
        else:
            backend_files, entry_points, identifiers, trace_nodes = set(), [], [], 0

        sorted_backend = sorted(backend_files)
        frontend_files, frontend_matches = _bridge_and_expand(
            project, entry_type, identifiers, sorted_backend, tracer, bridge_mode)

    all_files = sorted(set(sorted_backend) | set(frontend_files))
    return {
        "project": project, "entry": entry_query, "entry_type": entry_type,
        "backend": {"files": sorted_backend, "entry_points": entry_points, "trace_nodes": trace_nodes},
        "frontend": {"files": frontend_files, "matches": frontend_matches},
        "all_files": all_files,
        "stats": {
            "total_files": len(all_files),
            "backend_files": len(sorted_backend),
            "frontend_files": len(frontend_files),
            "trace_nodes": trace_nodes,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="从入口点出发，串联前后端所有相关代码文件")
    parser.add_argument("--project", required=True, help="项目根目录")
    parser.add_argument("--entry", required=True, help="入口查询")
    parser.add_argument("--bridge", choices=["both", "backend", "frontend"], default="both")
    parser.add_argument("--max-depth", type=int, default=4, help="追踪深度")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG, format="%(name)s: %(message)s", stream=sys.stderr)
    else:
        logging.basicConfig(level=logging.WARNING, stream=sys.stderr)

    if not os.path.isdir(args.project):
        parser.error(f"Project directory does not exist: {args.project}")

    try:
        result = trace(args.project, args.entry, args.bridge, args.max_depth)
    except Exception as e:
        logger.error("Trace failed: %s", e)
        sys.exit(1)

    if args.verbose:
        logger.info("Entry: %s (type=%s)", result["entry"], result["entry_type"])
        logger.info("Entry points: %d", len(result["backend"]["entry_points"]))
        logger.info("Backend files: %d", len(result["backend"]["files"]))
        logger.info("Frontend files: %d", len(result["frontend"]["files"]))
        logger.info("Bridge matches: %d", len(result["frontend"]["matches"]))

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
