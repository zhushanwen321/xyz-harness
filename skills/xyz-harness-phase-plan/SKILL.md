---
name: xyz-harness-phase-plan
description: Phase 2 (plan) of the manual xyz-harness workflow. Use when the user says "start Phase 2", "plan phase", "write plan", or after spec.md is done to produce plan.md + E2E test plan + test cases template.
---

# Phase 2: Plan

## Purpose

Based on the approved spec.md, produce an implementation plan, E2E test plan, and test case templates.

## Prerequisites

- spec.md exists with verdict: pass
- spec has been reviewed (spec_review exists with verdict: pass, must_fix: 0)

## Steps

### 1. Read spec.md

Load the completed spec.md to understand requirements and acceptance criteria.

### 2. Assess complexity

Determine plan complexity: L1 (simple) or L2 (complex). Dimensions: domain, storage, data-flow, API integration, non-functional.

### 3. Write plan.md

Create `.xyz-harness/{topic}/plan.md` with format:
```
---
verdict: pass
---

# {topic} Implementation Plan

## Tasks

| File | Operation | Group |
|------|-----------|-------|
| `backend/app/services/xxx.py` | create | BG1 |
| `frontend/src/views/xxx.vue` | modify | FG1 |

## Execution Order
1. BG1: backend service + schema + route
2. FG1: frontend types + service + page
```
- YAML frontmatter `verdict: pass`
- 表格式 task 清单，每行有 file path + operation + execution group

### 4. Write E2E test plan

Create `.xyz-harness/{topic}/e2e-test-plan.md` with format:
```
---
verdict: pass
---

# E2E Test Plan — {topic}

## Test Scenarios
...
```
- YAML frontmatter `verdict: pass`

### 5. Write test case templates

Create `.xyz-harness/{topic}/test_cases_template.json`:
```json
{
  "test_cases": [
    {
      "id": "TC-1-01",
      "type": "api",
      "title": "GET /api/config returns config items",
      "description": "...",
      "steps": ["call GET /api/config", "verify 200 response"]
    }
  ]
}
```
- 必须是有效 JSON
- `test_cases` 数组，每个元素必须有 `id`、`type`、`title` 字段
- `id` 格式：`TC-{number}-{number}`

### 6. Review

Use xyz-harness-expert-reviewer methodology or dispatch a subagent for independent review.

Create `.xyz-harness/{topic}/changes/reviews/plan_review_v1.md` with format:
```
---
verdict: pass
must_fix: 0
---

# Plan Review — {topic}

...
```
- `verdict` 必须是 `pass`
- `must_fix` 必须是数字 0（零）

### 7. Self-Check

- [ ] plan.md exists with verdict: pass
- [ ] e2e-test-plan.md exists with verdict: pass
- [ ] test_cases_template.json exists and is valid JSON with test_cases array, each has id/type/title
- [ ] plan review exists with verdict: pass, must_fix: 0
- [ ] Tasks cover all acceptance criteria from spec

### 8. Gate Handoff

When opening a separate gate check conversation, submit these files:

| File | Path |
|------|------|
| Plan | `{topic}/plan.md` |
| E2E test plan | `{topic}/e2e-test-plan.md` |
| Test case templates | `{topic}/test_cases_template.json` |
| Plan review | `{topic}/changes/reviews/plan_review_v*.md` |

Open a new Pi session, load the xyz-harness-gate skill, and tell it:
> "Check Phase 2 gate for topic `{topic}`"

### 9. Tell user

When done: "Phase 2 complete. All plan deliverables ready. File list for gate check above. Ready for Phase 3 (dev) or run gate check."
