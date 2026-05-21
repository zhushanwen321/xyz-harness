---
review:
  type: plan_review
  round: 1
  timestamp: "2026-05-21T10:30:00"
  target: ".xyz-harness/2026-05-20-coding-workflow-extension/plan.md"
  verdict: fail
  summary: "计划评审完成，第1轮，1条MUST FIX，需修改后重审"

statistics:
  total_issues: 9
  must_fix: 1
  must_fix_resolved: 0
  low: 5
  info: 3

issues:
  - id: 1
    severity: MUST_FIX
    location: "plan.md:Task 4 Step 5 (gate tool) + lib/subagent.ts:runSingleAgent"
    title: "activeSubprocesses 从未被填充，abort 命令无法终止运行中的 subagent"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: LOW
    location: "plan.md:Task 4"
    title: "Task 4 过大（14 steps），单个 subagent 执行风险高"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: LOW
    location: "plan.md:Task 4 Step 5 (gate tool execute)"
    title: "usageLine 变量创建后未在返回消息中使用"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: LOW
    location: "plan.md:Task 1 (lib/model-resolve.ts):resolveModel()"
    title: "resolveModel() 两个分支返回相同结果，fallback 链路为死代码"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 5
    severity: LOW
    location: "plan.md:Task 4 Step 5 + spec.md:Constraints"
    title: "plan 统一使用 sendUserMessage，与 spec 列出的 sendMessage/sendUserMessage 两个 API 有偏差"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 6
    severity: LOW
    location: "plan.md:Task 4 Step 3:getExpertReviewerContent()"
    title: "skill fallback 路径仅检查 ~/.pi/agent/skills/，可能遗漏项目级 skill 安装"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 7
    severity: INFO
    location: "plan.md:Task 1 (lib/model-resolve.ts):THINKING_TO_PI"
    title: "THINKING_TO_PI 映射 max→xhigh 需与 Pi CLI --thinking 参数验证"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 8
    severity: INFO
    location: "plan.md:Task 4 Step 6 (phase-start tool):ctx.compact()"
    title: "ctx.compact() 的 onComplete/onError 回调 API 需与 Pi Extension API 验证"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 9
    severity: INFO
    location: "plan.md:Task 4 Step 12:pi.registerMessageRenderer"
    title: "pi.registerMessageRenderer API 是否存在需验证"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 计划评审 v1

## 评审记录
- 评审时间：2026-05-21 10:30
- 评审类型：计划评审
- 评审对象：`.xyz-harness/2026-05-20-coding-workflow-extension/plan.md` + `e2e-test-plan.md`

---

## 1. Spec 完整性

### 目标明确性
**通过。** 目标清晰：构建一个 Pi extension，通过注册自定义 tools 实现自动化的 5-phase gate 门禁 + review + retrospect 流水线，同时限制 AI 只感知当前 phase。

### 范围合理性
**通过。** 范围边界明确：4 个文件（index.ts + 2 lib/ 模块 + gate-check.py），无外部依赖，代码自包含。Complexity Assessment 合理标注为中高复杂度。

### 验收标准可量化性
**基本通过，有小问题。** AC-1 到 AC-7 大部分可量化（文件存在性、TUI 渲染、YAML 解析），但 AC-1 中 "AI 不知道 Phase 2-5 的存在" 这条标准难以机械验证，需要人工检查注入内容。

### 待决议项
无 `[待决议]` 标记。

---

## 2. Plan 可行性

### 任务拆分
**基本合理，有一个显著问题。**

- Task 1 (model-resolve.ts)：粒度合适，纯函数模块。
- Task 2 (subagent.ts)：粒度合适，spawn 逻辑封装。
- Task 3 (gate-check.py)：简单文件复制，无风险。
- Task 4 (index.ts)：**过大**。14 个 steps，涵盖 2 个 tools、3 个 commands、3 个 event handlers、state 持久化/恢复、widget 渲染、message renderer。虽然代码骨架完整（subagent 可以逐步执行），但单个 subagent 的上下文窗口压力很大，任一步骤出错都会影响后续步骤。

### 依赖关系
**正确。** Dependency Graph 清晰：
```
Task 1 → Task 2 → Task 4
Task 3 ──────────→ Task 4
```
Wave Schedule 合理（Wave 1 并行 Task 1+3，Wave 2 Task 2，Wave 3 Task 4）。

### 工作量估算
**合理。** 预估 1000-1500 行，4 个文件。Task 4 的 index.ts 预计 600-800 行，是主要工作量。

### 遗漏检查
对照 spec 逐条，所有 FR 和 AC 都有对应 task 覆盖。详见第 3 节。

---

## 3. Spec 与 Plan 一致性

### FR 覆盖矩阵

| Spec 需求 | Plan Task | 状态 | 备注 |
|-----------|-----------|------|------|
| FR-1: Workflow 启动 | Task 4 (command) | ✅ | Step 7 |
| FR-2: AI 上下文注入 | Task 4 (before_agent_start) | ✅ | Step 8 |
| FR-3: Gate Tool | Task 3 + Task 4 (gate tool) | ⚠️ | 见 Issue #1 — activeSubprocesses 未填充 |
| FR-4: Phase Start Tool | Task 4 (phase-start) | ✅ | Step 6 |
| FR-5: TUI Widget | Task 4 (updateWidget) | ✅ | Step 11 |
| FR-6: Subagent Dispatch | Task 2 + Task 4 (dispatch helpers) | ✅ | Step 4 |
| FR-7: State Persistence | Task 4 (persistState/reconstructState) | ✅ | Step 10 |
| FR-8: Phase 5 约束 | Task 4 (before_agent_start + gate) | ✅ | Step 8 + Step 5 |
| FR-9: 状态查询与管理 | Task 4 (commands) | ⚠️ | 见 Issue #1 — abort 无法终止 subagent |
| FR-10: Custom Rendering | Task 4 (renderCall/renderResult) | ✅ | Step 5 + Step 6 |
| FR-11: 错误处理 | Task 2 + Task 4 (try-catch) | ✅ | spawn error 被正确捕获 |

### AC 覆盖矩阵

| AC | Plan Task | E2E Scenario | 状态 |
|----|-----------|-------------|------|
| AC-1: 启动与 Phase 1 | Task 4 | Scenario 1 | ✅ |
| AC-2: Gate 检查 | Task 3 + 4 | Scenario 3, 4, 5 | ✅ |
| AC-3: Review & Retrospect | Task 2 + 4 | Scenario 3, 11 | ✅ |
| AC-4: Phase Transition | Task 4 | Scenario 6 | ✅ |
| AC-5: Phase 5 PR | Task 4 | Scenario 7 | ✅ |
| AC-6: 状态持久化 | Task 4 | Scenario 8 | ✅ |
| AC-7: Extension 全局可用 | 文件放置 | 无专属 scenario | ⚠️ 隐含在环境要求中 |

### Plan 中的额外工作
- `getExpertReviewerContent` 添加了 spec 未提及的 fallback 到 `~/.pi/agent/skills/` 路径。这是防御性措施，合理。
- `registerMessageRenderer` 注册自定义消息渲染器，spec 未提及。属于 TUI 增强，合理但需验证 API 存在性。

---

## 4. Execution Groups 合理性

### 分组合理性
**通过。** 单一 BG1 组，4 个文件（≤ 10），4 个 Task。所有文件都是后端 TypeScript + Python，无前端/后端混合。

### 依赖关系
**正确。** Wave 编排合理：
- Wave 1: Task 1 + Task 3 并行（无依赖，无文件冲突）
- Wave 2: Task 2（依赖 Task 1）
- Wave 3: Task 4（依赖 Task 1, 2, 3）

### Subagent 配置
**基本完整。** 指定了 Agent (general-purpose)、Model (router-openai/glm-5.1)、读取文件、创建文件。注入上下文包含 Task 描述 + spec FR 章节 + Pi extension API 文档。

### 上下文充分性
**通过。** 每个 Task 都有完整的代码骨架，subagent 不需要做设计决策，只需按骨架写入文件。

---

## 5. 代码骨架质量

### 完整性
**通过。** 无 TBD/TODO/placeholders。所有函数签名、类型定义、import 语句都完整。

### Pi Extension API 用法
**基本正确，有几个待验证点：**
- `pi.registerTool` 的参数签名（`execute` 函数的 6 个参数）需与 API 文档对照
- `ctx.compact()` 的 `onComplete`/`onError` 回调是否存在（Issue #8）
- `pi.registerMessageRenderer` 是否存在（Issue #9）

### 类型一致性
**通过。** `WorkflowState`、`PhaseConfig`、`TaskComplexity`、`ThinkingLevel`、`SingleResult`、`UsageStats` 类型在文件间一致使用。import 路径正确（`./lib/model-resolve.js`、`./lib/subagent.js`）。

---

## 6. E2E Test Plan 评审

### 覆盖度
**良好。** 13 个 scenario 覆盖了主要功能路径：
- 正常路径：Scenario 1, 3, 6, 13
- 异常路径：Scenario 2, 4, 5, 10
- 状态管理：Scenario 8, 9
- 约束验证：Scenario 7
- UI 验证：Scenario 11, 12

### 遗漏
- AC-7 (Extension 全局可用) 没有专属 scenario，仅在测试环境中隐含。
- 无性能/压力测试 scenario（如 subagent 长时间运行后的 abort）。

---

### 发现的问题

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | MUST FIX | plan.md:Task 4 Step 5 + lib/subagent.ts:runSingleAgent | **activeSubprocesses 从未被填充，abort 无法终止运行中的 subagent。** spec FR-3 step 4 要求 "子进程引用加入 activeSubprocesses 列表"，FR-9 要求 "遍历活跃子进程引用列表，对每个调用 kill()"。但 `runSingleAgent` 在函数内部 spawn ChildProcess，不返回进程引用。`activeSubprocesses` 数组始终为空，abort 命令的 kill 循环是死代码。 | 方案 A：让 `runSingleAgent` 接受一个 `processRegistry?: ChildProcess[]` 参数，spawn 后 push 进程引用，exit 后移除。方案 B：让 `runSingleAgent` 返回 `{ result: Promise<SingleResult>, process: ChildProcess }`，由调用方管理生命周期。方案 A 更简洁，推荐采用。 |
| 2 | LOW | plan.md:Task 4 | **Task 4 过大（14 steps）。** 单个 subagent 需要处理 2 个 tools + 3 个 commands + 3 个 event handlers + state + widget + message renderer，约 700-800 行代码。任一步骤出错都会影响后续。 | 建议拆分为 Task 4a (tools + dispatch helpers) 和 Task 4b (commands + events + state + widget)，或将 Task 4 的 Step 7-12 拆为独立 Task 5。由于代码骨架完整，不阻塞执行，但增加 subagent 失败风险。 |
| 3 | LOW | plan.md:Task 4 Step 5 | **usageLine 变量创建后未使用。** gate tool 成功路径中 `const usageLine = formatUsageStats({...})` 创建了 zero-value 统计，但返回消息中未引用。 | 两个方向：(a) 删除这行代码；(b) 让 `dispatchReviewSubagent` 返回 `SingleResult` 并将实际 usage 传入 `formatUsageStats`，将统计信息附加到返回消息中。(b) 更符合 spec FR-10 "usage stats" 的展示要求。 |
| 4 | LOW | plan.md:Task 1:resolveModel() | **resolveModel() 两个分支返回相同结果。** `if (fallbackRefs.length > 0) return { ok: true, ref: modelRef }` 和 `return { ok: true, ref: modelRef }` 完全相同，fallback 链路从未生效。 | 如果 coding-workflow 不需要 `resolveModel`（只通过 `resolveModelByComplexity` 选择模型），可以删除此函数。如果保留，应实现真正的 fallback 尝试逻辑。 |
| 5 | LOW | plan.md:Task 4 Step 6-7 vs spec.md:Constraints | **sendMessage vs sendUserMessage 偏差。** spec 约束表列出两个 API：`pi.sendMessage()` 用于 phase 转换消息，`pi.sendUserMessage()` 用于启动指令。plan 统一使用 `pi.sendUserMessage({ deliverAs: "followUp" })`。 | 如果 Pi API 中两个方法行为不同（system message vs user message），plan 应按 spec 区分使用。如果 `sendUserMessage` 的 `deliverAs: "followUp"` 已满足两种场景，应在 plan 中注明选择理由。 |
| 6 | LOW | plan.md:Task 4 Step 3:getExpertReviewerContent() | **skill fallback 路径仅覆盖全局目录。** `getExpertReviewerContent` 的 fallback 读取 `~/.pi/agent/skills/xyz-harness-expert-reviewer/SKILL.md`，但 skill 可能安装在项目级目录（如 `<project>/.pi/skills/` 或 `<project>/skills/`）。gate tool 的 execute 函数无 `systemPromptOptions` 访问权限，只能用 fallback。 | 考虑增加项目级路径 fallback：先尝试 `~/.pi/agent/skills/`，再尝试 `ctx.cwd` 相关路径。或者将 `systemPromptOptions.skills` 在 `before_agent_start` 中缓存到模块级变量，供 gate tool 使用。后者更可靠。 |
| 7 | INFO | plan.md:Task 1:THINKING_TO_PI | `max → xhigh` 映射需与 Pi CLI `--thinking` 参数的有效值验证。如果 Pi CLI 使用 `max` 而非 `xhigh`，会导致参数错误。 | 实现时运行 `pi --help` 或查看 Pi 文档确认有效值。 |
| 8 | INFO | plan.md:Task 4 Step 6:ctx.compact() | `ctx.compact({ onComplete, onError })` 的回调 API 需验证。如果 Pi 的 `compact` 方法不支持回调，phase 转换的后续注入逻辑需要改用事件监听或其他机制。 | 实现时参考 todolist example 或 Pi Extension API 文档确认 `compact` 的完整签名。 |
| 9 | INFO | plan.md:Task 4 Step 12 | `pi.registerMessageRenderer` API 是否存在需验证。spec 约束表中未列出此 API。 | 如果不存在，删除 Step 12 即可（`display: false` 的消息本身不会渲染）。 |

> 优先级定义：
> - **MUST FIX**：不修复则评审不通过，会阻塞流程。
> - **LOW**：建议修复，但不阻塞。
> - **INFO**：观察记录，无需操作。

#### 等级判定校准

Issue #1 标 MUST_FIX 的理由：spec FR-9 明确要求 abort 能终止运行中的 subagent，而当前实现中 `activeSubprocesses` 始终为空，kill 循环是死代码。用户执行 abort 后，subagent 进程会作为孤儿进程继续运行直到自行结束，违反 spec 的清理要求。如果该问题在生产环境会导致进程泄漏和资源浪费，就必须标 MUST_FIX。

---

## 7. 结论

**需修改后重审。**

Issue #1 (activeSubprocesses 未填充) 是 spec 合规性缺口，必须修复。修复方案明确（让 runSingleAgent 注册进程引用），不涉及架构变更。

其余 LOW/INFO 问题建议一并处理，但不阻塞第二轮评审。

### Summary

计划评审完成，第1轮，1条MUST FIX，需修改后重审。
