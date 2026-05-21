# Pi Goal 插件优化计划

> 基于 Codex `/goal` 源码与 Pi `pi-extension-goal` 的逐项对比分析
> 日期：2026-05-19

---

## 背景

Pi goal 插件（`/Users/zhushanwen/Code/xyz-pi-extensions/goal`）在设计上参考了 Codex `/goal` 的架构，状态机、steering 模板、任务追踪等 API surface 基本对齐。但在运行时关键路径上有若干差异会导致错误行为或体验不佳。

详见 `docs/research-agent-goal-loop.md` 中的完整对比分析。

---

## P0：正确性 Bug（必须修）

这两个是运行时会直接导致错误行为的。

### P0-1：Token 会计排除 cached tokens

**问题**：当前 `state.tokensUsed += usage.totalTokens`，含 cached tokens。长对话中 cached 占比很大（可能 70%+），导致预算虚高、过早触发 budget_limited。

**修改**：`src/index.ts` 的 `message_end` 事件

```typescript
// 当前（错误）
state.tokensUsed += usage.totalTokens;

// 修正（排除 cached，与 Codex 一致）
const inputTokens = usage.inputTokens ?? 0;
const cachedTokens = usage.cachedInputTokens ?? 0;
const outputTokens = Math.max(usage.outputTokens ?? 0, 0);
const delta = (inputTokens - cachedTokens) + outputTokens;
state.tokensUsed += Math.max(delta, 0);
```

**前置**：需要确认 Pi Extension API 的 `usage` 对象是否暴露 `inputTokens` / `cachedInputTokens` / `outputTokens` 字段。如果不暴露，退而求其次用 `totalTokens` 但在文档中标注为粗略值。

### P0-2：消灭 setTimeout，预算检查改为同步

**问题**：当前在 `agent_end` 中用 `setTimeout(120s)` 做 grace period。Node.js 单线程下如果模型推理超过 2 分钟（goal 场景完全可能），setTimeout 不会准时执行。而且 budget steering 注入后模型可能在同一 turn 内继续消耗大量 token，setTimeout 到期时已经超了。

**修改**：`src/index.ts` 的 `agent_end` 事件，去掉 setTimeout，改为两阶段同步检查：

```typescript
// agent_end 中的预算检查逻辑

// Phase 1: 首次接近预算 → 注入 steering，标记 sent，继续一轮
if (tokenBudget && tokensUsed >= tokenBudget * 0.9 && !budgetLimitSteeringSent) {
    budgetLimitSteeringSent = true;
    persistState(ctx);
    updateWidget(ctx);
    pi.sendUserMessage(budgetLimitPrompt(state, "token"), { deliverAs: "steer" });
    return; // 给一轮收尾机会
}

// Phase 2: 已发 steering 且仍在消耗 → 直接终止
if (tokenBudget && tokensUsed >= tokenBudget && budgetLimitSteeringSent) {
    state.status = transitionStatus(state.status, "budget_limited");
    persistState(ctx);
    updateWidget(ctx);
    ctx.ui.notify("Token 预算已耗尽，Goal 已终止。", "warning");
    return;
}
```

这样不需要 setTimeout，预算检查在每个 `agent_end` 同步执行，可靠且可预测。

---

## P1：可靠性改进（建议修）

### P1-3：Continuation 防重入保护

**问题**：`agent_end` 中直接调 `sendUserMessage(continuationPrompt)`，没有检查是否已有 pending 的 followUp 或 steering。如果 `before_agent_start` 注入了 steering 且 agent 还没处理完，可能导致消息堆积。

**修改**：`src/index.ts`

```typescript
// 新增：标记是否有 pending 的注入消息
let hasPendingInjection = false;

// before_agent_start 中
pi.on("before_agent_start", async (_event, ctx) => {
    if (!state || !isActiveStatus(state.status)) return;
    // ... context protection ...
    hasPendingInjection = true;  // 标记
    return { message: { ... } };
});

// agent_end 中
pi.on("agent_end", async (_event, ctx) => {
    if (!state || !isActiveStatus(state.status)) return;

    // 防重入：如果有 pending injection，跳过本轮 continuation
    if (hasPendingInjection) {
        hasPendingInjection = false;
        return;
    }
    // ... normal continuation logic ...
});
```

### P1-4：Blocked 检测改为"同一原因重复"

**问题**：当前 stallCount 只要连续 N turn 无 complete_task 就触发 blocked。但模型可能在每轮推进不同子任务，只是没调 complete_task（例如在调试一个复杂 bug）。

**修改**：`src/state.ts` 新增 blocker 追踪字段

```typescript
interface GoalRuntimeState {
    // ... existing fields ...
    lastBlockerReason: string | null;  // 上次 report_blocked 的原因
    sameBlockerCount: number;          // 同一原因连续出现次数
}
```

`src/index.ts` 的 `agent_end` 中修改 stall 逻辑：

```typescript
if (progressThisRound === 0) {
    // 只在模型主动 report_blocked 且原因相同时才计数
    if (state.lastBlockerReason) {
        state.sameBlockerCount++;
    }
    state.stallCount++;
} else {
    state.stallCount = 0;
    state.sameBlockerCount = 0;
    state.lastBlockerReason = null;
}

// 仅在 sameBlockerCount >= maxStallTurns 时自动 blocked
// stallCount 降级为纯信息展示，不再触发状态转换
if (state.sameBlockerCount >= state.budget.maxStallTurns) {
    state.status = transitionStatus(state.status, "blocked");
}
```

### P1-5：report_blocked 记录原因

**问题**：当前 `report_blocked` 只设置状态，不追踪原因。blocked 后 resume 时模型不知道之前为什么被阻塞。

**修改**：`src/index.ts` 的 `report_blocked` action

```typescript
case "report_blocked": {
    if (!params.reason) throw new Error("report_blocked requires reason");
    state.lastBlockerReason = params.reason;
    state.sameBlockerCount++;
    // 只在连续同一原因 >= maxStallTurns 时才自动 blocked
    if (state.sameBlockerCount >= state.budget.maxStallTurns) {
        state.status = transitionStatus(state.status, "blocked");
    }
    return makeResult(
        `已报告阻塞: ${params.reason} (${state.sameBlockerCount}/${state.budget.maxStallTurns})`,
    );
}
```

同时修改 resume 时注入 blocker 信息到 continuation prompt：

```typescript
// templates.ts 的 continuationPrompt 中新增
const blockerInfo = state.lastBlockerReason
    ? `\n\n⚠ 上次阻塞原因: ${state.lastBlockerReason}。请尝试不同的方法绕过此障碍。`
    : "";
```

---

## P2：体验优化（可选）

### P2-6：预算预警阈值

**问题**：当前只在预算耗尽时才通知。接近预算时（70%、90%）没有任何预警。

**修改**：`src/state.ts` 新增字段

```typescript
interface GoalRuntimeState {
    // ... existing fields ...
    budgetWarning70Sent: boolean;
    budgetWarning90Sent: boolean;
}
```

`src/index.ts` 的 `agent_end` 中，在预算检查前加入预警：

```typescript
if (state.budget.tokenBudget) {
    const pct = state.tokensUsed / state.budget.tokenBudget;
    if (pct >= 0.9 && !state.budgetWarning90Sent) {
        state.budgetWarning90Sent = true;
        ctx.ui.notify("⚠ Token 预算已用 90%，请开始收尾。", "warning");
    } else if (pct >= 0.7 && !state.budgetWarning70Sent) {
        state.budgetWarning70Sent = true;
        ctx.ui.notify("Token 预算已用 70%，注意控制范围。", "info");
    }
}
```

### P2-7：预算紧张时优先 complete_goal

**问题**：当所有任务已完成但 goal 未调 `complete_goal` 时，当前直接发 followUp 提醒。如果此时预算紧张，应该优先让模型确认完成而不是继续工作。

**修改**：`src/index.ts` 的 `agent_end` 中

```typescript
const incomplete = getIncompleteTasks(state.tasks);
const budgetTight = state.budget.tokenBudget
    && state.tokensUsed >= state.budget.tokenBudget * 0.8;

if (incomplete.length === 0 && total > 0) {
    if (budgetTight) {
        // 预算紧张时直接要求完成，不继续循环
        pi.sendUserMessage(
            `所有任务已完成，且 token 预算已用 ${Math.round(state.tokensUsed / state.budget.tokenBudget! * 100)}%。` +
            `请立即调用 goal_manager 的 complete_goal 完成目标。` +
            `\n\n目标: ${state.objective}`,
            { deliverAs: "steer" },
        );
    } else {
        // 正常提醒
        pi.sendUserMessage(
            `所有 ${total} 个任务已完成。请调用 goal_manager 的 complete_goal 完成目标。`,
            { deliverAs: "followUp" },
        );
    }
}
```

### P2-8：Widget 进度条

**问题**：当前 widget 只显示百分比数字，没有视觉化的进度条。

**修改**：`src/widget.ts` 新增辅助函数，在 budget 信息行加入进度条

```typescript
function renderProgressBar(pct: number, width: number = 10): string {
    const filled = Math.round(pct * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
}

// 使用示例：
// Token: ████████░░ 80%
const tokenPct = state.tokensUsed / state.budget.tokenBudget;
lines.push(`  Token: ${renderProgressBar(tokenPct)} ${Math.round(tokenPct * 100)}%`);
```

---

## 不建议做的事

| 想法 | 为什么不做 |
|------|-----------|
| Evidence 自动验证（跑命令/检查文件来验证） | 这不是 extension 该做的事，需要完全不同的架构（独立 evaluator agent）。Codex 也没做，靠模型自审 |
| Per-tool token 会计 | Pi Extension API 不暴露 per-tool token 数据，强行做只能靠估算，不如不做 |
| 多 session 多 goal | Pi 架构是单 session 单 agent，不需要这个能力 |
| SQLite 替换 session entries | session entries 已经够用，换 SQLite 增加依赖和复杂度，收益不大 |
| Objective 强弱评分 | 过度工程。用户自己知道 goal 写得好不好 |

---

## 执行计划

| 顺序 | 改动 | 文件 | 预估行数 |
|------|------|------|---------|
| 1 | P0-1: Token 会计排除 cached | `src/index.ts` | ~5 行 |
| 2 | P0-2: 消灭 setTimeout，改同步检查 | `src/index.ts` | ~25 行 |
| 3 | P1-3: Continuation 防重入 | `src/index.ts` | ~10 行 |
| 4 | P1-4+5: Blocked 检测改同一原因 + report_blocked 记录原因 | `src/state.ts` + `src/index.ts` | ~30 行 |
| 5 | P2-6: 预算预警阈值 | `src/state.ts` + `src/index.ts` | ~15 行 |
| 6 | P2-7: 预算紧张时优先 complete_goal | `src/index.ts` | ~15 行 |
| 7 | P2-8: Widget 进度条 | `src/widget.ts` | ~10 行 |

总计约 110 行改动，分布在 3 个文件中。P0 先行，P1 紧随，P2 按需。
