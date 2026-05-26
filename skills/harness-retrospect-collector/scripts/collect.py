#!/usr/bin/env python3
"""
Harness Retrospect Collector — 扫描、吸收、聚合 xyz-harness 复盘文件。

Usage:
    # 扫描未吸收
    python3 collect.py --root .xyz-harness/

    # 列出全部（含已吸收）
    python3 collect.py --root .xyz-harness/ --all

    # 标记吸收
    python3 collect.py --root .xyz-harness/ \
        --absorb path/to/retrospect.md --summary "已整合"

    # 聚合 harness_issues
    python3 collect.py --root .xyz-harness/ --aggregate

    # JSON 输出
    python3 collect.py --root .xyz-harness/ --json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import date
from pathlib import Path
from typing import Any

import yaml


# ---------------------------------------------------------------------------
# 自定义异常
# ---------------------------------------------------------------------------

class AbsorbError(Exception):
    """吸收操作失败时抛出。"""


# ---------------------------------------------------------------------------
# YAML frontmatter 解析
# ---------------------------------------------------------------------------

def parse_frontmatter(text: str) -> tuple[dict[str, Any], str, str]:
    """解析 markdown 文件的 YAML frontmatter。

    返回 (metadata, frontmatter_raw, body)。
    无 frontmatter 时 metadata 为空 dict。
    """
    pattern = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
    m = pattern.match(text)
    if not m:
        return {}, "", text
    raw = m.group(1)
    body = text[m.end():]
    try:
        meta = yaml.safe_load(raw) or {}
    except yaml.YAMLError:
        meta = {}
    return meta, raw, body


def write_frontmatter(path: Path, meta: dict[str, Any], body: str) -> None:
    """将 meta + body 原子写回文件，保留可读的 YAML frontmatter。"""
    header = yaml.dump(meta, allow_unicode=True, default_flow_style=False, sort_keys=False)
    new_content = f"---\n{header}---\n{body}"
    tmp_fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".md.tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            f.write(new_content)
        os.replace(tmp_path, path)
    except Exception:
        # 清理残留临时文件
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------------------
# 扫描
# ---------------------------------------------------------------------------

def find_retrospects(root: Path) -> list[Path]:
    """递归查找所有 *retrospect*.md 文件。"""
    results: list[Path] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for fname in filenames:
            if "retrospect" in fname.lower() and fname.endswith(".md"):
                results.append(Path(dirpath) / fname)
    results.sort()
    return results


def extract_phase(path: Path) -> str:
    """从文件名或路径推断 phase 名称。"""
    name = path.stem.lower()
    known = ["spec", "plan", "dev", "test", "overall", "pr"]
    for p in known:
        if p in name:
            if p == "overall":
                return "pr"  # overall_retrospect 属于 Phase 5
            return p
    return "unknown"


def extract_topic(path: Path, root: Path) -> str:
    """从路径提取 topic 目录名。"""
    try:
        rel = path.relative_to(root)
        parts = rel.parts
        # 第一段就是 topic 目录
        return parts[0] if parts else ""
    except ValueError:
        return ""


def scan_one(path: Path, root: Path) -> dict[str, Any]:
    """扫描单个文件，返回结构化记录。"""
    text = path.read_text(encoding="utf-8")
    meta, _raw, _body = parse_frontmatter(text)
    return {
        "file": str(path),
        "phase": meta.get("phase", extract_phase(path)),
        "topic": meta.get("topic", extract_topic(path, root)),
        "absorbed": meta.get("absorbed", False),
        "absorbed_date": meta.get("absorbed_date", ""),
        "absorption_summary": meta.get("absorption_summary", ""),
        "harness_issues": meta.get("harness_issues", []),
    }


# ---------------------------------------------------------------------------
# absorb
# ---------------------------------------------------------------------------

def absorb_file(path: Path, summary: str, today: date | None = None) -> None:
    """标记单个文件为已吸收。失败时抛出 AbsorbError。"""
    if not path.exists():
        raise AbsorbError(f"file not found: {path}")

    today = today or date.today()
    text = path.read_text(encoding="utf-8")
    meta, raw, body = parse_frontmatter(text)

    meta["absorbed"] = True
    meta["absorbed_date"] = today.isoformat()
    meta["absorption_summary"] = summary

    write_frontmatter(path, meta, body)
    print(f"Absorbed: {path}")


# ---------------------------------------------------------------------------
# aggregate
# ---------------------------------------------------------------------------

def normalize_issue(issue: str) -> str:
    """归一化 issue 文本用于去重比较。保留空格分隔，只去标点。"""
    if not isinstance(issue, str):
        issue = str(issue)
    return re.sub(r"[^\w\s]", "", issue.lower()).strip()


def aggregate_issues(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """聚合 harness_issues，去重并按频率降序排序。"""
    freq: dict[str, dict[str, Any]] = {}

    for rec in records:
        if rec.get("absorbed"):
            continue
        for issue in rec.get("harness_issues", []):
            key = normalize_issue(issue)
            if key not in freq:
                freq[key] = {
                    "issue": issue,  # 保留第一次出现的原文
                    "frequency": 0,
                    "sources": [],
                }
            freq[key]["frequency"] += 1
            # 只保留文件名，避免过长
            src = os.path.basename(rec["file"])
            if src not in freq[key]["sources"]:
                freq[key]["sources"].append(src)

    result = sorted(freq.values(), key=lambda x: x["frequency"], reverse=True)
    return result


# ---------------------------------------------------------------------------
# 输出格式化
# ---------------------------------------------------------------------------

def print_table(records: list[dict[str, Any]]) -> None:
    """默认表格输出。"""
    if not records:
        print("No retrospect files found.")
        return

    # 列宽
    w_file = max(len(os.path.basename(r["file"])) for r in records)
    w_file = max(w_file, len("File"))
    w_phase = 5
    w_topic = max(len(r["topic"]) for r in records)
    w_topic = max(w_topic, len("Topic"))
    w_issues = 7
    w_absorbed = 8

    header = (
        f"{'File':<{w_file}} | {'Phase':<{w_phase}} | "
        f"{'Topic':<{w_topic}} | {'Issues':>{w_issues}} | {'Absorbed':<{w_absorbed}}"
    )
    sep = "-" * len(header)
    print(header)
    print(sep)
    for r in records:
        fname = os.path.basename(r["file"])
        absorbed = str(r["absorbed"])
        issues_count = str(len(r.get("harness_issues", [])))
        print(
            f"{fname:<{w_file}} | {r['phase']:<{w_phase}} | "
            f"{r['topic']:<{w_topic}} | {issues_count:>{w_issues}} | {absorbed:<{w_absorbed}}"
        )


def print_aggregate(agg: list[dict[str, Any]]) -> None:
    """聚合表格输出。"""
    if not agg:
        print("No unabsorbed harness issues found.")
        return

    w_issue = max(len(a["issue"]) for a in agg)
    w_issue = max(w_issue, len("Issue"))
    w_freq = max(len(str(a["frequency"])) for a in agg)
    w_freq = max(w_freq, len("Freq"))

    header = f"{'Issue':<{w_issue}} | {'Freq':>{w_freq}} | Sources"
    sep = "-" * len(header)
    print(header)
    print(sep)
    for a in agg:
        sources = ", ".join(a["sources"])
        print(f"{a['issue']:<{w_issue}} | {a['frequency']:>{w_freq}} | {sources}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Harness Retrospect Collector — 扫描、吸收、聚合复盘文件"
    )
    parser.add_argument(
        "--root",
        default=".xyz-harness/",
        help="扫描根目录（默认 .xyz-harness/）",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="列出全部文件（含已吸收）",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="JSON 格式输出",
    )
    parser.add_argument(
        "--aggregate",
        action="store_true",
        help="聚合 harness_issues 并按频率排序",
    )
    parser.add_argument(
        "--absorb",
        nargs="+",
        help="标记指定文件为已吸收（可指定多个）",
    )
    parser.add_argument(
        "--summary",
        default="",
        help="吸收摘要（配合 --absorb 使用）",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f"ERROR: root is not a directory: {root}", file=sys.stderr)
        sys.exit(1)

    # --- absorb 模式 ---
    if args.absorb:
        if not args.summary:
            print("ERROR: --absorb 需要配合 --summary 使用", file=sys.stderr)
            sys.exit(1)
        for fpath in args.absorb:
            try:
                absorb_file(Path(fpath), args.summary)
            except AbsorbError as exc:
                print(f"ERROR: {exc}", file=sys.stderr)
                sys.exit(1)
        return

    # --- 扫描 ---
    files = find_retrospects(root)
    records = []
    for f in files:
        try:
            rec = scan_one(f, root)
            records.append(rec)
        except Exception as exc:
            print(f"WARN: skipping {f}: {exc}", file=sys.stderr)

    # --- aggregate 模式 ---
    if args.aggregate:
        # aggregate 需要全部 records（含已吸收），但 aggregate_issues 内部跳过已吸收
        # 复用已扫描的 records；若用了 --all，records 已含全部，否则补充已吸收的
        if args.all:
            all_records = records
        else:
            # records 已过滤掉已吸收，需要重新扫描包含已吸收的
            all_records = []
            for f in files:
                try:
                    all_records.append(scan_one(f, root))
                except Exception as exc:
                    print(f"WARN: skip {f}: {exc}", file=sys.stderr)
        agg = aggregate_issues(all_records)
        if args.json_output:
            print(json.dumps(agg, ensure_ascii=False, indent=2))
        else:
            print_aggregate(agg)
        return

    # 过滤已吸收（除非 --all）
    if not args.all:
        records = [r for r in records if not r["absorbed"]]

    # --- scan 模式 ---
    if args.json_output:
        print(json.dumps(records, ensure_ascii=False, indent=2))
    else:
        print_table(records)


if __name__ == "__main__":
    main()
