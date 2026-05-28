#!/usr/bin/env python3
"""
Harness Gate Check — Standalone executable validation script.

Usage:
    python3 check_gate.py <topic_dir> <phase_number> [--json]

Example:
    python3 check_gate.py .xyz-harness/2026-05-17-system-setting 2
    python3 check_gate.py .xyz-harness/2026-05-17-system-setting 2 --json

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
from dataclasses import dataclass, field
from typing import Any, Callable

PASS = "✅ PASS"
FAIL = "❌ FAIL"


# ── Utility Functions ───────────────────────────────────────

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

    first = content.find("---")
    if first == -1:
        return None, "no YAML frontmatter (no opening ---)"

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
    verdict = data.get("verdict") if isinstance(data, dict) else None
    must_fix = data.get("must_fix") if isinstance(data, dict) else None

    if verdict is None and isinstance(data, dict) and "review" in data:
        review = data["review"]
        if isinstance(review, dict):
            verdict = review.get("verdict")

    if must_fix is None and isinstance(data, dict) and "review" in data:
        review = data["review"]
        if isinstance(review, dict):
            must_fix = review.get("must_fix")

    if must_fix is None and isinstance(data, dict) and "statistics" in data:
        stats = data["statistics"]
        if isinstance(stats, dict):
            must_fix = stats.get("must_fix")

    return verdict, must_fix


# ── Dataclass Definitions ───────────────────────────────────

@dataclass
class FieldCheck:
    name: str
    type: str  # "str" | "int" | "bool"
    expected: Any = None
    optional: bool = False


@dataclass
class FileCheck:
    path: str  # relative to topic_dir
    fields: list[FieldCheck] = field(default_factory=list)
    validator: Callable[[str, list], None] | None = None
    # validator 接收 (topic_dir, checks_list) 并向 checks_list append (name, PASS/FAIL, detail)


@dataclass
class ReviewCheck:
    prefix: str  # e.g. "spec_review_v"
    optional: bool = False  # if True, missing review is not a failure


@dataclass
class PhaseSpec:
    name: str
    deliverables: list[FileCheck] = field(default_factory=list)
    reviews: list[ReviewCheck] = field(default_factory=list)
    pre_checks: list[Callable[[str, list], None]] = field(default_factory=list)


# ── Validator Functions ─────────────────────────────────────

def validate_test_cases_template(topic_dir, checks):
    """Validate test_cases_template.json structure: each case needs id/type/title."""
    template_path = os.path.join(topic_dir, "test_cases_template.json")
    if not os.path.exists(template_path):
        checks.append(("test_cases_template.json", FAIL, "file not found"))
        return
    try:
        with open(template_path, encoding="utf-8") as f:
            template = json.load(f)
    except json.JSONDecodeError as e:
        checks.append(("test_cases_template.json", FAIL, f"invalid JSON: {e}"))
        return

    cases = template.get("test_cases", [])
    errors = []
    for i, c in enumerate(cases):
        for req_field in ("id", "type", "title"):
            if req_field not in c:
                errors.append(f"case[{i}] missing '{req_field}'")
    if errors:
        checks.append(("test_cases_template.json", FAIL, "; ".join(errors)))
    else:
        checks.append(("test_cases_template.json", PASS, f"{len(cases)} cases, all have id/type/title"))


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
            for fld in required_method_fields:
                if fld not in m:
                    method_errors.append(f"methods[{i}] missing '{fld}'")
                elif fld in string_fields and not isinstance(m[fld], str):
                    method_errors.append(f"methods[{i}].{fld} type={type(m[fld]).__name__}, expected str")
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


def validate_interface_chain(topic_dir, checks):
    """Validate interface_chain.json for L2 complexity plans."""
    plan_path = os.path.join(topic_dir, "plan.md")
    if not os.path.exists(plan_path):
        checks.append(("interface_chain.json", PASS, "skipped (plan.md not found)"))
        return

    data, err = parse_yaml_frontmatter(plan_path)
    if err:
        checks.append(("interface_chain.json", PASS, "skipped (plan.md parse error)"))
        return

    complexity = data.get("complexity", "L1") if isinstance(data, dict) else "L1"
    if complexity != "L2":
        checks.append(("interface_chain.json", PASS, f"skipped (complexity={complexity})"))
        return

    checks.extend(check_interface_chain_schema(topic_dir))


def validate_plan_bl_review(topic_dir, checks):
    """Check plan_bl_review only when plan.md complexity is L2."""
    plan_path = os.path.join(topic_dir, "plan.md")
    if not os.path.exists(plan_path):
        checks.append(("plan_bl_review", PASS, "skipped (plan.md not found)"))
        return

    data, err = parse_yaml_frontmatter(plan_path)
    if err:
        checks.append(("plan_bl_review", FAIL, f"plan.md frontmatter error: {err}"))
        return

    complexity = data.get("complexity", "L1") if isinstance(data, dict) else "L1"
    if complexity != "L2":
        checks.append(("plan_bl_review", PASS, f"skipped (complexity={complexity})"))
        return

    review_dir = os.path.join(topic_dir, "changes", "reviews")
    if not os.path.isdir(review_dir):
        checks.append(("plan_bl_review", FAIL, "reviews directory not found"))
        return

    found = False
    for f in os.listdir(review_dir):
        if f.startswith("plan_bl_review") and f.endswith(".md"):
            found = True
            break

    if not found:
        checks.append(("plan_bl_review", FAIL, "file not found"))
        return

    # Validate frontmatter: verdict must be pass
    review_path = find_latest_review(topic_dir, "plan_bl_review")
    if review_path:
        rdata, rerr = parse_yaml_frontmatter(review_path)
        if rerr:
            checks.append(("plan_bl_review", FAIL, rerr))
            return
        verdict, must_fix = _flatten_review_fields(rdata)
        if verdict is None or verdict != "pass":
            checks.append(("plan_bl_review", FAIL, f"verdict={repr(verdict)}, expected 'pass'"))
            return
        if not isinstance(must_fix, int) or must_fix != 0:
            checks.append(("plan_bl_review must_fix", FAIL, f"must_fix={repr(must_fix)}, expected 0"))
            return
        checks.append(("plan_bl_review", PASS, "found, verdict=pass, must_fix=0"))
    else:
        checks.append(("plan_bl_review", PASS, "found"))


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


def validate_taste_review_exists(topic_dir, checks):
    """Ensure at least one taste review exists (ts_taste_review, rust_taste_review, or generic taste_review).

    All taste ReviewChecks are optional, but at least one must be present.
    """
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
    """Check standards_review linter_passed field based on project lint config.

    If standards_review contains linter_passed=false, report failure.
    If the field is absent or true, pass.
    """
    review_path = find_latest_review(topic_dir, "standards_review")
    if not review_path:
        return  # absence handled by ReviewCheck

    data, err = parse_yaml_frontmatter(review_path)
    if err:
        checks.append(("standards_review parse", FAIL, f"frontmatter parse failed: {err}"))
        return

    if not isinstance(data, dict):
        checks.append(("standards_review parse", FAIL, f"frontmatter is not a dict: {type(data).__name__}"))
        return

    # Check linter_passed if the field exists in the review
    if "linter_passed" in data:
        val = data["linter_passed"]
        if isinstance(val, bool) and not val:
            checks.append(("standards_review linter_passed", FAIL, "linter_passed=false"))
        else:
            checks.append(("standards_review linter_passed", PASS, f"linter_passed={val}"))

    # Check typecheck_passed if the field exists in the review
    if "typecheck_passed" in data:
        val = data["typecheck_passed"]
        if isinstance(val, bool) and not val:
            checks.append(("standards_review typecheck_passed", FAIL, "typecheck_passed=false"))
        else:
            checks.append(("standards_review typecheck_passed", PASS, f"typecheck_passed={val}"))


def validate_test_execution(topic_dir, checks):
    """Validate test_execution.json: format, template cross-ref, final round all passed.

    Internally reads test_cases_template.json for case ID cross-reference,
    then validates execution records cover all template IDs and final round passes.
    """
    # 1. Load template for cross-ref
    template_path = os.path.join(topic_dir, "test_cases_template.json")
    template_ids = set()
    if not os.path.exists(template_path):
        checks.append(("test_cases_template.json", FAIL, "not found (needed for case ID cross-reference)"))
    else:
        try:
            with open(template_path) as f:
                template = json.load(f)
            template_ids = set(c["id"] for c in template.get("test_cases", []))
            checks.append(("test_cases_template.json", PASS, f"{len(template_ids)} cases loaded for cross-ref"))
        except (json.JSONDecodeError, KeyError) as e:
            checks.append(("test_cases_template.json", FAIL, f"invalid: {e}"))

    # Flag when template loading failed so cross-ref is skipped
    template_loaded = len(template_ids) > 0 or not os.path.exists(template_path)

    # 2. Load execution
    exec_path = os.path.join(topic_dir, "changes", "evidence", "test_execution.json")
    if not os.path.exists(exec_path):
        checks.append(("test_execution.json", FAIL, "file not found"))
        return

    try:
        with open(exec_path, encoding="utf-8") as f:
            execution = json.load(f)
    except json.JSONDecodeError as e:
        checks.append(("test_execution.json", FAIL, f"invalid JSON: {e}"))
        return

    # Validate top-level type
    if not isinstance(execution, dict):
        checks.append(("test_execution.json", FAIL, f"top-level type={type(execution).__name__}, expected object"))
        return

    # 3. Extract records
    records = execution.get("test_execution", execution.get("execution", []))
    if not records:
        checks.append(("test_execution.json", FAIL, "no test_execution or execution array"))
        return

    # 4. Check record format
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

    # 5. Cross-ref: all template case IDs covered
    executed_ids = set(rec["caseId"] for rec in records if "caseId" in rec)
    if not template_loaded:
        checks.append(("case ID coverage", PASS, "skipped (template loading failed, cross-ref unavailable)"))
    elif template_ids:
        missing_ids = template_ids - executed_ids
        if missing_ids:
            checks.append(("case ID coverage", FAIL, f"missing: {sorted(missing_ids)}"))
        else:
            checks.append(("case ID coverage", PASS, f"all {len(template_ids)} template cases covered"))
    else:
        checks.append(("case ID coverage", PASS, "no template cases to check"))

    # 6. Final round all passed
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

    # 7. Verification method statistics (optional, informational only)
    method_counts = {"automated": 0, "code_review": 0, "manual": 0, "unspecified": 0}
    for rec in records:
        method = rec.get("verification_method", "unspecified")
        if method in method_counts:
            method_counts[method] += 1
        else:
            method_counts["unspecified"] += 1

    total = len(records)
    if total > 0:
        method_summary = ", ".join(
            f"{k}: {v} ({v*100//total}%)" for k, v in method_counts.items() if v > 0
        )
        checks.append(("verification methods", PASS, f"{total} records: {method_summary}"))


# ── Phase Specifications ────────────────────────────────────

PHASE_SPECS: dict[int, PhaseSpec] = {
    1: PhaseSpec(
        name="Spec",
        deliverables=[
            FileCheck(path="spec.md", fields=[FieldCheck("verdict", "str", "pass")]),
        ],
        reviews=[
            ReviewCheck(prefix="spec_review_v"),
        ],
        pre_checks=[check_untracked_files],
    ),
    2: PhaseSpec(
        name="Plan",
        deliverables=[
            FileCheck(path="plan.md", fields=[FieldCheck("verdict", "str", "pass")]),
            FileCheck(path="e2e-test-plan.md", fields=[FieldCheck("verdict", "str", "pass")]),
            FileCheck(path="test_cases_template.json", validator=validate_test_cases_template),
            FileCheck(path="use-cases.md", fields=[FieldCheck("verdict", "str", "pass")]),
            FileCheck(path="non-functional-design.md", fields=[FieldCheck("verdict", "str", "pass")]),
        ],
        reviews=[
            ReviewCheck(prefix="plan_review_v"),
        ],
        pre_checks=[check_untracked_files, validate_interface_chain, validate_plan_bl_review],
    ),
    3: PhaseSpec(
        name="Dev",
        deliverables=[
            FileCheck(
                path="changes/evidence/test_results.md",
                fields=[
                    FieldCheck("verdict", "str", "pass"),
                    FieldCheck("all_passing", "bool", True),
                    FieldCheck("linter_passed", "bool", True, optional=True),
                ],
            ),
        ],
        reviews=[
            ReviewCheck(prefix="business_logic_review"),
            ReviewCheck(prefix="integration_review"),
            ReviewCheck(prefix="standards_review"),
            ReviewCheck(prefix="ts_taste_review", optional=True),
            ReviewCheck(prefix="rust_taste_review", optional=True),
            ReviewCheck(prefix="taste_review", optional=True),
            ReviewCheck(prefix="robustness_review"),
        ],
        pre_checks=[check_untracked_files, validate_taste_review_exists, validate_standards_linter],
    ),
    4: PhaseSpec(
        name="Test",
        deliverables=[
            FileCheck(path="changes/evidence/test_execution.json", validator=validate_test_execution),
        ],
        reviews=[],
        pre_checks=[check_untracked_files],
    ),
    5: PhaseSpec(
        name="PR",
        deliverables=[
            FileCheck(
                path="changes/evidence/pr_evidence.md",
                fields=[
                    FieldCheck("pr_created", "bool", True),
                    FieldCheck("ci_configured", "bool", True, optional=True),
                ],
            ),
            FileCheck(path="changes/evidence/ci_results.md", fields=[FieldCheck("ci_passed", "bool", True)]),
        ],
        reviews=[],
        pre_checks=[check_untracked_files],
    ),
}


# ── Generic Phase Check Engine ──────────────────────────────

def run_phase_checks(topic_dir: str, spec: PhaseSpec) -> list:
    """Run all checks for a phase based on its declarative spec."""
    checks = []

    # Run pre_checks first
    for pre_check in spec.pre_checks:
        pre_check(topic_dir, checks)

    # Check deliverables
    for fc in spec.deliverables:
        if fc.validator:
            fc.validator(topic_dir, checks)
        else:
            abs_path = os.path.join(topic_dir, fc.path)
            data, err = parse_yaml_frontmatter(abs_path)
            if err:
                checks.append((fc.path, FAIL, err))
            else:
                for f in fc.fields:
                    # Skip optional fields that don't exist
                    if f.optional and f.name not in data:
                        checks.append((f"{fc.path} {f.name}", PASS, f"optional '{f.name}' skipped"))
                        continue
                    if f.type == "str":
                        ok, msg = check_field_str(data, f.name, f.expected)
                    elif f.type == "int":
                        ok, msg = check_field_int(data, f.name, f.expected)
                    elif f.type == "bool":
                        ok, msg = check_field_bool(data, f.name, f.expected or True)
                    else:
                        ok, msg = False, f"unknown field type '{f.type}'"
                    checks.append((f"{fc.path} {f.name}", PASS if ok else FAIL, msg))

    # Check reviews
    for rc in spec.reviews:
        review_path = find_latest_review(topic_dir, rc.prefix)
        if not review_path:
            if rc.optional:
                checks.append((f"{rc.prefix}*", PASS, f"{rc.prefix}*.md not found (optional, skipped)"))
            else:
                checks.append((f"{rc.prefix}*", FAIL, f"no {rc.prefix}*.md found"))
        else:
            data, err = parse_yaml_frontmatter(review_path)
            if err:
                checks.append((rc.prefix, FAIL, err))
            else:
                review_name = os.path.basename(review_path).replace(".md", "")

                verdict, must_fix = _flatten_review_fields(data)
                # Check verdict
                if verdict is None:
                    checks.append((f"{review_name} verdict", FAIL, "'verdict' field missing (checked top-level and review.verdict)"))
                elif not isinstance(verdict, str) or verdict != "pass":
                    checks.append((f"{review_name} verdict", FAIL, f"'verdict'={repr(verdict)}, expected 'pass'"))
                else:
                    checks.append((f"{review_name} verdict", PASS, f"'verdict'={repr(verdict)}"))
                # Check must_fix
                if must_fix is None:
                    checks.append((f"{review_name} must_fix", FAIL, "'must_fix' field missing (checked top-level and statistics.must_fix)"))
                elif not isinstance(must_fix, int) or must_fix != 0:
                    checks.append((f"{review_name} must_fix", FAIL, f"'must_fix'={must_fix}, expected 0"))
                else:
                    checks.append((f"{review_name} must_fix", PASS, f"'must_fix'={must_fix}"))

    return checks


# ── Output Formatters ───────────────────────────────────────

def output_human(phase, phase_name, topic_dir, checks):
    """Print human-readable gate check results."""
    print(f"Gate Check — Phase {phase}: {phase_name}")
    print(f"Topic: {topic_dir}")
    print()

    failures = 0
    for name, status, detail in checks:
        icon = "✅" if status == PASS else "❌"
        print(f"  {icon}  {name}: {detail}")
        if status == FAIL:
            failures += 1

    print()
    if failures == 0:
        print(f"✅ Phase {phase} gate: PASS — all {len(checks)} checks passed")
    else:
        print(f"❌ Phase {phase} gate: FAIL — {failures}/{len(checks)} checks failed")

    return failures


def output_json(phase, phase_name, topic_dir, checks):
    """Print JSON gate check results."""
    failures = sum(1 for _, status, _ in checks if status == FAIL)
    result = {
        "passed": failures == 0,
        "phase": phase,
        "phase_name": phase_name,
        "topic_dir": topic_dir,
        "checks": [
            {"name": name, "passed": status == PASS, "detail": detail}
            for name, status, detail in checks
        ],
        "total_checks": len(checks),
        "failures": failures,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return failures


# ── Main ────────────────────────────────────────────────────

def main():
    try:
        if len(sys.argv) < 3:
            print(__doc__)
            sys.exit(1)

        topic_dir = sys.argv[1]
        try:
            phase = int(sys.argv[2])
        except ValueError:
            print(f"ERROR: phase must be a number (1-5), got {sys.argv[2]}")
            sys.exit(1)

        use_json = "--json" in sys.argv[3:]

        if phase not in PHASE_SPECS:
            print(f"ERROR: phase must be 1-5, got {phase}")
            sys.exit(1)

        if not os.path.isdir(topic_dir):
            print(f"ERROR: topic directory not found: {topic_dir}")
            sys.exit(1)

        spec = PHASE_SPECS[phase]
        checks = run_phase_checks(topic_dir, spec)

        if use_json:
            failures = output_json(phase, spec.name, topic_dir, checks)
        else:
            failures = output_human(phase, spec.name, topic_dir, checks)

        sys.exit(0 if failures == 0 else 1)
    except SystemExit:
        raise
    except Exception as e:
        print(f"FATAL: gate-check crashed: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
