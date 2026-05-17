---
name: xyz-harness-phase-test
description: Phase 4 (test) of the manual xyz-harness workflow. Use when the user says "start Phase 4", "test phase", "run tests", "execute test cases", or after dev is done to run E2E/integration tests.
---

# Phase 4: Test

## Purpose

Execute test cases from test_cases_template.json, record results in test_execution.json, and fix any failures.

## Prerequisites

- test_results.md exists with all_passing: true
- Code review passed
- All code changes committed

## Steps

### 1. Load Test Templates

Read test_cases_template.json to list all test cases.

### 2. Execute Test Cases

For each test case (by ID group):
- API tests: curl/httpx against backend endpoints
- Frontend tests: Playwright or manual verification
- Integration tests: service-level tests

### 3. Record Results

Create or update `{topicDir}/changes/evidence/test_execution.json` with format:
```json
{
  "test_execution": [
    {
      "caseId": "TC-1-01",
      "round": 1,
      "passed": true,
      "execute_steps": [
        "call GET /api/config",
        "verify 200 response contains config items"
      ],
      "evidence": "test output or screenshot ref"
    }
  ]
}
```
- `caseId` 必须匹配 template 中的 ID
- `round` 数字，递增（第 1 轮、第 2 轮...）
- `passed` 必须是布尔值 `true` 或 `false`，gate 只检查最终轮次全部 `true`
- `execute_steps` 数组，描述实际执行步骤（不可为空）
- `evidence` 可选，指向截图或测试输出

### 4. Fix Failures

If any test fails: diagnose → fix → re-run → update execution json.

### 5. Self-Check

- [ ] All test cases from template have been executed
- [ ] All tests pass in final round
- [ ] test_execution.json is valid JSON
- [ ] test_results.md still accurate

### 6. Gate Handoff

When opening a separate gate check conversation, submit this file:

| File | Path |
|------|------|
| Test execution | `{topic}/changes/evidence/test_execution.json` |

The gate will cross-reference against `{topic}/test_cases_template.json`.

Open a new Pi session, load the xyz-harness-gate skill, and tell it:
> "Check Phase 4 gate for topic `{topic}`"

### 7. Tell user

When done: "Phase 4 complete. All tests pass. File list for gate check above. Ready for Phase 5 (PR) or run gate check."
