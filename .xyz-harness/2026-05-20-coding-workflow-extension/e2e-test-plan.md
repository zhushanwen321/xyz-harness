---
verdict: pass
---

# E2E Test Plan — coding-workflow Extension

## Test Scenarios

### Scenario 1: Workflow Startup (AC-1, FR-1)

**目标:** 验证 `/coding-workflow` 命令正确初始化工作流状态和 TUI。

**测试环境:** 任意项目目录下启动 Pi，coding-workflow extension 已安装在 `~/.pi/agent/extensions/coding-workflow/`。

**前置条件:** 无活跃 workflow。

**步骤:**
1. 用户输入 `/coding-workflow test-feature`
2. 验证 topic 目录 `.xyz-harness/YYYY-MM-DD-test-feature/` 被创建
3. 验证 TUI widget 显示 5 个 phase，Phase 1 标记为 current
4. 验证 AI 收到 Phase 1 (brainstorming) skill 内容注入
5. 验证 AI 不知道 Phase 2-5 的存在（prompt 中无后续 phase 的 skill 内容）

**期望结果:**
- topic 目录存在
- Widget 显示 `→ Phase 1: Spec (current)`
- AI 的上下文注入包含 `[CODING WORKFLOW — STRICT MODE]` 标记
- AI 的上下文中不包含 writing-plans、phase-dev、phase-test、phase-pr 的 skill 内容

**衡量方式:** TUI 截图 + `before_agent_start` 注入消息内容检查

### Scenario 2: Concurrent Workflow Guard (FR-1, FR-9)

**目标:** 验证已有活跃 workflow 时，新的启动命令被拒绝。

**前置条件:** 一个 workflow 已在运行。

**步骤:**
1. 在已有活跃 workflow 的 session 中输入 `/coding-workflow another-topic`

**期望结果:**
- 显示错误提示："Workflow already active. Use /coding-workflow-abort to cancel first."
- 原有 workflow 状态不受影响

**衡量方式:** 错误提示内容

### Scenario 3: Gate Check — Success Path (AC-2, FR-3)

**目标:** 验证 gate check 通过时的完整流程。

**前置条件:** Phase 1 workflow 已启动，AI 已完成 spec 交付物。

**步骤:**
1. AI 调用 `coding-workflow-gate(phase=1)`
2. gate-check.py 执行并返回 PASS
3. Review subagent 自动 dispatch
4. Review 返回 verdict=pass, must_fix=0
5. Retrospect subagent 自动 dispatch
6. Tool 返回 "Phase 1 gate PASSED"

**期望结果:**
- gate-check.py 被正确执行
- Review 文件 `{topicDir}/changes/reviews/spec_review_v1.md` 被创建
- Retrospect 文件 `{topicDir}/changes/reviews/spec_retrospect.md` 被创建
- Tool 返回成功消息

**衡量方式:** 文件存在性检查 + YAML frontmatter 解析

### Scenario 4: Gate Check — Failure and Retry (AC-2, FR-3)

**目标:** 验证 gate check 失败时 AI 可以修复并重试。

**前置条件:** Phase 1 交付物不完整（如缺少 spec_review）。

**步骤:**
1. AI 调用 `coding-workflow-gate(phase=1)`
2. gate-check.py 返回 FAIL（缺少文件）
3. AI 收到具体失败项
4. AI 修复问题
5. AI 重新调用 `coding-workflow-gate(phase=1)`
6. 这次通过

**期望结果:**
- 第一次调用返回失败项列表
- AI 能理解失败原因并修复
- 第二次调用成功

**衡量方式:** Tool 返回的 error 内容 + 重试结果

### Scenario 5: Review Must-Fix Loop (AC-2, FR-3)

**目标:** 验证 review 发现 must_fix 问题时，AI 可以修复并重新提交。

**前置条件:** Gate check 通过但 review 发现问题。

**步骤:**
1. AI 调用 `coding-workflow-gate(phase=1)`
2. gate-check.py 通过
3. Review subagent 返回 verdict=fail, must_fix=2
4. AI 收到审查结果
5. AI 修复问题
6. AI 重新调用 `coding-workflow-gate(phase=1)`
7. 这次 review 返回 verdict=pass, must_fix=0

**期望结果:**
- 第二次 review 生成 `spec_review_v2.md`
- 版本号正确递增

**衡量方式:** 版本号检查 + must_fix=0 确认

### Scenario 6: Phase Transition (AC-4, FR-4)

**目标:** 验证 phase-start tool 正确推进工作流。

**前置条件:** Phase 1 gate 已通过。

**步骤:**
1. AI 调用 `coding-workflow-phase-start()`
2. currentPhase 从 1 变为 2
3. compact 被触发
4. compact 完成后 Phase 2 skill 内容被注入
5. TUI widget 更新

**期望结果:**
- state.currentPhase === 2
- compact 的 customInstructions 包含 Phase 1 产出物路径
- 新的 before_agent_start 注入 Phase 2 (writing-plans) skill
- Widget 显示 `→ Phase 2: Plan (current)`

**衡量方式:** State 检查 + widget 截图

### Scenario 7: Phase 5 PR Constraint (AC-5, FR-8)

**目标:** 验证 Phase 5 的 "禁止合并 PR" 约束被注入。

**前置条件:** 工作流推进到 Phase 5。

**步骤:**
1. Phase 5 的 before_agent_start 被触发
2. 检查注入内容包含 "MUST NOT merge the PR"
3. Phase 5 gate 通过后，调用 phase-start 返回完成消息

**期望结果:**
- Phase 5 注入内容包含 CRITICAL RULE 段落
- Phase 5 gate 通过后返回 "All phases completed"，不调用 phase-start

**衡量方式:** 注入消息内容检查

### Scenario 8: State Recovery After Session Restart (AC-6, FR-7)

**目标:** 验证 session 重启后 workflow 状态被正确恢复。

**前置条件:** 一个 workflow 正在 Phase 3 运行。

**步骤:**
1. 记录当前 state（currentPhase=3, topicDir, phaseResults）
2. 执行 `/resume` 或重启 Pi
3. session_start 事件触发状态恢复
4. 检查恢复后的 state

**期望结果:**
- state.isActive === true
- state.currentPhase === 3
- state.phaseResults 包含 Phase 1 和 2 的 passed 记录
- TUI widget 正确渲染

**衡量方式:** State 属性检查 + widget 渲染

### Scenario 9: Workflow Abort (FR-9)

**目标:** 验证 abort 命令正确清理所有状态。

**前置条件:** 一个 workflow 正在运行，可能有活跃 subagent 进程。

**步骤:**
1. 用户输入 `/coding-workflow-abort`
2. 活跃子进程被 kill
3. 状态被重置
4. TUI widget 被清除

**期望结果:**
- state.isActive === false
- activeSubprocesses 为空
- Widget 和 status 被清除
- 后续 `/coding-workflow` 可以正常启动新 workflow

**衡量方式:** State 检查 + widget 消失

### Scenario 10: Subagent Spawn Failure (FR-11)

**目标:** 验证 subagent spawn 失败时的错误处理。

**前置条件:** 故意使 `pi` CLI 不可用（如 PATH 中移除）。

**步骤:**
1. AI 调用 `coding-workflow-gate(phase=1)`
2. gate-check.py 通过
3. Review subagent spawn 失败（ENOENT）
4. 错误被 catch，返回明确错误消息

**期望结果:**
- Tool 返回错误消息，包含 "Failed to dispatch review subagent" 或类似文本
- 包含可重试提示
- Workflow 不卡死（可以再次调用 gate）

**衡量方式:** 错误消息内容

### Scenario 11: Subagent Progress Display (AC-3, FR-10)

**目标:** 验证 review/retrospect subagent 在 TUI 上有进度展示。

**前置条件:** Workflow 在 Phase 1，gate 通过。

**步骤:**
1. Gate tool 执行中
2. dispatchReviewSubagent 使用 onUpdate 回调
3. TUI 显示 subagent 运行状态

**期望结果:**
- onUpdate 被调用，streaming 更新 TUI
- renderResult 正确显示 gate 结果（pass/fail）

**衡量方式:** TUI renderCall/renderResult 输出

### Scenario 12: Workflow Status Query (FR-9)

**目标:** 验证 `/coding-workflow-status` 命令显示正确进度。

**前置条件:** Workflow 在 Phase 2 运行，Phase 1 已通过。

**步骤:**
1. 用户输入 `/coding-workflow-status`

**期望结果:**
- notify 弹窗显示当前进度
- 包含: topic name, current phase, 已通过的 phases

**衡量方式:** notify 内容

### Scenario 13: Full 5-Phase Flow (Integration)

**目标:** 端到端验证完整的 5 phase 工作流。

**前置条件:** 无活跃 workflow。

**步骤:**
1. `/coding-workflow integration-test`
2. Phase 1: AI 产出 spec → gate pass → review pass → retrospect
3. `coding-workflow-phase-start` → Phase 2
4. Phase 2: AI 产出 plan → gate pass → review pass → retrospect
5. `coding-workflow-phase-start` → Phase 3
6. Phase 3: AI 产出 code → gate pass → review pass → retrospect
7. `coding-workflow-phase-start` → Phase 4
8. Phase 4: AI 产出 test → gate pass → review pass → retrospect
9. `coding-workflow-phase-start` → Phase 5
10. Phase 5: AI 产出 PR evidence → gate pass → review pass → retrospect
11. Phase 5 完成消息，不需要 phase-start

**期望结果:**
- 所有 5 个 phase 的 gate 通过
- 每个 phase 生成正确的 review 和 retrospect 文件
- TUI widget 在每个 phase 过渡时更新
- Phase 5 完成后 widget 清除

**衡量方式:** 全流程文件检查 + widget 状态

## Test Environment

### 环境要求
- Pi coding agent 已安装
- coding-workflow extension 已安装在 `~/.pi/agent/extensions/coding-workflow/`
- xyz-harness skills 已安装在 `~/.pi/agent/skills/`
- gate-check.py 可执行（Python 3 + PyYAML）
- `subagent-models.json` 配置在 `~/.pi/agent/subagent-models.json`
- harness-retrospect agent 在 `~/.pi/agent/agents/harness-retrospect/agent.md`

### 数据准备
- 测试 topic: `test-feature`
- 每个 phase 需要准备对应的交付物（或由 AI 在测试中生成）

### 清理
- 测试完成后删除 `.xyz-harness/YYYY-MM-DD-test-feature/` 目录
- 检查无残留子进程
