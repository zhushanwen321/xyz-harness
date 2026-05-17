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
```
---
verdict: pass
must_fix: 0
---

# Code Review — {topic}

## Summary
...
```
- `verdict` 必须是 `pass`
- `must_fix` 必须是数字 0（零，或实际的未修复问题数量）

### 5. Document Test Results

Create `.xyz-harness/{topic}/changes/evidence/test_results.md`:
```
---
verdict: pass
all_passing: true
---

# Test Results — {topic}

## Backend Tests
```
... test output ...
```

**All tests passed.**
```
- `verdict` 必须是 `pass`
- `all_passing` 必须是布尔值 `true`（不是字符串 `"true"`）

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
