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
import sys
import yaml
import glob

PASS = "✅ PASS"
FAIL = "❌ FAIL"


def parse_yaml_frontmatter(filepath):
    """Parse YAML frontmatter from a markdown file.
    Returns (data, error) where data is the parsed dict or None.
    """
    if not os.path.exists(filepath):
        return None, "file not found"
    try:
        with open(filepath) as f:
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


# ── Phase 1: Spec ──────────────────────────────────────────

def check_phase_1(topic_dir):
    checks = []

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
            ok1, msg1 = check_field_str(data, "verdict", "pass")
            ok2, msg2 = check_field_int(data, "must_fix", 0)
            verdict_status = PASS if ok1 else FAIL
            mf_status = PASS if ok2 else FAIL
            checks.append(("spec_review verdict", verdict_status, msg1))
            checks.append(("spec_review must_fix", mf_status, msg2))

    return checks


# ── Phase 2: Plan ──────────────────────────────────────────

def check_phase_2(topic_dir):
    checks = []

    # 2.1 plan.md
    plan_path = os.path.join(topic_dir, "plan.md")
    data, err = parse_yaml_frontmatter(plan_path)
    if err:
        checks.append(("plan.md", FAIL, err))
    else:
        ok, msg = check_field_str(data, "verdict", "pass")
        checks.append(("plan.md", PASS if ok else FAIL, msg))

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
            with open(template_path) as f:
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

    # 2.4 plan_review
    review_path = find_latest_review(topic_dir, "plan_review_v")
    if not review_path:
        checks.append(("plan_review", FAIL, "no plan_review_v*.md found"))
    else:
        data, err = parse_yaml_frontmatter(review_path)
        if err:
            checks.append(("plan_review", FAIL, err))
        else:
            ok1, msg1 = check_field_str(data, "verdict", "pass")
            ok2, msg2 = check_field_int(data, "must_fix", 0)
            checks.append(("plan_review verdict", PASS if ok1 else FAIL, msg1))
            checks.append(("plan_review must_fix", PASS if ok2 else FAIL, msg2))

    return checks


# ── Phase 3: Dev ───────────────────────────────────────────

def check_phase_3(topic_dir):
    checks = []

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

    # 3.2 code_review
    review_path = find_latest_review(topic_dir, "code_review_v")
    if not review_path:
        checks.append(("code_review", FAIL, "no code_review_v*.md found"))
    else:
        data, err = parse_yaml_frontmatter(review_path)
        if err:
            checks.append(("code_review", FAIL, err))
        else:
            ok1, msg1 = check_field_str(data, "verdict", "pass")
            ok2, msg2 = check_field_int(data, "must_fix", 0)
            checks.append(("code_review verdict", PASS if ok1 else FAIL, msg1))
            checks.append(("code_review must_fix", PASS if ok2 else FAIL, msg2))

    return checks


# ── Phase 4: Test ──────────────────────────────────────────

def check_phase_4(topic_dir):
    checks = []

    # 4.1 test_cases_template.json 存在（用于跨引用）
    template_path = os.path.join(topic_dir, "test_cases_template.json")
    if not os.path.exists(template_path):
        checks.append(("test_cases_template.json", FAIL, "not found (needed for case ID cross-reference)"))
    else:
        try:
            with open(template_path) as f:
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
        with open(exec_path) as f:
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
