"""GraphTracer — 封装 code-review-graph API，提供调用链追踪能力。"""

from __future__ import annotations

import os
import sqlite3
from collections import deque
from dataclasses import dataclass, field


# 模块级噪声名称集合（避免 BFS 中反复重建）
_NOISE_NAMES: frozenset[str] = frozenset({
    "String", "Number", "Boolean", "Array", "Object", "Map", "Set",
    "Promise", "console", "Math", "JSON", "Date", "Error",
    "parseInt", "parseFloat", "isNaN", "undefined", "null",
    "len", "str", "int", "float", "bool", "list", "dict", "set",
    "print", "range", "isinstance", "hasattr", "getattr", "setattr",
    "Exception", "ValueError", "TypeError", "KeyError",
    "Query", "Body", "Depends", "Path", "HTTPException",
    "Optional", "List", "Dict", "Union", "Any",
    "fromisoformat", "isoformat",
})


@dataclass
class TraceResult:
    """追踪结果。"""

    entry: str                       # 入口查询
    files: list[str] = field(default_factory=list)  # 涉及的文件（相对路径）
    nodes: list[dict] = field(default_factory=list)  # 涉及的节点信息
    call_chain: list[list[str]] = field(default_factory=list)  # 每层的调用链


class GraphTracer:
    """基于 code-review-graph 的 SQLite 数据库追踪调用链。

    不依赖 code-review-graph Python 包 — 直接读 .code-review-graph/graph.db，
    避免导入问题，且对 graph.db schema 无额外要求。
    """

    def __init__(self, project: str):
        self.project = project
        self.db_path = os.path.join(project, ".code-review-graph", "graph.db")
        self._conn: sqlite3.Connection | None = None

    # ── 生命周期 ──────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        if self._conn is None:
            if not os.path.exists(self.db_path):
                raise FileNotFoundError(
                    f"Graph database not found: {self.db_path}\n"
                    f"Run: code-review-graph build --repo {self.project}"
                )
            try:
                self._conn = sqlite3.connect(self.db_path)
                self._conn.row_factory = sqlite3.Row
            except sqlite3.OperationalError as e:
                raise RuntimeError(f"Failed to open graph database: {e}") from e
        return self._conn

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    def __enter__(self):
        self._connect()
        return self

    def __exit__(self, *_):
        self.close()

    # ── 基础查询 ──────────────────────────────────────────────────────

    def is_built(self) -> bool:
        return os.path.exists(self.db_path)

    def stats(self) -> dict:
        try:
            conn = self._connect()
            cur = conn.cursor()
            cur.execute("SELECT count(*) FROM nodes")
            total = cur.fetchone()[0]
            cur.execute("SELECT language, count(*) FROM nodes GROUP BY language ORDER BY count(*) DESC")
            langs = {row[0]: row[1] for row in cur.fetchall()}
            cur.execute("SELECT count(*) FROM edges")
            edges = cur.fetchone()[0]
            return {"nodes": total, "edges": edges, "languages": langs}
        except sqlite3.OperationalError:
            return {"nodes": 0, "edges": 0, "languages": {}}

    def find_node(self, name: str) -> dict | None:
        """按名称查找节点（支持 qualified_name 和 name）。"""
        conn = self._connect()
        cur = conn.cursor()
        # 尝试精确匹配 qualified_name
        cur.execute("SELECT * FROM nodes WHERE qualified_name = ?", (name,))
        row = cur.fetchone()
        if row:
            return dict(row)
        # 按文件名::函数名
        cur.execute("SELECT * FROM nodes WHERE qualified_name LIKE ?", (f"%::{name}",))
        row = cur.fetchone()
        if row:
            return dict(row)
        # 按名称搜索
        cur.execute("SELECT * FROM nodes WHERE name = ? LIMIT 1", (name,))
        row = cur.fetchone()
        if row:
            return dict(row)
        return None

    def search_nodes(self, query: str, limit: int = 10) -> list[dict]:
        """模糊搜索节点。"""
        conn = self._connect()
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM nodes WHERE name LIKE ? OR qualified_name LIKE ? LIMIT ?",
            (f"%{query}%", f"%{query}%", limit),
        )
        return [dict(row) for row in cur.fetchall()]

    # ── 调用链追踪（核心） ───────────────────────────────────────────

    def trace_callees(
        self,
        qualified_name: str,
        max_depth: int = 4,
        max_files: int = 100,
    ) -> TraceResult:
        """从指定节点出发，BFS 追踪 callees 直到 max_depth。"""
        node = self.find_node(qualified_name)
        if not node:
            return TraceResult(entry=qualified_name)

        visited_nodes: set[str] = set()
        files: set[str] = set()
        all_nodes: list[dict] = [node]
        chain_layers: list[list[str]] = []

        qn = node["qualified_name"]
        visited_nodes.add(qn)
        if node.get("file_path"):
            files.add(self._rel(node["file_path"]))

        queue: deque[tuple[str, int]] = deque([(qn, 0)])
        while queue and len(files) < max_files:
            current, depth = queue.popleft()
            if depth >= max_depth:
                continue
            layer = self._expand_callees(current, visited_nodes, all_nodes, files)
            if layer:
                chain_layers.append(layer)
                for target_qn in layer:
                    queue.append((target_qn, depth + 1))

        return TraceResult(entry=qualified_name, files=sorted(files), nodes=all_nodes, call_chain=chain_layers)

    def _expand_callees(
        self,
        current: str,
        visited_nodes: set[str],
        all_nodes: list[dict],
        files: set[str],
    ) -> list[str]:
        """从 current 节点展开一层 callees，返回新发现的节点 qualified_name 列表。"""
        conn = self._connect()
        cur = conn.cursor()
        cur.execute(
            "SELECT target_qualified FROM edges WHERE source_qualified = ? AND kind = 'CALLS'",
            (current,),
        )
        layer: list[str] = []
        for row in cur.fetchall():
            target_qn = row[0]
            if target_qn in visited_nodes or self._is_noise(target_qn):
                continue
            visited_nodes.add(target_qn)
            target_node = self.find_node(target_qn)
            if target_node:
                all_nodes.append(target_node)
                if target_node.get("file_path"):
                    files.add(self._rel(target_node["file_path"]))
                layer.append(target_qn)
        return layer

    def trace_callers(self, qualified_name: str, max_depth: int = 2) -> TraceResult:
        """从指定节点出发，反向追踪 callers。"""
        conn = self._connect()
        cur = conn.cursor()

        visited_nodes: set[str] = set()
        files: set[str] = set()
        all_nodes: list[dict] = []

        node = self.find_node(qualified_name)
        if not node:
            return TraceResult(entry=qualified_name)

        qn = node["qualified_name"]
        visited_nodes.add(qn)
        if node.get("file_path"):
            files.add(self._rel(node["file_path"]))
        all_nodes.append(node)

        queue: deque[tuple[str, int]] = deque([(qn, 0)])
        while queue:
            current, depth = queue.popleft()
            if depth >= max_depth:
                continue

            cur.execute(
                "SELECT source_qualified FROM edges WHERE target_qualified = ? AND kind = 'CALLS'",
                (current,),
            )
            for row in cur.fetchall():
                source_qn = row[0]
                if source_qn in visited_nodes or self._is_noise(source_qn):
                    continue
                visited_nodes.add(source_qn)
                source_node = self.find_node(source_qn)
                if source_node:
                    all_nodes.append(source_node)
                    if source_node.get("file_path"):
                        files.add(self._rel(source_node["file_path"]))
                    queue.append((source_qn, depth + 1))

        return TraceResult(
            entry=qualified_name,
            files=sorted(files),
            nodes=all_nodes,
        )

    def trace_file_imports(self, file_path: str) -> list[str]:
        """追踪一个文件 import 的所有其他文件。"""
        conn = self._connect()
        cur = conn.cursor()
        abs_path = os.path.join(self.project, file_path) if not os.path.isabs(file_path) else file_path

        cur.execute(
            "SELECT target_qualified FROM edges WHERE source_qualified LIKE ? AND kind = 'IMPORTS_FROM'",
            (f"{abs_path}%",),
        )
        targets = set()
        for row in cur.fetchall():
            target = row[0]
            node = self.find_node(target)
            if node and node.get("file_path"):
                targets.add(self._rel(node["file_path"]))
        return sorted(targets)

    # ── 内部工具 ──────────────────────────────────────────────────────

    def _rel(self, abs_path: str) -> str:
        """绝对路径 → 相对于项目根的路径。"""
        try:
            return os.path.relpath(abs_path, self.project)
        except ValueError:
            return abs_path

    @staticmethod
    def _is_noise(qualified_name: str) -> bool:
        """过滤常见噪声节点（内置类型、控制流等）。"""
        name = qualified_name.split("::")[-1] if "::" in qualified_name else qualified_name
        return name in _NOISE_NAMES or name.startswith("__")
