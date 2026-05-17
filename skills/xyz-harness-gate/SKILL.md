---
name: xyz-harness-gate
description: Gate check skill for xyz-harness. Validates deliverables per phase — file existence, YAML frontmatter correctness, verdict/required fields. Used standalone in a separate Pi session. Trigger: "run gate check", "verify deliverables", "check gate", "validate phase X".
---

# Gate Check

## Usage

Run this skill in a SEPARATE Pi session (new conversation) for unbiased validation.

### AI — 入口流程

用户说"检查 gate"时，你先确定以下信息：

**1. 找 topic 目录**

从当前项目目录查找 `.xyz-harness/`：
```bash
ls .xyz-harness/
```
列出所有 topic（格式 `YYYY-MM-DD-*` 的目录）。如果只有一个，用它。如果有多个，问用户用哪个。

如果不存在 `.xyz-harness/`，问用户在哪个项目目录工作。

**2. 确定 phase**

问用户要检查哪个 phase（1-5）。或者先检测一下当前存在哪些交付物，推断到哪个 phase：
- 只有 `spec.md` → Phase 1
- 有 `plan.md` → Phase 2
- 有 `changes/evidence/test_results.md` → Phase 3
- 有 `test_execution.json` → Phase 4
- 有 `pr_evidence.md` → Phase 5
- 全部都有 → 全检

**3. 开始检查**

确定 topic 和 phase 后，对照下面的清单逐项验证。

## Phase 1 — Spec Deliverables

| File | Required |
|------|----------|
| spec.md | YAML frontmatter with `verdict: pass` |
| changes/reviews/spec_review_v*.md | YAML frontmatter with `verdict: pass`, `must_fix: 0` |

## Phase 2 — Plan Deliverables

| File | Required |
|------|----------|
| plan.md | YAML frontmatter with `verdict: pass` |
| e2e-test-plan.md | YAML frontmatter with `verdict: pass` |
| test_cases_template.json | Valid JSON with `test_cases` array |
| changes/reviews/plan_review_v*.md | YAML frontmatter with `verdict: pass`, `must_fix: 0` |

## Phase 3 — Dev Deliverables

| File | Required |
|------|----------|
| changes/evidence/test_results.md | YAML frontmatter with `verdict: pass`, `all_passing: true` |
| changes/reviews/code_review_v*.md | YAML frontmatter with `verdict: pass`, `must_fix: 0` |

## Phase 4 — Test Deliverables

| File | Required |
|------|----------|
| changes/evidence/test_execution.json | Valid JSON; all test case IDs covered; all `passed: true` in final round; `execute_steps` non-empty |

## Phase 5 — PR Deliverables

| File | Required |
|------|----------|
| changes/evidence/pr_evidence.md | YAML frontmatter with `pr_created: true` |
| changes/evidence/ci_results.md | YAML frontmatter with `ci_passed: true` |

## How to Check YAML Frontmatter

Files use frontmatter between `---` delimiters at the top. Use read tool, then parse:

```bash
head -20 {path} | python3 -c "
import sys,yaml
lines = sys.stdin.read()
parts = lines.split('---')
if len(parts) >= 3:
    data = yaml.safe_load(parts[1])
    print(data)
else:
    print('No valid YAML frontmatter found')
"
```

## How to Check JSON

```bash
python3 -c "
import json, sys
with open('{path}') as f:
    data = json.load(f)
print(json.dumps(data, indent=2)[:500])
"
```

## Output Format

On PASS:
```
Phase {N} Gate Check: PASS ✅

| Deliverable | Status |
|-------------|--------|
| spec.md | ✅ pass |
| spec_review | ✅ pass |
```

On FAIL:
```
Phase {N} Gate Check: FAIL ❌ — {count} errors

| Deliverable | Status | Details |
|-------------|--------|---------|
| plan.md | ✅ pass |
| e2e-test-plan.md | ❌ fail | file not found |
| test_cases_template.json | ❌ fail | invalid JSON |
```

## Common Failure Modes

1. File not found → phase not completed or wrong directory
2. YAML doesn't parse → check `---` delimiters
3. verdict not pass → review failed, fix and re-review
4. must_fix > 0 → review issues not addressed
5. all_passing not true → tests failed
6. JSON invalid → trailing commas, missing brackets
7. Case IDs missing → test_execution.json incomplete
8. execute_steps empty → no actual steps recorded
