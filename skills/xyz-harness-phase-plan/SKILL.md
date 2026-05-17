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

**plan.md YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `verdict` | string | 是 | `"pass"` | 门禁通过标志 | `verdict: pass` | 忘记加 frontmatter；写成了 `verdict: true` |

**完整示例：**
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

### 4. Write E2E test plan

Create `.xyz-harness/{topic}/e2e-test-plan.md` with format:

**e2e-test-plan.md YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `verdict` | string | 是 | `"pass"` | 门禁通过标志 | `verdict: pass` | 忘写 frontmatter |

**完整示例：**
```
---
verdict: pass
---

# E2E Test Plan — {topic}

## Test Scenarios
{describe test scenarios covering AC from spec}

## Test Environment
{test environment setup details}
```

### 5. Write test case templates

Create `.xyz-harness/{topic}/test_cases_template.json`:

**test_cases_template.json 字段 Schema：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `test_cases` | array | 是 | — | 测试用例数组，不能为空 | — | 写成了 object 而不是 array |
| `.id` | string | 是 | `"TC-{N}-{N}"` | 用例唯一 ID，gate 用此字段跨引用 | `"TC-1-01"` | 未使用 `TC-*` 格式；ID 重复 |
| `.type` | string | 是 | `"api"` / `"ui"` / `"integration"` / `"manual"` | 用例类型，gate 不验证类型值但必须是字符串 | `"api"` | 写成了 `api`（非字符串）；类型值不规范 |
| `.title` | string | 是 | 任意 | 用例标题，简洁描述测试内容 | `"GET /api/config returns config items"` | 空字符串 |
| `.description` | string | 否 | 任意 | 用例详细描述 | `"Verify that the config endpoint returns all config items"` | — |
| `.steps` | array | 否 | — | 执行步骤列表 | `["call GET /api/config"]` | — |

**完整示例：**
```json
{
  "test_cases": [
    {
      "id": "TC-1-01",
      "type": "api",
      "title": "GET /api/config returns config items",
      "description": "Verify that the config endpoint returns all config items with correct structure",
      "steps": ["call GET /api/config", "verify 200 response contains items array"]
    }
  ]
}
```

注意：
- 必须是有效 JSON（无 trailing comma）
- `test_cases` 是数组，不是对象
- 每个元素至少包含 `id`、`type`、`title` 三个字段
- `id` 用 `TC-{数字}-{数字}` 格式

### 6. Review

Use xyz-harness-expert-reviewer methodology or dispatch a subagent for independent review.

Create `.xyz-harness/{topic}/changes/reviews/plan_review_v1.md` with format:

**plan_review YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `verdict` | string | 是 | `"pass"` | 评审通过标志 | `verdict: pass` | 写成了 `verdict: fail`（重新评审后才能通过 gate） |
| `must_fix` | number | 是 | `0` | 必须修复的问题数，gate 检查必须为 `0` | `must_fix: 0` | 写成了 `must_fix: "0"`（字符串）；写成了 `must_fix: 3`（未修复） |

**完整示例：**
```yaml
---
verdict: pass
must_fix: 0
---

# Plan Review — {topic}

## Summary
Plan review passed. 0 MUST FIX, 2 LOW suggestions.

## Issues
- LOW: {suggestion description}
```


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
