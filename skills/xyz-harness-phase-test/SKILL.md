---
name: xyz-harness-phase-test
description: >-
  Phase 4 (test) of the manual xyz-harness workflow. Use when the user says "start Phase 4", "test phase", "run tests", "execute test cases", or after dev is done to execute integration/functional tests (verifying module collaboration and API contracts, not UI-level E2E).
---

# Phase 4: Test

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | Phase 4 (test) |
| 执行者 | 主 agent（测试执行）+ subagent（复盘） |
| 上游 | Phase 3 (dev) — test_results.md + code_review |
| 下游（完成后进入） | Phase 5 (pr) — 加载 phase-pr skill |
| 回退目标 | 测试失败 → 修复 → 重新执行 |

## Phase Loop 机制

Gate FAIL 后回到循环起点继续：

- **Gate FAIL（test 有未通过）**：回到 Step 3（Execute），修复失败的 case，更新 test_execution.json 追加新 round 记录
- **test_execution.json 格式错误**：就地修复 JSON 格式，不需要重跑测试
- **Self-Check 不通过**：就地修复，不需要回退

**Auto Mode：** coding-workflow 扩展自动管理 loop 和回退，skill 中无需处理。

### Agent/Skill 关联

| 步骤 | 执行者 | Agent | Skill | 方式 |
|------|--------|-------|-------|------|
| Execute Tests | 主 agent | — | 无（直接执行） | bash 命令 |
| Fix Failures | 主 agent | — | 无（直接修复） | edit/write |
| Retrospect | subagent | general-purpose | harness-retrospect | task prompt 指定 read |

## Purpose

Execute integration/functional test cases from test_cases_template.json, record results in test_execution.json, and fix any failures.

**测试类型限定：** 本阶段执行集成/功能测试（验证模块间协作、API 契约），不执行 UI 级 E2E 测试。test_cases_template.json 中的 `type` 字段应为 `api`、`integration` 或 `manual`，而非 `ui`。

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

#### Data Flows 消费（仅 L2 plan）

当 interface_chain.json 存在于 topic 目录时：

1. Read interface_chain.json，提取 data_flows 数组
2. 集成测试验证应覆盖每条 data_flow 的完整调用链
3. 验证方式：相邻方法之间的数据传递正确性（输出类型匹配输入类型）
4. 不改 test_cases_template.json schema —— data_flow 覆盖在执行步骤描述中体现

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

### 4a. Retrospect (复盘)

**触发时机：**
- **Auto Mode：** coding-workflow 扩展在 gate PASS 后自动 dispatch retrospect subagent
- **Manual Mode：** 当用户告知 gate check 通过后，手动 dispatch retrospect subagent

然后进入 Phase 5。

1. Dispatch subagent：
   - **Agent**: general-purpose
   - **Model**: 按 taskComplexity 自动选择（retrospect: low）
   - **Task prompt**:
     ```
     你是复盘分析师。按以下步骤执行：

     1. 回顾 system prompt 中已包含的复盘方法论
     2. read 以下交付物文件：
        - `{topic_dir}/test_cases_template.json`
        - `{topic_dir}/changes/evidence/test_execution.json`
     3. 按方法论覆盖两个维度（Phase 执行 + Harness 体验），将结果写入：
        `{topic_dir}/changes/reviews/test_retrospect.md`
     4. YAML frontmatter: `phase: test`, `verdict: pass`
     ```

### 5. Self-Check

**铁律：禁止在未实际运行验证命令的情况下声称完成。**

- [ ] All test cases from template have been executed
- [ ] All tests pass in final round
- [ ] test_execution.json is valid JSON
- [ ] 运行 gate check 脚本确认：
  ```bash
  python3 skills/xyz-harness-gate/scripts/check_gate.py {topic_dir} 4
  ```
- [ ] 读取输出，确认所有检查项 PASS
- [ ] test_results.md still accurate

### 6. 阶段完成提交

**阶段完成时，必须提交并推送所有代码和文档到远程仓库。**

```bash
git add -A
git commit -m "test: test execution for {topic}"
git push
```

确保 `.xyz-harness/` 目录下的测试产出文件都被 git 跟踪。

### 7. Gate Handoff

When opening a separate gate check conversation, submit this file:

| File | Path |
|------|------|
| Test execution | `{topic}/changes/evidence/test_execution.json` |

The gate will cross-reference against `{topic}/test_cases_template.json`.

Open a new Pi session, load the xyz-harness-gate skill, and tell it:
> "Check Phase 4 gate for topic `{topic}`"

### 7. Tell user

When done: "Phase 4 complete. All tests pass. Please run gate check in a separate session. When gate passes, come back and I'll run the retrospective. Then say 'start Phase 5' to continue."

## Self-Check Checklist

### FR→TC 覆盖矩阵
- [ ] 每条 FR 至少有一个 TC 覆盖？
- [ ] TC 标题是否明确关联了对应的 FR/AC？

### 验证方式标注
- [ ] 每个 TC 是否标注了 `verification_method`？（automated/code_review/manual）
- [ ] 代码审查替代的测试是否被如实标注为 `code_review`？

### 指标传递
- [ ] test_cases_template.json 中每个 TC 是否有 `planTaskId`（关联 plan task）？
- [ ] test_cases_template.json 中每个 TC 是否有 `ac_ref`（关联 spec AC）？
