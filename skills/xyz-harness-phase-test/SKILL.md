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

Create or update `{topic}/changes/evidence/test_execution.json` with format:

**test_execution.json 字段 Schema：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `test_execution` (或 `execution`) | array | 是 | — | 执行记录数组，可改名但必须有数组字段 | — | 用错了字段名（gate 脚本会尝试 `test_execution` 和 `execution` 两种） |
| `.caseId` | string | 是 | 必须匹配 template 中的 `id` | 用例 ID，gate 用此字段做 cross-reference | `"TC-1-01"` | ID 拼写错误导致 cross-ref 失败（gate 报 missing） |
| `.round` | number | 是 | 正整数 >= 1 | 执行轮次。gate 检查**最终轮次**是否全部通过 | `1` | 写成了 `"1"`（字符串）；相邻轮次不连续 |
| `.passed` | boolean | 是 | `true` 或 `false` | **布尔值**。最终轮次必须全部 `true` gate 才通过 | `true` | 写成了 `"true"`（字符串）；写成了 `1`（数字，非布尔） |
| `.execute_steps` | array | 是 | string 数组 | 实际执行的操作步骤。**不可为空**，gate 会检查 `len(steps) > 0` | `["call GET /api/config"]` | 空数组 `[]`；写成了字符串而不是数组 |
| `.evidence` | string | 否 | 任意 | 截图路径或测试输出引用 | `"screenshot-p1.png"` | — |

**完整示例：**
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
      "evidence": "test output in terminal"
    },
    {
      "caseId": "TC-1-02",
      "round": 1,
      "passed": false,
      "execute_steps": ["call POST /api/config", "verify 400 on invalid input"],
      "evidence": "expected 400, got 422"
    },
    {
      "caseId": "TC-1-02",
      "round": 2,
      "passed": true,
      "execute_steps": ["call POST /api/config", "verify 400 on invalid input"],
      "evidence": "fixed validation, now returns 400"
    }
  ]
}
```

注意：
- 同一个 caseId 可以有多个 round 记录（修复后重跑）
- gate 只检查**最大 round 号那轮**的 `passed` 值
- `execute_steps` 必须有实际步骤描述，不能是空数组

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
