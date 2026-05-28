#!/usr/bin/env python3
"""
Harness Gate Check — Standalone executable validation script.

Usage:
    python3 check_gate.py <topic_dir> <phase_number>

Example:
    python3 check_gate.py .xyz-harness/2026-05-17-system-setting 2

Exit code:
    0 = all checks passed
    1 = one or more checks failed
"""

import json
import os
import subprocess
import sys
import yaml
import glob

PASS = "✅ PASS"
FAIL = "❌ FAIL"


def check_untracked_files(topic_dir, checks):
    """Check for git-untracked files in critical project directories.

    Scans the whole repo for files not tracked by git. Files under
    .xyz-harness/ and docs/ are treated as FAIL (critical artifacts
    must be committed). Other untracked files are informational only.
    """
    abs_topic = os.path.abspath(topic_dir)
    cwd = abs_topic if os.path.isdir(abs_topic) else os.path.dirname(abs_topic)

    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=cwd,
            capture_output=True, text=True, timeout=30,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        checks.append(("untracked files", FAIL, f"git status error: {e}"))
        return

    if result.returncode != 0:
        checks.append(("untracked files", FAIL, f"git status failed: {result.stderr.strip()}"))
        return

    untracked = [
        line[3:].strip()
        for line in result.stdout.splitlines()
        if line.startswith("?? ")
    ]

    if not untracked:
        checks.append(("untracked files", PASS, "all files tracked"))
        return

    critical_prefixes = (".xyz-harness/", "docs/")
    critical = [f for f in untracked if any(f.startswith(p) for p in critical_prefixes)]
    other = [f for f in untracked if not any(f.startswith(p) for p in critical_prefixes)]

    if critical:
        display = critical[:10]
        suffix = f" (+{len(critical) - 10} more)" if len(critical) > 10 else ""
        checks.append((
            "untracked files (critical)",
            FAIL,
            f"{len(critical)} untracked in .xyz-harness/ or docs/: {', '.join(display)}{suffix}",
        ))
    else:
        checks.append(("untracked files (critical)", PASS, ".xyz-harness/ and docs/ fully tracked"))

    if other:
        display = other[:5]
        suffix = f" (+{len(other) - 5} more)" if len(other) > 5 else ""
        checks.append((
            "untracked files (other)",
            PASS,
            f"{len(other)} other untracked (non-blocking): {', '.join(display)}{suffix}",
        ))


def parse_yaml_frontmatter(filepath):
    """Parse YAML frontmatter from a markdown file.
    Returns (data, error) where data is the parsed dict or None.
    """
    if not os.path.exists(filepath):
        return None, "file not found"
    try:
        with open(filepath, encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        return None, f"cannot read: {e}"

    # Find first ---
    first = content.find("---")
    if first == -1:
        return None, "no YAML frontmatter (no opening ---)"

    # Find second --- after first
    second = content.find("---", first + 3)
    if second == -1:
        return None, "no YAML frontmatter (no closing ---)"

    yaml_text = content[first + 3:second].strip()
    if not yaml_text:
        return None, "YAML frontmatter is empty"

    try:
        data = yaml.safe_load(yaml_text)
        if data is None:
            return None, "YAML frontmatter parsed as None (empty)"
        return data, None
    except yaml.YAMLError as e:
        return None, f"YAML parse error: {e}"


def check_field_int(data, field, expected=None):
    """Check a field exists and equals expected value (int)."""
    if field not in data:
        return False, f"'{field}' field missing"
    val = data[field]
    if not isinstance(val, int):
        return False, f"'{field}' type={type(val).__name__}, expected int"
    if expected is not None and val != expected:
        return False, f"'{field}'={val}, expected {expected}"
    return True, f"'{field}'={val}"


def check_field_str(data, field, expected=None):
    """Check a field exists and equals expected value (str)."""
    if field not in data:
        return False, f"'{field}' field missing"
    val = data[field]
    if not isinstance(val, str):
        return False, f"'{field}' type={type(val).__name__}, expected str"
    if expected is not None and val != expected:
        return False, f"'{field}'={repr(val)}, expected {repr(expected)}"
    return True, f"'{field}'={repr(val)}"


def check_field_bool(data, field, expected=True):
    """Check a field exists and equals expected value (bool)."""
    if field not in data:
        return False, f"'{field}' field missing"
    val = data[field]
    if not isinstance(val, bool):
        return False, f"'{field}' type={type(val).__name__}, expected bool (not string)"
    if val is not expected:
        return False, f"'{field}'={val}, expected {expected}"
    return True, f"'{field}'={val}"


def find_latest_review(topic_dir, prefix):
    """Find the latest review file matching a prefix pattern."""
    pattern = os.path.join(topic_dir, "changes", "reviews", f"{prefix}*.md")
    files = sorted(glob.glob(pattern))
    if not files:
        return None
    return files[-1]



def _flatten_review_fields(data):
    """Try to extract verdict and must_fix from possibly nested frontmatter.
    Returns (verdict, must_fix) as (str|None, int|None).
    """
    # Try top-level first
    verdict = data.get("verdict") if isinstance(data, dict) else None
    must_fix = data.get("must_fix") if isinstance(data, dict) else None

    # Try nested: review.verdict
    if verdict is None and isinstance(data, dict) and "review" in data:
        review = data["review"]
        if isinstance(review, dict):
            verdict = review.get("verdict")

    if must_fix is None and isinstance(data, dict) and "review" in data:
        review = data["review"]
        if isinstance(review, dict):
            must_fix = review.get("must_fix")

    # Try nested: statistics.must_fix
    if must_fix is None and isinstance(data, dict) and "statistics" in data:
        stats = data["statistics"]
        if isinstance(stats, dict):
            must_fix = stats.get("must_fix")

    return verdict, must_fix


# ── Phase 1: Spec ──────────────────────────────────────────

def check_phase_1(topic_dir):
    checks = []

    # Pre-check: untracked files
    check_untracked_files(topic_dir, checks)

    # 1.1 spec.md exists
    spec_path = os.path.join(topic_dir, "spec.md")
    data, err = parse_yaml_frontmatter(spec_path)
    if err:
        checks.append(("spec.md", FAIL, err))
    else:
        ok, msg = check_field_str(data, "verdict")
        checks.append(("spec.md", PASS if ok else FAIL, msg))

    # 1.2 spec_review exists
    review_path = find_latest_review(topic_dir, "spec_review_v")
    if not review_path:
        checks.append(("spec_review", FAIL, "no spec_review_v*.md found"))
    else:
        data, err = parse_yaml_frontmatter(review_path)
        if err:
            checks.append(("spec_review", FAIL, err))
        else:
            verdict, must_fix = _flatten_review_fields(data)
            if verdict is None or not isinstance(verdict, str) or verdict != "pass":
                checks.append(("spec_review verdict", FAIL, f"'verdict'={repr(verdict)}, expected 'pass'"))
            else:
                checks.append(("spec_review verdict", PASS, f"'verdict'={repr(verdict)}"))
            if must_fix is None or not isinstance(must_fix, int) or must_fix != 0:
                checks.append(("spec_review must_fix", FAIL, f"'must_fix'={repr(must_fix)}, expected 0"))
            else:
                checks.append(("spec_review must_fix", PASS, f"'must_fix'={must_fix}"))

    return checks


def check_interface_chain_schema(topic_dir):
    """Validate interface_chain.json schema (only required for L2 complexity).
    Returns list of (name, status, detail) tuples.
    """
    checks = []
    ic_path = os.path.join(topic_dir, "interface_chain.json")

    if not os.path.exists(ic_path):
        checks.append(("interface_chain.json", FAIL, "file not found (required for L2)"))
        return checks

    # File size limit (prevent OOM on huge files)
    MAX_IC_SIZE = 2 * 1024 * 1024  # 2 MB
    file_size = os.path.getsize(ic_path)
    if file_size > MAX_IC_SIZE:
        checks.append(("interface_chain.json", FAIL, f"file too large ({file_size} bytes, max {MAX_IC_SIZE})"))
        return checks

    try:
        with open(ic_path, encoding='utf-8') as f:
            ic_data = json.load(f)
    except json.JSONDecodeError as e:
        checks.append(("interface_chain.json", FAIL, f"invalid JSON: {e}"))
        return checks

    # version field (string)
    if "version" not in ic_data:
        checks.append(("interface_chain version", FAIL, "'version' field missing"))
    elif not isinstance(ic_data["version"], str):
        checks.append(("interface_chain version", FAIL, f"'version' type={type(ic_data['version']).__name__}, expected str"))
    else:
        checks.append(("interface_chain version", PASS, f"'version'={repr(ic_data['version'])}"))

    # methods array (exists and non-empty)
    methods = ic_data.get("methods")
    if methods is None:
        checks.append(("interface_chain methods", FAIL, "'methods' field missing"))
    elif not isinstance(methods, list):
        checks.append(("interface_chain methods", FAIL, f"'methods' type={type(methods).__name__}, expected array"))
    elif len(methods) == 0:
        checks.append(("interface_chain methods", FAIL, "'methods' array is empty"))
    elif len(methods) > 500:
        checks.append(("interface_chain methods", FAIL, f"'methods' array too large ({len(methods)} items, max 500)"))
    else:
        method_errors = []
        required_method_fields = ("name", "class", "params", "returns")
        string_fields = ("name", "class", "returns")
        for i, m in enumerate(methods):
            if not isinstance(m, dict):
                method_errors.append(f"methods[{i}] type={type(m).__name__}, expected object")
                continue
            for field in required_method_fields:
                if field not in m:
                    method_errors.append(f"methods[{i}] missing '{field}'")
                elif field in string_fields and not isinstance(m[field], str):
                    method_errors.append(f"methods[{i}].{field} type={type(m[field]).__name__}, expected str")
        if method_errors:
            checks.append(("interface_chain methods", FAIL, "; ".join(method_errors)))
        else:
            checks.append(("interface_chain methods", PASS, f"{len(methods)} methods, all have name/class/params/returns"))

    # data_flows array (exists and non-empty)
    flows = ic_data.get("data_flows")
    if flows is None:
        checks.append(("interface_chain data_flows", FAIL, "'data_flows' field missing"))
    elif not isinstance(flows, list):
        checks.append(("interface_chain data_flows", FAIL, f"'data_flows' type={type(flows).__name__}, expected array"))
    elif len(flows) == 0:
        checks.append(("interface_chain data_flows", FAIL, "'data_flows' array is empty"))
    elif len(flows) > 200:
        checks.append(("interface_chain data_flows", FAIL, f"'data_flows' array too large ({len(flows)} items, max 200)"))
    else:
        flow_errors = []
        for i, df in enumerate(flows):
            if not isinstance(df, dict):
                flow_errors.append(f"data_flows[{i}] type={type(df).__name__}, expected object")
                continue
            if "id" not in df:
                flow_errors.append(f"data_flows[{i}] missing 'id'")
            if "chain" not in df:
                flow_errors.append(f"data_flows[{i}] missing 'chain'")
            elif not df["chain"]:
                flow_errors.append(f"data_flows[{i}] 'chain' is empty")
        if flow_errors:
            checks.append(("interface_chain data_flows", FAIL, "; ".join(flow_errors)))
        else:
            checks.append(("interface_chain data_flows", PASS, f"{len(flows)} data_flows, all have id/non-empty chain"))

    return checks


def validate_plan_bl_review(topic_dir, checks):
    """Check plan_bl_review only when plan.md complexity is L2."""
    plan_path = os.path.join(topic_dir, "plan.md")
    if not os.path.exists(plan_path):
        return

    data, err = parse_yaml_frontmatter(plan_path)
    if err:
        return

    complexity = data.get("complexity", "L1") if isinstance(data, dict) else "L1"
    if complexity != "L2":
        checks.append(("plan_bl_review", PASS, f"skipped (complexity={complexity})"))
        return

    review_path = find_latest_review(topic_dir, "plan_bl_review")
    if not review_path:
        checks.append(("plan_bl_review", FAIL, "no plan_bl_review*.md found"))
        return

    rdata, rerr = parse_yaml_frontmatter(review_path)
    if rerr:
        checks.append(("plan_bl_review", FAIL, rerr))
        return

    verdict, must_fix = _flatten_review_fields(rdata)
    if verdict is None or verdict != "pass":
        checks.append(("plan_bl_review", FAIL, f"verdict={repr(verdict)}, expected 'pass'"))
        return
    if must_fix is None or must_fix != 0:
        checks.append(("plan_bl_review must_fix", FAIL, f"must_fix={repr(must_fix)}, expected 0"))
        return
    checks.append(("plan_bl_review", PASS, "found, verdict=pass, must_fix=0"))


# ── Phase 2: Plan ──────────────────────────────────────────

def check_phase_2(topic_dir):
    checks = []

    # Pre-check: untracked files
    check_untracked_files(topic_dir, checks)

    # 2.1 plan.md
    plan_path = os.path.join(topic_dir, "plan.md")
    data, err = parse_yaml_frontmatter(plan_path)
    if err:
        checks.append(("plan.md", FAIL, err))
        plan_data = None
    else:
        ok, msg = check_field_str(data, "verdict", "pass")
        checks.append(("plan.md", PASS if ok else FAIL, msg))
        plan_data = data

    # 2.1b plan.md complexity field
    if plan_data is None:
        # plan.md itself failed to parse, skip complexity check
        pass
    elif "complexity" not in plan_data:
        checks.append(("plan.md complexity", PASS, "no complexity field (backward compat)"))
    elif plan_data["complexity"] not in ("L1", "L2"):
        checks.append(("plan.md complexity", FAIL, f"'complexity'={repr(plan_data['complexity'])}, expected 'L1' or 'L2'"))
    else:
        checks.append(("plan.md complexity", PASS, f"'complexity'={repr(plan_data['complexity'])}"))
        if plan_data["complexity"] == "L2":
            checks.extend(check_interface_chain_schema(topic_dir))

    # 2.2 e2e-test-plan.md
    e2e_path = os.path.join(topic_dir, "e2e-test-plan.md")
    data, err = parse_yaml_frontmatter(e2e_path)
    if err:
        checks.append(("e2e-test-plan.md", FAIL, err))
    else:
        ok, msg = check_field_str(data, "verdict", "pass")
        checks.append(("e2e-test-plan.md", PASS if ok else FAIL, msg))

    # 2.3 test_cases_template.json
    template_path = os.path.join(topic_dir, "test_cases_template.json")
    if not os.path.exists(template_path):
        checks.append(("test_cases_template.json", FAIL, "file not found"))
    else:
        try:
            with open(template_path, encoding="utf-8") as f:
                template = json.load(f)
        except json.JSONDecodeError as e:
            checks.append(("test_cases_template.json", FAIL, f"invalid JSON: {e}"))
        else:
            cases = template.get("test_cases", [])
            errors = []
            for i, c in enumerate(cases):
                for field in ("id", "type", "title"):
                    if field not in c:
                        errors.append(f"case[{i}] missing '{field}'")
            if errors:
                checks.append(("test_cases_template.json", FAIL, "; ".join(errors)))
            else:
                checks.append(("test_cases_template.json", PASS, f"{len(cases)} cases, all have id/type/title"))

    # 2.3b use-cases.md
    uc_path = os.path.join(topic_dir, "use-cases.md")
    data, err = parse_yaml_frontmatter(uc_path)
    if err:
        checks.append(("use-cases.md", FAIL, err))
    else:
        ok, msg = check_field_str(data, "verdict", "pass")
        checks.append(("use-cases.md", PASS if ok else FAIL, msg))

    # 2.3c non-functional-design.md
    nfd_path = os.path.join(topic_dir, "non-functional-design.md")
    data, err = parse_yaml_frontmatter(nfd_path)
    if err:
        checks.append(("non-functional-design.md", FAIL, err))
    else:
        ok, msg = check_field_str(data, "verdict", "pass")
        checks.append(("non-functional-design.md", PASS if ok else FAIL, msg))

    # 2.3d plan_bl_review (L2 only)
    validate_plan_bl_review(topic_dir, checks)

    # 2.4 plan_review
    review_path = find_latest_review(topic_dir, "plan_review_v")
    if not review_path:
        checks.append(("plan_review", FAIL, "no plan_review_v*.md found"))
    else:
        data, err = parse_yaml_frontmatter(review_path)
        if err:
            checks.append(("plan_review", FAIL, err))
        else:
            verdict, must_fix = _flatten_review_fields(data)
            # Check verdict
            if verdict is None or not isinstance(verdict, str) or verdict != "pass":
                checks.append(("plan_review verdict", FAIL, f"'verdict'={repr(verdict)}, expected 'pass'"))
            else:
                checks.append(("plan_review verdict", PASS, f"'verdict'={repr(verdict)}"))
            # Check must_fix
            if must_fix is None or not isinstance(must_fix, int) or must_fix != 0:
                checks.append(("plan_review must_fix", FAIL, f"'must_fix'={repr(must_fix)}, expected 0"))
            else:
                checks.append(("plan_review must_fix", PASS, f"'must_fix'={must_fix}"))

    return checks


# ── Phase 3: Dev ───────────────────────────────────────────

def validate_taste_review_exists(topic_dir, checks):
    """Ensure at least one taste review exists (ts_taste_review, rust_taste_review, or taste_review)."""
    ts_path = find_latest_review(topic_dir, "ts_taste_review")
    rust_path = find_latest_review(topic_dir, "rust_taste_review")
    generic_path = find_latest_review(topic_dir, "taste_review")
    found = ts_path or rust_path or generic_path
    if not found:
        checks.append(("taste_review", FAIL, "no taste review found (need at least one of: ts_taste_review, rust_taste_review, taste_review)"))
    else:
        name = os.path.basename(found).replace(".md", "")
        checks.append(("taste_review", PASS, f"{name} found"))


def validate_standards_linter(topic_dir, checks):
    """Check standards_review linter_passed and typecheck_passed fields."""
    review_path = find_latest_review(topic_dir, "standards_review")
    if not review_path:
        return  # absence handled by review check

    data, err = parse_yaml_frontmatter(review_path)
    if err:
        return  # parse errors handled by review check

    if not isinstance(data, dict):
        return

    if "linter_passed" in data:
        val = data["linter_passed"]
        if isinstance(val, bool) and not val:
            checks.append(("standards_review linter_passed", FAIL, "linter_passed=false"))
        else:
            checks.append(("standards_review linter_passed", PASS, f"linter_passed={val}"))

    if "typecheck_passed" in data:
        val = data["typecheck_passed"]
        if isinstance(val, bool) and not val:
            checks.append(("standards_review typecheck_passed", FAIL, "typecheck_passed=false"))
        else:
            checks.append(("standards_review typecheck_passed", PASS, f"typecheck_passed={val}"))


def check_phase_3(topic_dir):
    checks = []

    # Pre-check: untracked files
    check_untracked_files(topic_dir, checks)

    # Pre-checks
    validate_taste_review_exists(topic_dir, checks)
    validate_standards_linter(topic_dir, checks)

    # 3.1 test_results.md
    results_path = os.path.join(topic_dir, "changes", "evidence", "test_results.md")
    data, err = parse_yaml_frontmatter(results_path)
    if err:
        checks.append(("test_results.md", FAIL, err))
    else:
        ok1, msg1 = check_field_str(data, "verdict", "pass")
        ok2, msg2 = check_field_bool(data, "all_passing", True)
        checks.append(("test_results.md verdict", PASS if ok1 else FAIL, msg1))
        checks.append(("test_results.md all_passing", PASS if ok2 else FAIL, msg2))

        # Optional: linter_passed
        if "linter_passed" in data:
            ok3, msg3 = check_field_bool(data, "linter_passed", True)
            checks.append(("test_results.md linter_passed", PASS if ok3 else FAIL, msg3))
        else:
            checks.append(("test_results.md linter_passed", PASS, "optional 'linter_passed' skipped"))

        # Optional: typecheck_passed
        if "typecheck_passed" in data:
            ok4, msg4 = check_field_bool(data, "typecheck_passed", True)
            checks.append(("test_results.md typecheck_passed", PASS if ok4 else FAIL, msg4))
        else:
            checks.append(("test_results.md typecheck_passed", PASS, "optional 'typecheck_passed' skipped"))

    # 3.2 Required specialized reviews
    required_reviews = [
        "business_logic_review",
        "integration_review",
        "standards_review",
        "robustness_review",
    ]

    for prefix in required_reviews:
        review_path = find_latest_review(topic_dir, prefix)
        if not review_path:
            checks.append((prefix, FAIL, f"no {prefix}*.md found"))
        else:
            rdata, rerr = parse_yaml_frontmatter(review_path)
            if rerr:
                checks.append((prefix, FAIL, rerr))
            else:
                verdict, must_fix = _flatten_review_fields(rdata)
                if verdict is None:
                    checks.append((f"{prefix} verdict", FAIL, "'verdict' field missing (checked top-level and review.verdict)"))
                elif not isinstance(verdict, str) or verdict != "pass":
                    checks.append((f"{prefix} verdict", FAIL, f"'verdict'={repr(verdict)}, expected 'pass'"))
                else:
                    checks.append((f"{prefix} verdict", PASS, f"'verdict'={repr(verdict)}"))

                if must_fix is None:
                    checks.append((f"{prefix} must_fix", FAIL, "'must_fix' field missing (checked top-level and statistics.must_fix)"))
                elif not isinstance(must_fix, int) or must_fix != 0:
                    checks.append((f"{prefix} must_fix", FAIL, f"'must_fix'={must_fix}, expected 0"))
                else:
                    checks.append((f"{prefix} must_fix", PASS, f"'must_fix'={must_fix}"))

    # 3.3 Optional taste reviews (at least one must exist, enforced by pre-check)
    optional_taste_reviews = [
        "ts_taste_review",
        "rust_taste_review",
        "taste_review",
    ]

    for prefix in optional_taste_reviews:
        review_path = find_latest_review(topic_dir, prefix)
        if not review_path:
            checks.append((f"{prefix}*", PASS, f"{prefix}*.md not found (optional, skipped)"))
        else:
            rdata, rerr = parse_yaml_frontmatter(review_path)
            if rerr:
                checks.append((prefix, FAIL, rerr))
            else:
                review_name = os.path.basename(review_path).replace(".md", "")
                verdict, must_fix = _flatten_review_fields(rdata)
                if verdict is None:
                    checks.append((f"{review_name} verdict", FAIL, "'verdict' field missing (checked top-level and review.verdict)"))
                elif not isinstance(verdict, str) or verdict != "pass":
                    checks.append((f"{review_name} verdict", FAIL, f"'verdict'={repr(verdict)}, expected 'pass'"))
                else:
                    checks.append((f"{review_name} verdict", PASS, f"'verdict'={repr(verdict)}"))

                if must_fix is None:
                    checks.append((f"{review_name} must_fix", FAIL, "'must_fix' field missing (checked top-level and statistics.must_fix)"))
                elif not isinstance(must_fix, int) or must_fix != 0:
                    checks.append((f"{review_name} must_fix", FAIL, f"'must_fix'={must_fix}, expected 0"))
                else:
                    checks.append((f"{review_name} must_fix", PASS, f"'must_fix'={must_fix}"))

    return checks


# ── Phase 4: Test ──────────────────────────────────────────

def check_phase_4(topic_dir):
    checks = []

    # Pre-check: untracked files
    check_untracked_files(topic_dir, checks)

    # 4.1 test_cases_template.json 存在（用于跨引用）
    template_path = os.path.join(topic_dir, "test_cases_template.json")
    if not os.path.exists(template_path):
        checks.append(("test_cases_template.json", FAIL, "not found (needed for case ID cross-reference)"))
    else:
        try:
            with open(template_path, encoding="utf-8") as f:
                template = json.load(f)
            template_ids = set(c["id"] for c in template.get("test_cases", []))
            checks.append(("test_cases_template.json", PASS, f"{len(template_ids)} cases loaded for cross-ref"))
        except (json.JSONDecodeError, KeyError) as e:
            template_ids = set()
            checks.append(("test_cases_template.json", FAIL, f"invalid: {e}"))

    # 4.2 test_execution.json
    exec_path = os.path.join(topic_dir, "changes", "evidence", "test_execution.json")
    if not os.path.exists(exec_path):
        checks.append(("test_execution.json", FAIL, "file not found"))
        return checks

    try:
        with open(exec_path, encoding="utf-8") as f:
            execution = json.load(f)
    except json.JSONDecodeError as e:
        checks.append(("test_execution.json", FAIL, f"invalid JSON: {e}"))
        return checks

    # Extract execution records
    records = execution.get("test_execution", execution.get("execution", []))
    if not records:
        checks.append(("test_execution.json", FAIL, "no test_execution or execution array"))
        return checks

    # Check all records have required fields
    record_errors = []
    for i, rec in enumerate(records):
        if "caseId" not in rec:
            record_errors.append(f"record[{i}] missing 'caseId'")
        if "round" not in rec:
            record_errors.append(f"record[{i}] missing 'round'")
        if "passed" not in rec:
            record_errors.append(f"record[{i}] missing 'passed'")
        steps = rec.get("execute_steps", [])
        if not steps:
            record_errors.append(f"record[{i}] ('{rec.get('caseId', '?')}') execute_steps is empty")

    if record_errors:
        checks.append(("test_execution.json format", FAIL, "; ".join(record_errors)))
    else:
        checks.append(("test_execution.json format", PASS, f"{len(records)} records OK"))

    # Check all template case IDs are covered
    executed_ids = set(rec["caseId"] for rec in records if "caseId" in rec)
    missing_ids = template_ids - executed_ids if template_ids else set()
    if missing_ids:
        checks.append(("case ID coverage", FAIL, f"missing: {sorted(missing_ids)}"))
    else:
        checks.append(("case ID coverage", PASS, f"all {len(template_ids)} template cases covered"))

    # Check final round all passed
    rounds = {}
    for rec in records:
        r = rec.get("round", 1)
        rounds.setdefault(r, []).append(rec)
    last_round = max(rounds.keys()) if rounds else 0
    final_failures = [rec for rec in rounds.get(last_round, []) if not rec.get("passed")]
    if final_failures:
        failed_ids = [r.get("caseId") for r in final_failures]
        checks.append(("final round passed", FAIL, f"round {last_round} failed: {failed_ids}"))
    else:
        checks.append(("final round passed", PASS, f"round {last_round}: all passed"))

    return checks


# ── Phase 5: PR ────────────────────────────────────────────

def check_phase_5(topic_dir):
    checks = []

    # Pre-check: untracked files
    check_untracked_files(topic_dir, checks)

    # 5.1 pr_evidence.md
    pr_path = os.path.join(topic_dir, "changes", "evidence", "pr_evidence.md")
    data, err = parse_yaml_frontmatter(pr_path)
    if err:
        checks.append(("pr_evidence.md", FAIL, err))
    else:
        ok, msg = check_field_bool(data, "pr_created", True)
        checks.append(("pr_evidence.md", PASS if ok else FAIL, msg))

    # 5.2 ci_results.md
    ci_path = os.path.join(topic_dir, "changes", "evidence", "ci_results.md")
    data, err = parse_yaml_frontmatter(ci_path)
    if err:
        checks.append(("ci_results.md", FAIL, err))
    else:
        ok, msg = check_field_bool(data, "ci_passed", True)
        checks.append(("ci_results.md", PASS if ok else FAIL, msg))

    return checks


# ── Main ────────────────────────────────────────────────────

PHASE_CHECKERS = {
    1: ("Spec", check_phase_1),
    2: ("Plan", check_phase_2),
    3: ("Dev", check_phase_3),
    4: ("Test", check_phase_4),
    5: ("PR", check_phase_5),
}


def main():
    try:
        _main_inner()
    except SystemExit:
        raise
    except Exception as e:
        print(f"FATAL: gate-check crashed: {e}", file=sys.stderr)
        sys.exit(2)


def _main_inner():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    topic_dir = sys.argv[1]
    try:
        phase = int(sys.argv[2])
    except ValueError:
        print(f"ERROR: phase must be a number (1-5), got {sys.argv[2]}")
        sys.exit(1)

    if phase not in PHASE_CHECKERS:
        print(f"ERROR: phase must be 1-5, got {phase}")
        sys.exit(1)

    if not os.path.isdir(topic_dir):
        print(f"ERROR: topic directory not found: {topic_dir}")
        sys.exit(1)

    phase_name, checker = PHASE_CHECKERS[phase]
    print(f"Gate Check — Phase {phase}: {phase_name}")
    print(f"Topic: {topic_dir}")
    print()

    checks = checker(topic_dir)
    failures = 0

    for name, status, detail in checks:
        icon = "✅" if status == PASS else "❌"
        print(f"  {icon}  {name}: {detail}")
        if status == FAIL:
            failures += 1

    print()
    if failures == 0:
        print(f"✅ Phase {phase} gate: PASS — all {len(checks)} checks passed")
        sys.exit(0)
    else:
        print(f"❌ Phase {phase} gate: FAIL — {failures}/{len(checks)} checks failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
