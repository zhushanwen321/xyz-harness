---
name: xyz-harness-phase-dev
description: Phase 3 (dev) of the manual xyz-harness workflow. Use when the user says "start Phase 3", "dev phase", "implement", "write code", or after plan is done to produce code changes, test results, and code review.
---

# Phase 3: Dev

## Purpose

Implement the feature according to plan.md, following TDD methodology, then get code review.

## Prerequisites

- plan.md exists with verdict: pass
- e2e-test-plan.md and test_cases_template.json exist

## Steps

### 1. TDD (Test-Driven Development)

Load xyz-harness-test-driven-development skill. For each task: write failing tests → verify fail → implement minimal code → verify pass → refactor.

### 2. Code Implementation

Follow project coding conventions:
- Backend: load xyz-harness-backend-dev skill for Clean Architecture layers
- Frontend: load xyz-harness-frontend-dev skill for 3-phase workflow

### 3. Run All Tests

- Backend: run test command
- Frontend: run build command
- Verify all existing tests still pass

### 4. Code Review

Write code review evidence. Use xyz-harness-expert-reviewer methodology or dispatch a reviewer subagent.

Create `.xyz-harness/{topic}/changes/reviews/code_review_v1.md`:

**code_review YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `verdict` | string | 是 | `"pass"` | 评审通过标志 | `verdict: pass` | 写成了 `verdict: fail`（有必修项时 gate 不通过） |
| `must_fix` | number | 是 | `0` | 必须修复的问题数量。**必须为数字 0** gate 才通过 | `must_fix: 0` | 写成了 `must_fix: "0"`（字符串类型，gate 会报错）；写成了 `must_fix: 3`（未修复问题） |

**完整示例：**
```
---
verdict: pass
must_fix: 0
---

# Code Review — {topic}

## Summary
Code review passed. 0 MUST FIX, 3 LOW suggestions.

## Issues
- LOW: {minor suggestion}
```

### 5. Document Test Results

Create `.xyz-harness/{topic}/changes/evidence/test_results.md`:

**test_results.md YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `verdict` | string | 是 | `"pass"` | 测试通过标志 | `verdict: pass` | 写成了 `verdict: fail` |
| `all_passing` | boolean | 是 | `true` | **布尔值**，表示全部测试通过。gate 严格检查此值必须是 `true`（布尔类型），不接受字符串 | `all_passing: true` | 写成了 `all_passing: "true"`（字符串，gate 会报错）；写成了 `all_passing: True`（Python 风格语法，YAML 能解析但不符合规范） |

**完整示例：**
```
---
verdict: pass
all_passing: true
---

# Test Results — {topic}

## Backend Tests
```
cd backend && uv run pytest -v
...output...
52 passed in 3.42s
```

**All 52 backend tests passed.**

## Frontend Build
```
cd frontend && pnpm run build
...output...
Build successful.
```

**Frontend build passed.**
```

### 6. Self-Check

- [ ] All implementation tasks from plan.md completed
- [ ] All tests pass
- [ ] test_results.md exists with all_passing: true（布尔值，不是字符串）
- [ ] Code review exists with verdict: pass, must_fix: 0
- [ ] No unintended modifications

### 7. Gate Handoff

When opening a separate gate check conversation, submit these files:

| File | Path |
|------|------|
| Test results | `{topic}/changes/evidence/test_results.md` |
| Code review | `{topic}/changes/reviews/code_review_v*.md` |

Open a new Pi session, load the xyz-harness-gate skill, and tell it:
> "Check Phase 3 gate for topic `{topic}`"

### 8. Tell user

When done: "Phase 3 complete. Code implemented and reviewed. File list for gate check above. Ready for Phase 4 (test) or run gate check."
