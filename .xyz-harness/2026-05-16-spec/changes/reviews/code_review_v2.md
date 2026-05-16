---
review:
  type: code_review
  round: 2
  timestamp: "2026-05-16T23:30:00"
  target: "full codebase review (dca06b9..HEAD + unstaged)"
  verdict: fail
  summary: "编码评审第2轮，3条 MUST FIX（Phase 3 流程不可运行），需修改后重审"

statistics:
  total_issues: 8
  must_fix: 3
  must_fix_resolved: 0
  low: 3
  info: 2

issues:
  - id: 1
    severity: MUST_FIX
    location: "extensions/coding-workflow/index.ts"
    title: "Stage 13 完成后 Loop 引擎不被初始化，Phase 3 流程断裂"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 2
    severity: MUST_FIX
    location: "extensions/coding-workflow/loop-engine.ts:62-90"
    title: "init() 不解析 itemSource 提取目标列表，totalItems 永远为 0，Loop 状态机无法推进到 verification/gate_check"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 3
    severity: MUST_FIX
    location: "extensions/coding-workflow/index.ts:527-537"
    title: "Phase 3 出口确认是假的 — 文本写 'Awaiting user confirmation' 但从不调用 ctx.ui.confirm()，直接推进到 Phase 4"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 4
    severity: LOW
    location: "extensions/coding-workflow/gates/common.ts:574-585"
    title: "item_coverage 依赖 evidence.state.totalItems（AI 可写），不从 itemSourcePath 解析真实目标列表"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 5
    severity: LOW
    location: "extensions/coding-workflow/index.ts:539-548"
    title: "Gate FAIL 重试逻辑中 engine.startRound() 后未保存 state，引擎重启后轮次信息丢失"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 6
    severity: LOW
    location: "extensions/coding-workflow/state-manager.ts:26"
    title: "state.legacy 标记已设置但 index.ts 从不读取，AC13 向后兼容检测逻辑缺失"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 7
    severity: INFO
    location: "extensions/coding-workflow/gates/gate_12.ts + gate_13.ts"
    title: "gate_12/gate_13 是旧流程遗留代码，新流程中不再被任何 Stage 引用（Stage 13 无 gateScript）"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 8
    severity: INFO
    location: "extensions/coding-workflow/loop-engine.ts"
    title: "LoopEngine 内存状态 (_state) 从不持久化到 WorkflowState.loopState，session 重载后 Loop 状态丢失"
    status: open
    raised_in_round: 2
    resolved_in_round: null
---

# 编码评审 v2（独立复审）

## 评审记录
- 评审时间：2026-05-16 23:30
- 评审类型：编码评审（Stage 10），第2轮独立复审
- 评审对象：完整代码库（commit dca06b9 + 后续修改），不依赖 v1 评审结论
- 评审人：独立 reviewer agent

## v1 问题处理说明

v1 标记了 5 条 MUST FIX，v2 标记为 "全部 resolved"。经独立验证：

| v1 Issue | 独立验证结果 |
|----------|-------------|
| #1 widget.ts Phase 标签 | **已修复。** `Phase ${state.currentPhase}` 支持 1-4 |
| #2 console.warn | **已修复。** 降级信息写入 output 字段 |
| #3 GateRunner phase3 | **已修复。** case "phase3" 返回防护性 FAIL |
| #4 any 类型 | **已修复。** 全部使用 EvidenceFile/LoopConfig 具体类型 |
| #5 测试断言 | **已修复。** 使用 `import type` + E2E_LOOP_CONFIG 运行时验证 |

5/5 确认修复。但 v1 的审查范围有限——当时 index.ts 尚未集成 Loop 引擎。现在 index.ts 已集成，出现了新的 MUST FIX。

## MUST FIX Issues

### Issue #1: Stage 13 完成后 Loop 引擎不被初始化

**文件**: `extensions/coding-workflow/index.ts`
**严重度**: MUST FIX
**Spec 违反**: AC1, D5, D7.3

**问题**: Phase 3 的控制流设计为：

```
Stage 12 pass → Stage 13 (健康检查) → Loop 初始化 → Loop 执行 → Gate → Phase 4
```

但代码中只有 Stage 12 → Stage 13 的过渡（index.ts:301-325），**没有 Stage 13 → Loop 的过渡**。当 AI 调用 `harness_stage_complete` 完成 Stage 13 时，代码走到 `findNextStageDef(13)` → 找到 Stage 14 → 直接 `advanceTo(13, 14, 4, ...)` 推进到 Phase 4。

Loop 引擎永远不会被初始化。`harness_loop_round_complete` 和 `harness_loop_exit` 工具虽然已注册，但没有代码会在 Phase 3 中触发它们。

**修复方向**: 在 `harness_stage_complete` 的 Stage 12 特殊处理之后（或类似位置），添加 Stage 13 的特殊处理：

```typescript
// Stage 13 pass → 初始化 Loop 引擎
if (state.currentStage === 13 && state.currentPhase === 3) {
  stateMgr.completeStage(state, state.currentStage, summary);
  stateMgr.save(state, ctx.cwd);
  
  // 初始化 LoopEngine
  const engine = new LoopEngine(E2E_LOOP_CONFIG, ctx.cwd, state.topicDir);
  engine.init();
  engine.startRound();
  
  // 发送 Loop 首轮 prompt
  const prompt = engine.getPrompt();
  pi.sendMessage({ ... }, { triggerTurn: true });
  
  return { ... };
}
```

### Issue #2: init() 不解析 itemSource，totalItems 永远为 0

**文件**: `extensions/coding-workflow/loop-engine.ts:62-90`
**严重度**: MUST FIX
**Spec 违反**: D5 (初始化步骤), D11 (itemSource 解析规则)

**问题**: `LoopEngine.init()` 创建空 evidence JSON 时设置 `totalItems: 0`，且没有任何代码更新这个值。

Spec D5 明确要求："1. 初始化：读取 LoopConfig → 创建空 JSON → 从 itemSource 提取目标列表"。D11 进一步定义了 `itemSource: "plan_tasks"` 时应从 `e2e-test-plan.md` 解析 `test_groups[].cases[]`。

后果：
1. `onRoundComplete()` 中 `totalItems` 始终为 0，而判断条件 `completedCount >= totalItems && totalItems > 0` 有 `totalItems > 0` 的 guard → **永远不会进入 verification 或 gate_check 状态**
2. `item_coverage` L1 检查依赖 `evidence.state.totalItems`，永远为 0 → **覆盖检查无效**
3. `getPrompt()` 中 `{totalItems}` 变量始终显示 "0"
4. `getIncompleteItems()` 的正常模式返回空列表（因为 `allSeenIds` 为空）

**修复方向**: 在 `init()` 中实现 D11 描述的 itemSource 解析逻辑：

```typescript
init(): void {
  // ... 现有代码 ...
  
  // 从 itemSource 提取目标列表
  if (this.config.itemSource === "plan_tasks") {
    const planPath = join(this.projectRoot, ".xyz-harness", this.topicDir, "e2e-test-plan.md");
    const items = parsePlanTasks(planPath); // 解析 YAML frontmatter → cases[]
    initialEvidence.state.totalItems = items.length;
    this._state.items = items;
  }
}
```

### Issue #3: Phase 3 出口确认是假的

**文件**: `extensions/coding-workflow/index.ts:527-537`
**严重度**: MUST FIX
**Spec 违反**: D9 (Phase 3 出口确认), AC8 (Gate PASS 后弹出人工确认)

**问题**: 当 Loop Gate PASS 且 `confirmationRequired=true` 时，代码文本写 "Awaiting user confirmation" 但**从未调用 `ctx.ui.confirm()`**。紧接着直接执行 `stateMgr.advanceTo(state, 13, 14, ...)` 推进到 Phase 4。

```typescript
if (config.confirmationRequired) {
  nextAction = `Gate PASSED. Awaiting user confirmation.\n${gateResult.output}`;
  // 确认后推进到 Phase 4  ← 注释说"确认后"，但下面直接推进了
  const s14 = findStageDef(14);
  if (s14) {
    stateMgr.advanceTo(state, 13, 14, s14.phase, "Phase 3 Loop gate passed", s14.name);
    // ... 直接发送 Stage 14 prompt ...
  }
}
```

Spec D9 明确要求："Phase 3 出口：E2E JSON + Gate 结果审核，确认后进入 Phase 4"。AC8："Phase 3 Gate PASS 后弹出人工确认"。

**修复方向**: 在 Gate PASS 后添加真正的确认调用：

```typescript
if (config.confirmationRequired) {
  const ok = await ctx.ui.confirm(
    "Phase 3 E2E Testing Complete",
    `Gate PASSED.\n${gateResult.output}\n\nProceed to Phase 4 (Push/CI/Deploy)?`
  );
  if (!ok) {
    nextAction = "User declined. Phase 3 remains active.";
    return { content: [{ type: "text", text: nextAction }], details: { ... } };
  }
}
```

注意：`harness_loop_round_complete` 的 `execute` 函数签名中没有 `ctx` 参数。需要检查工具注册 API 是否提供 `ctx`——如果当前 API 不提供，需要在工具参数中增加 confirm 回调或将确认逻辑放到 `harness_stage_complete` 中。

## LOW Issues

### Issue #4: item_coverage 依赖 AI 可写的字段

**文件**: `extensions/coding-workflow/gates/common.ts:574-585`

`item_coverage` 检查的 "期望值" 来自 `evidence.state.totalItems`，而非从独立来源（e2e-test-plan.md）解析。虽然引擎写入 `state` 对象（AI 只写入 `rounds`），但如果 `init()` 的 totalItems 为 0（Issue #2），AI 可以在 JSON 中写入任意值来绕过检查。

**依赖**: 此问题与 Issue #2 关联——如果 `init()` 正确解析 itemSource 并设置 totalItems，且引擎覆盖写入 `state`，则 AI 无法篡改此值。

### Issue #5: Gate FAIL 重试后 LoopState 不持久化

**文件**: `extensions/coding-workflow/index.ts:539-548`

Gate FAIL 后调用 `engine.startRound()` 发起新一轮，但 `engine._state` 仅存在于 `harness_loop_round_complete` 工具调用的局部变量中。`stateMgr.save()` 保存的是 `WorkflowState`，不包含 LoopEngine 的内存状态。如果 session 重载（Pi reload），Loop 引擎会重建，状态丢失。

### Issue #6: legacy 标记不生效

**文件**: `extensions/coding-workflow/state-manager.ts:26`

`state.legacy = true` 在 load() 中设置，但 index.ts 中没有任何代码读取此标记。AC13 要求的向后兼容逻辑（"检测 legacy 格式 → 自动映射"）未实现。

## INFO

### Issue #7: 旧流程 gate_12/gate_13 代码

`gate_12.ts`（E2E 证据验证）和 `gate_13.ts`（测试评审验证）仍然存在且被 GateRunner 导入。新流程中：
- Stage 13（集成健康检查）没有 gateScript
- E2E 评审由 Phase 3 Gate（gate_phase3.ts）处理
- 单元测试评审并入 Stage 12 prompt

这些代码在新流程中不会被触发，但也不会造成问题。可在后续清理。

### Issue #8: LoopEngine 内存状态不持久化

`LoopEngine._state` 只存在于每次 `harness_loop_round_complete` 调用时新建的实例中。虽然每次 `onRoundComplete` 会从 evidence JSON 文件重建状态，但 `WorkflowState.loopState` 字段从未被写入。这导致：
- `widget.ts` 无法显示 Loop 进度（round/items count）
- session reload 后需要从 evidence JSON 重建 Loop 上下文

当前实现通过 "每次读 evidence JSON" 来规避此问题，功能上是正确的，但 widget 无法展示 Loop 状态。

## Spec 合规矩阵

| Spec 项 | 状态 | 说明 |
|---------|------|------|
| AC1 Phase 2→3 自动过渡 | 部分 | Stage 12→13 过渡已实现，Stage 13→Loop 未实现 |
| AC2 健康检查失败阻塞 | 部分 | prompt 中描述了回退逻辑，但无引擎级强制执行 |
| AC3 JSON evidence 写入 | 通过 | LoopEngine init() 创建正确格式 |
| AC4 ERROR spawn fixer | 未实现 | roundPrompt 提到 spawn subagent，但引擎无此逻辑 |
| AC5 Verification Round 全量重跑 | 通过 | getIncompleteItems() verification 分支返回全部 items |
| AC7 Gate L1 检查正确判定 | 通过 | 5 个 L1 检查函数逻辑正确（但 totalItems=0 影响 item_coverage） |
| AC8 Gate PASS 后人工确认 | 未实现 | 确认文本存在但无实际 confirm 调用 |
| AC9 Gate FAIL 回退 Loop | 通过 | startRound() 重置为 in_round |
| AC10 max_rounds 上限 FAIL | 通过 | onRoundComplete() 有 maxRounds 判断 |
| AC12 确认点 | 通过 | Stage 2/8/15 + Loop confirmationRequired |
| AC13 向后兼容 | 未实现 | legacy 标记存在但不读取 |
| D4 LoopConfig | 通过 | 13 字段完整 |
| D8 Stage 编号 | 通过 | 15 stage, 编号与 spec 一致 |
| D9 确认点 | 部分 | Phase 3 出口确认是假的 |
| D10 工具签名 | 通过 | harness_loop_round_complete + harness_loop_exit 已注册 |
| D13 数据流 | 部分 | AI 写 rounds、引擎写 state 的规则已实现，但 totalItems 不更新 |

## 代码质量评价

**正面**:
1. TypeScript 类型系统完整，tsc --noEmit 通过
2. 禁止 any 规范全面遵守
3. console 输出全部清除，无 TUI 渲染泄漏
4. L1 检查函数类型签名统一，可维护性好
5. 测试覆盖 7 个测试文件，覆盖核心状态机转换
6. evidence JSON 追加模式正确实现，不覆盖旧轮

**关键缺陷**:
Phase 3 的端到端流程不可运行。三个 MUST FIX 形成因果链：
- Issue #2 (totalItems=0) → Loop 状态机无法推进
- Issue #1 (Stage 13→Loop 断裂) → Loop 引擎不被初始化
- Issue #3 (假确认) → 即使修好前两个，Phase 3 出口也无真正确认

三个问题修复后，Phase 3 端到端流程才能走通。

## 结论

**需修改后重审。** 3 条 MUST FIX 均为 Phase 3 核心流程问题，导致 E2E Loop 功能完全不可用。建议按 Issue #2 → #1 → #3 的顺序修复。
