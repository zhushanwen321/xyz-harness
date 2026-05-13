#!/usr/bin/env python3
"""
visual_diff.py — HTML demo vs Vue/React 组件的 computed style 结构化 diff

基于 Chrome DevTools Protocol 的 DOMSnapshot.captureSnapshot 输出格式。

用法：
  python3 visual_diff.py --expected expected_snapshot.json --actual actual_snapshot.json \
    [--threshold 2] [--output diff_report.json] [--verbose]

前置条件：
  通过 CDP DOMSnapshot.captureSnapshot 获取两个页面的快照：
  node cdp.js "$WS_URL" DOMSnapshot.captureSnapshot \
    '{"computedStyles":["color","background-color","font-size","font-weight","font-family",
    "padding-top","padding-right","padding-bottom","padding-left",
    "margin-top","margin-right","margin-bottom","margin-left",
    "border-top-left-radius","border-bottom-right-radius",
    "width","height","gap","display","flex-direction","justify-content","align-items",
    "opacity","box-shadow","text-align","line-height","letter-spacing"],
    "includeDOMRects":true,"includePaintOrder":true}' > snapshot.json
"""

import json
import argparse
import sys
from typing import Any

# 差异阈值（px），小于此值的 spacing 差异标为 low
DEFAULT_THRESHOLD_PX = 2

# 最小可见尺寸（px），小于此值的元素视为不可见，跳过
MIN_VISIBLE_SIZE = 2


def parse_px(value: str) -> float | None:
    """解析 CSS 像素值，如 '16px' -> 16.0"""
    if not value or value in ("auto", "none", "normal", "inherit", "initial", ""):
        return None
    value = value.strip()
    if value.endswith("px"):
        try:
            return float(value[:-2])
        except ValueError:
            return None
    return None


def resolve_string(strings: list[str], index: int) -> str:
    """从全局 strings 表解析字符串索引"""
    if index is None or index < 0 or index >= len(strings):
        return ""
    return strings[index]


def diff_property(prop: str, expected: str, actual: str, threshold_px: float) -> dict | None:
    """对比单个 CSS 属性，返回差异描述或 None"""
    if expected == actual:
        return None

    severity = "medium"

    # 像素值差异分级
    expected_px = parse_px(expected)
    actual_px = parse_px(actual)
    if expected_px is not None and actual_px is not None:
        diff = abs(expected_px - actual_px)
        if diff <= threshold_px:
            severity = "low"
        elif diff > 8:
            severity = "high"

    # 颜色差异默认 high
    if "color" in prop.lower():
        severity = "high"

    return {
        "property": prop,
        "expected": expected,
        "actual": actual,
        "severity": severity,
    }


def extract_visible_elements(snapshot: dict) -> list[dict]:
    """
    从 CDP captureSnapshot 输出提取可视元素及其 computed styles。

    CDP 返回结构：
    {
      "documents": [DocumentSnapshot, ...],
      "strings": ["...", ...],
      ...
    }

    DocumentSnapshot:
      "nodes": NodeTreeSnapshot (parentIndex[], nodeType[], nodeName[], attributes[], ...)
      "layout": LayoutTreeSnapshot (nodeIndex[], styles[], bounds[], text[], ...)

    LayoutTreeSnapshot.styles 的每个元素是 ArrayOfStrings (int[])，
    两两一组 (name_index, value_index) 指向 strings 表。

    LayoutTreeSnapshot.bounds 的每个元素是 Rectangle (数组 [x1, y1, x2, y2])。
    """
    strings = snapshot.get("strings", [])
    documents = snapshot.get("documents", [])

    if not documents or not strings:
        return []

    elements = []

    for doc in documents:
        layout = doc.get("layout", {})
        nodes = doc.get("nodes", {})

        # Layout 表的列（平行数组）
        layout_node_indices = layout.get("nodeIndex", [])
        layout_styles = layout.get("styles", [])
        layout_bounds = layout.get("bounds", [])
        layout_text = layout.get("text", [])

        # Nodes 表的列（平行数组）
        node_names = nodes.get("nodeName", [])
        node_types = nodes.get("nodeType", [])
        node_attributes = nodes.get("attributes", [])

        for i in range(len(layout_node_indices)):
            # bounds 过滤：跳过不可见元素
            bounds = layout_bounds[i] if i < len(layout_bounds) else None
            if bounds and len(bounds) >= 4:
                x1, y1, x2, y2 = bounds[0], bounds[1], bounds[2], bounds[3]
                width = x2 - x1
                height = y2 - y1
                if width < MIN_VISIBLE_SIZE or height < MIN_VISIBLE_SIZE:
                    continue
            elif bounds is not None:
                continue

            # 获取对应的 DOM node 信息
            dom_node_idx = layout_node_indices[i]
            node_name = ""
            attrs = {}
            if dom_node_idx is not None and 0 <= dom_node_idx < len(node_names or []):
                node_name = resolve_string(strings, node_names[dom_node_idx])
                # 解析属性
                attr_list = node_attributes[dom_node_idx] if dom_node_idx < len(node_attributes or []) else None
                if attr_list:
                    for j in range(0, len(attr_list) - 1, 2):
                        k = resolve_string(strings, attr_list[j])
                        v = resolve_string(strings, attr_list[j + 1])
                        if k:
                            attrs[k] = v

            # 获取文本内容
            text_content = ""
            if i < len(layout_text):
                text_idx = layout_text[i]
                if text_idx is not None:
                    text_content = resolve_string(strings, text_idx)

            # 也从 DOM 子节点收集文本（对于非 layout text 的元素）
            if not text_content and dom_node_idx is not None:
                node_values = nodes.get("nodeValue", [])
                if dom_node_idx < len(node_values or []):
                    nv_idx = node_values[dom_node_idx]
                    if nv_idx is not None:
                        text_content = resolve_string(strings, nv_idx)

            # 解析 computed styles
            # styles[i] 是 ArrayOfStrings: [name_idx, value_idx, name_idx, value_idx, ...]
            computed = {}
            style_pairs = layout_styles[i] if i < len(layout_styles) else None
            if style_pairs:
                for j in range(0, len(style_pairs) - 1, 2):
                    prop_name = resolve_string(strings, style_pairs[j])
                    prop_value = resolve_string(strings, style_pairs[j + 1])
                    if prop_name and prop_value:
                        computed[prop_name] = prop_value

            if not computed:
                continue

            # 提取元素角色描述（用于人类可读的匹配标识）
            role = node_name.lower()
            class_name = attrs.get("class", "")
            aria_label = attrs.get("aria-label", "")

            elements.append({
                "index": i,
                "dom_node_index": dom_node_idx,
                "node_name": node_name,
                "role": role,
                "text": (text_content or "")[:80].strip(),
                "class": class_name[:60],
                "aria_label": aria_label[:40],
                "styles": computed,
                "visible": True,
            })

    return elements


def match_elements(expected_elements: list[dict], actual_elements: list[dict]) -> list[tuple]:
    """
    按 role + text 匹配两个页面的可视元素。
    HTML demo 和 Vue 组件的 DOM 结构不同，但相同 role + text 的元素应对应。

    匹配优先级：
    1. role + text 精确匹配（如 BUTTON + "登录"）
    2. role + text 子串匹配（如 BUTTON + "Login" in "Login Now"）
    3. role 匹配 + 位置（同 role 的第 N 个）
    """
    matches = []
    used_actual = set()

    # Pass 1: role + text 精确匹配
    for exp in expected_elements:
        if not exp["text"]:
            continue
        for j, act in enumerate(actual_elements):
            if j in used_actual:
                continue
            if exp["role"] == act["role"] and exp["text"] == act["text"]:
                matches.append((exp, act))
                used_actual.add(j)
                break

    # Pass 2: role + text 子串匹配
    remaining_expected = [e for e in expected_elements if not any(e is m[0] for m in matches)]
    for exp in remaining_expected:
        if not exp["text"]:
            continue
        for j, act in enumerate(actual_elements):
            if j in used_actual:
                continue
            if exp["role"] == act["role"]:
                if exp["text"] in act["text"] or act["text"] in exp["text"]:
                    matches.append((exp, act))
                    used_actual.add(j)
                    break

    # Pass 3: role 匹配（同 role 按出现顺序配对）
    remaining_expected = [e for e in expected_elements if not any(e is m[0] for m in matches)]
    role_counters = {}  # role -> count of matched so far
    for exp in remaining_expected:
        role = exp["role"]
        if role not in role_counters:
            role_counters[role] = 0
        pos = role_counters[role]
        candidates = [(j, act) for j, act in enumerate(actual_elements)
                       if j not in used_actual and act["role"] == role]
        if pos < len(candidates):
            j, act = candidates[pos]
            matches.append((exp, act))
            used_actual.add(j)
        role_counters[role] = pos + 1

    return matches


def describe_element(elem: dict) -> str:
    """生成人类可读的元素描述"""
    parts = [elem["node_name"]]
    if elem["text"]:
        parts.append(f"[{elem['text'][:25]}]")
    if elem["class"]:
        # 取第一个 class
        first_class = elem["class"].split()[0] if elem["class"] else ""
        if first_class:
            parts.append(f".{first_class}")
    return "".join(parts)


def compute_diff(
    expected_file: str,
    actual_file: str,
    threshold_px: float = DEFAULT_THRESHOLD_PX,
    verbose: bool = False,
) -> dict:
    """主函数：计算两个页面快照的结构化差异"""

    with open(expected_file) as f:
        expected_snapshot = json.load(f)
    with open(actual_file) as f:
        actual_snapshot = json.load(f)

    expected_elements = extract_visible_elements(expected_snapshot)
    actual_elements = extract_visible_elements(actual_snapshot)

    if verbose:
        print(f"Expected page: {len(expected_elements)} visible elements", file=sys.stderr)
        print(f"Actual page: {len(actual_elements)} visible elements", file=sys.stderr)

    matches = match_elements(expected_elements, actual_elements)

    if verbose:
        print(f"Matched: {len(matches)} pairs", file=sys.stderr)

    diffs = []
    for exp, act in matches:
        exp_styles = exp["styles"]
        act_styles = act["styles"]

        # 对比共有的属性
        all_props = set(exp_styles.keys()) | set(act_styles.keys())
        for prop in all_props:
            exp_val = exp_styles.get(prop, "")
            act_val = act_styles.get(prop, "")

            # 两方都没有值 → 跳过
            if not exp_val and not act_val:
                continue

            # 一方缺失
            if not exp_val or not act_val:
                diffs.append({
                    "element": describe_element(exp),
                    "property": prop,
                    "expected": exp_val or "(missing)",
                    "actual": act_val or "(missing)",
                    "severity": "medium",
                })
                continue

            # 两方都有值，计算差异
            diff = diff_property(prop, exp_val, act_val, threshold_px)
            if diff:
                diff["element"] = describe_element(exp)
                diffs.append(diff)

    # 按 severity 排序：high > medium > low
    severity_order = {"high": 0, "medium": 1, "low": 2}
    diffs.sort(key=lambda d: severity_order.get(d["severity"], 1))

    # 统计
    high = sum(1 for d in diffs if d["severity"] == "high")
    medium = sum(1 for d in diffs if d["severity"] == "medium")
    low = sum(1 for d in diffs if d["severity"] == "low")

    # 未匹配的元素
    matched_expected = {id(exp) for exp, _ in matches}
    matched_actual = {id(act) for _, act in matches}

    missing_in_actual = [
        describe_element(exp) for exp in expected_elements
        if id(exp) not in matched_expected
    ][:30]

    extra_in_actual = [
        describe_element(act) for act in actual_elements
        if id(act) not in matched_actual
    ][:30]

    return {
        "summary": {
            "expected_elements": len(expected_elements),
            "actual_elements": len(actual_elements),
            "matches": len(matches),
            "total_diffs": len(diffs),
            "high": high,
            "medium": medium,
            "low": low,
        },
        "diffs": diffs,
        "missing_in_actual": missing_in_actual,
        "extra_in_actual": extra_in_actual,
    }


def main():
    parser = argparse.ArgumentParser(
        description="HTML demo vs Vue/React computed style diff (CDP captureSnapshot based)"
    )
    parser.add_argument("--expected", required=True,
                        help="Expected snapshot JSON (from HTML demo, CDP captureSnapshot output)")
    parser.add_argument("--actual", required=True,
                        help="Actual snapshot JSON (from component page, CDP captureSnapshot output)")
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD_PX,
                        help=f"Pixel threshold for low severity (default: {DEFAULT_THRESHOLD_PX})")
    parser.add_argument("--output", default="diff_report.json", help="Output file path")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print debug info to stderr")
    args = parser.parse_args()

    report = compute_diff(args.expected, args.actual, args.threshold, args.verbose)

    with open(args.output, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    s = report["summary"]
    print(f"Diff complete: {s['matches']} matched / {s['expected_elements']} expected / "
          f"{s['actual_elements']} actual")
    print(f"Diffs: {s['total_diffs']} total (H:{s['high']} M:{s['medium']} L:{s['low']})")
    print(f"Missing in actual: {len(report['missing_in_actual'])}")
    print(f"Extra in actual: {len(report['extra_in_actual'])}")
    print(f"Report: {args.output}")

    # 有 high 级别差异时返回非零 exit code
    if s["high"] > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
