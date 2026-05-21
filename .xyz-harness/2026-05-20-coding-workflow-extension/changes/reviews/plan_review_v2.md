---
verdict: pass
must_fix: 0

review:
  type: plan_review
  round: 2
  timestamp: "2026-05-21T12:00:00"
  target: ".xyz-harness/2026-05-20-coding-workflow-extension/plan.md"
  summary: "计划评审完成，第2轮，0条MUST FIX，通过"

statistics:
  total_issues: 10
  must_fix: 0
  must_fix_resolved: 1
  low: 5
  info: 3

issues:
  - id: 1
    severity: MUST_FIX
    location: "plan.md:Task 4 Step 5 (gate tool) + lib/subagent.ts:runSingleAgent"
    title: "activeSubprocesses 从未被填充，abort 命令无法终止运行中的 subagent"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 2
    severity: LOW
    location: "plan.md:Task 4"
    title: "Task 4 过大（14 steps），单个 subagent 执行风险高"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: LOW
    location: "plan.md:Task 4 Step 5"
    title: "usageLine 变量创建后未在返回消息中使用"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 4
    severity: LOW
    location: "plan.md:Task 1:resolveModel()"
    title: "resolveModel() 两个分支返回相同结果，fallback 链路为死代码"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 5
    severity: LOW
    location: "plan.md:Task 4 Step 6-7 vs spec.md:Constraints"
    title: "plan 统一使用 sendUserMessage，与 spec 列出的 sendMessage/sendUserMessage 两个 API 有偏差"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 6
    severity: LOW
    location: "plan.md:Task 4 Step 3:getExpertReviewerContent()"
    title: "skill fallback 路径仅检查 ~/.pi/agent/skills/，可能遗漏项目级 skill 安装"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 7
    severity: INFO
    location: "plan.md:Task 1:THINKING_TO_PI"
    title: "THINKING_TO_PI 映射 max→xhigh 需与 Pi CLI --thinking 参数验证"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 8
    severity: INFO
    location: "plan.md:Task 4 Step 6:ctx.compact()"
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
  - id: 10
    severity: LOW
    location: "plan.md:Task 4 Step 4:dispatchReviewSubagent return"
    title: "dispatchReviewSubagent 成功路径未返回 result 字段，gate tool 中 usageLine 始终为空"
    status: open
    raised_in_round: 2
    resolved_in_round: null
---

# 计划评审 v2

## 评审记录
- 评审时间：2026-05-21 12:00
- 评审类型：计划评审
- 评审对象：`.xyz-harness/2026-05-20-coding-workflow-extension/plan.md`（修复后版本）

---

## 1. MUST_FIX 修复验证

### Issue #1: activeSubprocesses 从未被填充 — **已修复**

逐项验证完整调用链路：

| 检查点 | 结果 | 证据 |
|--------|------|------|
| `activeSubprocesses` 声明 | OK | Task 4 Step 2: `const activeSubprocesses: ChildProcess[] = [];` |
| `runSingleAgent` 接受 `processRegistry` 参数 | OK | Task 2: `processRegistry?: ChildProcess[]` 在 params 类型中 |
| spawn 后注册进程 | OK | Task 2: `if (processRegistry) { processRegistry.push(proc); proc.on("close", () => { ... splice ... }) }` |
| `dispatchReviewSubagent` 传入 `activeSubprocesses` | OK | Task 4 Step 4: `processRegistry: activeSubprocesses` |
| `dispatchRetrospectSubagent` 传入 `activeSubprocesses` | OK | Task 4 Step 4 注释: "with `processRegistry: activeSubprocesses` for abort support" |
| abort 命令终止子进程 | OK | Task 4 Step 7: "for each proc in activeSubprocesses: proc.kill()" + "activeSubprocesses.length = 0" |

完整链路：`abort 命令 → activeSubprocesses[].forEach(kill) → runSingleAgent spawn 时 push，exit 时 splice → 进程生命周期完整管理`。

修复方案采用了 v1 建议的方案 A（`processRegistry` 参数），实现简洁正确。

---

## 2. 上一轮 LOW/INFO 问题复核

| # | 状态 | 说明 |
|---|------|------|
| #2 | 未修复 | Task 4 仍为 14 steps。代码骨架完整可逐步执行，风险可控。保留 LOW |
| #3 | **已修复** | `usageLine` 现在在 gate tool 的两个 return 分支（Phase 5 完成 + 非 Phase 5）中均被引用 |
| #4 | 未修复 | `resolveModel()` 两个分支仍返回相同值。但该函数从未被 plan 中任何代码调用（全部走 `resolveModelByComplexity`），是纯死代码，不影响功能。建议实现时直接删除。保留 LOW |
| #5 | 未修复 | 仍统一使用 `sendUserMessage`。如果 `deliverAs: "followUp"` 已覆盖两种场景，实际不影响功能。保留 LOW |
| #6 | **已修复** | Step 8 `before_agent_start` 中 `cachedSkills = event.systemPromptOptions.skills || []` 缓存了全部 skill（含项目级），`getExpertReviewerContent` 优先查 `cachedSkills`，仅在缓存为空时 fallback 到全局目录 |
| #7 | 维持 INFO | 实现时验证 |
| #8 | 维持 INFO | 实现时验证 |
| #9 | 维持 INFO | 实现时验证 |

---

## 3. 新发现

### Issue #10: dispatchReviewSubagent 成功路径未返回 result

**位置：** Task 4 Step 4 `dispatchReviewSubagent` 函数

**问题：** 函数成功路径返回 `{ success: true, reviewPath }`，未携带 `result` 字段。但 gate tool Step 5 中构建 usage 统计依赖 `reviewResult.result`：

```typescript
const usageLine = reviewResult.result
    ? formatUsageStats(reviewResult.result.usage, reviewResult.result.model)
    : "";
```

由于 `result` 在成功时为 `undefined`，`usageLine` 始终为空字符串，usage 统计信息永远不会展示给用户。

**严重性判定：** 不影响核心功能（gate 检查、review、retrospect 均正常工作），只是缺失辅助信息展示。LOW。

**修复方向：** 在 `dispatchReviewSubagent` 成功返回时加入 `result`：`return { success: true, reviewPath, result };`

---

## 4. 等级判定校准

Issue #10 不满足 MUST_FIX 标准：不导致数据丢失、功能失效、数据语义错误、重复副作用或时序错误。仅影响展示信息的完整性。标为 LOW 正确。

---

### 发现的问题

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | ~~MUST FIX~~ → resolved | plan.md:Task 4 Step 5 + lib/subagent.ts | activeSubprocesses 未填充 | 已修复 |
| 2 | LOW | plan.md:Task 4 | Task 4 过大（14 steps） | 建议实现时关注 subagent 上下文压力 |
| 3 | ~~LOW~~ → resolved | plan.md:Task 4 Step 5 | usageLine 未使用 | 已修复 |
| 4 | LOW | plan.md:Task 1:resolveModel() | resolveModel 死代码（从未被调用） | 实现时直接删除该函数 |
| 5 | LOW | plan.md:Task 4 Step 6-7 | sendMessage/sendUserMessage 偏差 | 实现时确认 API 行为后统一 |
| 6 | ~~LOW~~ → resolved | plan.md:Task 4 Step 3 | skill fallback 路径不足 | 已修复（通过 cachedSkills） |
| 7 | INFO | plan.md:Task 1 | THINKING_TO_PI 映射验证 | 实现时验证 |
| 8 | INFO | plan.md:Task 4 Step 6 | ctx.compact() API 验证 | 实现时验证 |
| 9 | INFO | plan.md:Task 4 Step 12 | registerMessageRenderer API 验证 | 实现时验证 |
| 10 | LOW | plan.md:Task 4 Step 4 | dispatchReviewSubagent 成功路径未返回 result，usage 统计始终为空 | 成功返回时加入 `result: result` |

> 优先级定义：
> - **MUST FIX**：不修复则评审不通过，会阻塞流程。
> - **LOW**：建议修复，但不阻塞。
> - **INFO**：观察记录，无需操作。

---

## 5. 结论

**通过。**

上一轮唯一的 MUST_FIX（Issue #1: activeSubprocesses 未填充）已完全修复。调用链路完整：spawn 注册 → dispatch 传入 → abort 终止 → exit 清理。

新发现的 Issue #10 是辅助信息缺失，不影响核心功能，标为 LOW。

剩余 4 个 LOW + 3 个 INFO 均为实现阶段的注意事项，不阻塞 plan 执行。

### Summary

计划评审完成，第2轮通过，0条MUST FIX。
