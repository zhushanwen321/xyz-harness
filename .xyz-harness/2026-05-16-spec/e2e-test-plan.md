# E2E 测试计划：Phase 2/3/4 拆分 + Loop 引擎

## 测试环境

| 项目 | 配置 |
|------|------|
| 运行时 | Node.js ≥ 22（`node --import tsx`） |
| 测试框架 | `node:test`（Node.js 内置）或 vitest |
| 测试文件位置 | `extensions/coding-workflow/__tests__/` |
| 项目根 | `/Users/zhushanwen/Code/xyz-harness-engineering-workspace/xyz-harness-engineering` |
| 启动命令 | `npx tsx --test extensions/coding-workflow/__tests__/*.test.ts` |

## 测试分组

### G1：类型系统 + Stage 定义

**文件**：`__tests__/g1-types-stages.test.ts`

**依赖**：无。编译时验证，`npx tsc --noEmit` 必须通过。

| ID | 场景 | 执行方式 |
|----|------|---------|
| TC-1-01 | `currentPhase` 类型为 `1 \| 2 \| 3 \| 4` | `tsc --noEmit` |
| TC-1-02 | `WORKFLOW_STAGES` 含 15 条 + phase 编号正确 | 遍历 `WORKFLOW_STAGES`，断言 `length === 15`，断言 phase 分布 |
| TC-1-03 | `requiresConfirmation` 仅 Stage 2/8/15 为 true | 计数 `requiresConfirmation === true` 的 stage，断言等于 3 |
| TC-1-04 | Stage 13 为集成健康检查 | 读 `WORKFLOW_STAGES[12]`，断言 `type === "automated"` |
| TC-1-05 | LoopConfig 定义完整（13 个字段全部存在） | 读 LoopConfig 对象，断言 13 个字段均非 undefined |
| TC-1-06 | Gate 脚本映射正确（gate_12/gate_13 移除） | 确认无 stage 引用 gate_12 或 gate_13 |
| TC-1-07 | `new GateCheck` 接口正确 | 构造 `{ name: "item_coverage", type: "L1" }`，tsc 不报错 |

### G2：Loop 引擎状态机

**文件**：`__tests__/g2-loop-engine.test.ts`

**依赖**：G1（需要 `LoopEngine` 类和 `LoopConfig` 类型）

| ID | 场景 | 断言 |
|----|------|------|
| TC-2-01 | `init()` 创建空 evidence JSON | `init()` → `existsSync(evidenceFile)` 为 true，`readFileSync` 含 `"rounds": []` |
| TC-2-02 | `init()` 替换 `{topicDir}` | Mock topicDir="test", init → `evidenceFile` 不含 `{topicDir}` |
| TC-2-03 | `startRound()` → phase=in_round | init → startRound → `engine.state.phase === "in_round"` |
| TC-2-04 | onRoundComplete 统计 completedItems | Mock JSON: 3/5 EXECUTED → onRoundComplete → `state.completedItems === 3` |
| TC-2-05 | 全部 EXECUTED → phase=verification | Mock JSON: 5/5 EXECUTED → onRoundComplete → `state.phase === "verification"` |
| TC-2-06 | verification_round.completed → phase=gate_check | Mock JSON: verification_round.completed=true → onRoundComplete → `state.phase === "gate_check"` |
| TC-2-07 | maxRounds 达到但未全部 EXECUTED → failed | maxRounds=2, 2 轮后 1 个 item 仍 ERROR → `state.phase === "failed"` |
| TC-2-08 | `getPrompt()` 变量替换 | 设 `phaseName="E2E"`, `currentRound=1` → `getPrompt()` 返回文本含 `"E2E"` 和 `"1"` |
| TC-2-09 | `getIncompleteItems()` 过滤 | 2/5 EXECUTED → getIncompleteItems 返回数组长度为 3 |
| TC-2-10 | Verification Round 全量重跑 | phase=verification → getIncompleteItems 返回全部 5 个 |
| TC-2-11 | Evidence JSON 每轮追加 | 2 轮完成 → readFileSync → `rounds.length === 2` |

### G3：Gate L1 检查函数

**文件**：`__tests__/g3-l1-checks.test.ts`

**依赖**：G2（需要 evidence JSON 格式定义）

| ID | 场景 | 断言 |
|----|------|------|
| TC-3-01 | item_coverage: 全部覆盖 → PASS | 构造 JSON 含 5 个 case_id + plan 声明 5 个 → `pass === true` |
| TC-3-02 | item_coverage: 遗漏 1 个 → FAIL | JSON 含 4 个 + plan 声明 5 个 → `pass === false`, output 含 case_id |
| TC-3-03 | executed_per_item: 全有 EXECUTED → PASS | 每个 item≥1 条 EXECUTED → `pass === true` |
| TC-3-04 | executed_per_item: 1 个只有 ERROR → FAIL | item_3 全是 ERROR → `pass === false` |
| TC-3-05 | verification_round_completed: true → PASS | JSON `verification_round.completed=true` → `pass === true` |
| TC-3-06 | verification_round_completed: false → FAIL | JSON `verification_round.completed=false` → `pass === false` |
| TC-3-07 | verification_all_executed: 全 EXECUTED → PASS | VR 全 EXECUTED → `pass === true` |
| TC-3-08 | verification_all_executed: 有 ERROR → FAIL | VR 含 1 个 ERROR → `pass === false` |
| TC-3-09 | evidence_files_exist: 文件存在且 >1KB → PASS | 写 2KB 文件 → `pass === true` |
| TC-3-10 | evidence_files_exist: 文件不存在 → FAIL | 路径不存在 → `pass === false` |
| TC-3-11 | evidence_files_exist: 文件过小 → FAIL | 写 10 字节文件 → `pass === false` |

### G4：Phase 3 Gate 组合

**文件**：`__tests__/g4-phase3-gate.test.ts`

**依赖**：G3（需要 L1 检查函数）+ G5（StateManager.advanceTo）

| ID | 场景 | 断言 |
|----|------|------|
| TC-4-01 | 5 项 L1 全 PASS → Gate PASS | 构造全合规 evidence → `passed === true` |
| TC-4-02 | 任一 L1 FAIL → Gate FAIL（短路） | 构造 item_coverage FAIL → `passed === false` |
| TC-4-03 | L1 全 PASS + L2 不可用 → 降级 PASS | Mock L2 网络错误 → `passed === true` |
| TC-4-04 | Gate 输出格式 | `{ passed: boolean; output: string }` |
| TC-4-05 | Gate FAIL 描述首个失败检查项 | item_coverage FAIL → `output.includes("item_coverage")` |

### G5：State Manager Loop 支持

**文件**：`__tests__/g5-state-manager.test.ts`

**依赖**：G1（需要 `LoopState` 类型定义）

| ID | 场景 | 断言 |
|----|------|------|
| TC-5-01 | save/load `LoopState` 往返 | 创建 LoopState → save → load → 字段一致 |
| TC-5-02 | 旧 state JSON（无 loopState 字段）不报错 | load 仅含 stages 的 JSON → 不抛异常，loopState 为 undefined |
| TC-5-03 | advanceTo Phase 3→4 | advanceTo(state, 13, 14, 4, "summary") → state.currentStage=14, state.currentPhase=4 |
| TC-5-04 | rollback Phase 3→2 | rollback(state, 10) → state.currentStage=10, state.currentPhase=2 |
| TC-5-05 | startStage 创建 Phase 3 stage 记录 | startStage(state, 13, 3) → state.stages 含 `{number:13, status:"active"}` |

### G6：向后兼容

**文件**：`__tests__/g6-backward-compat.test.ts`

**依赖**：G5（State Manager load 逻辑）

| ID | 场景 | 断言 |
|----|------|------|
| TC-6-01 | 旧 16-stage state JSON 加载 | 构造 `currentPhase=2, stages.length=16` → load → 无异常 |
| TC-6-02 | 旧 state 识别为 legacy | load 旧 state → `state.stages.length === 16` → 引擎标记 legacy |
| TC-6-03 | 旧 state 推进到旧 E2E（Stage 13）按旧逻辑 | Mock 推进 Stage 13 → 仍执行原 gate_12 |

### G7：集成测试（AC 覆盖补齐）

**文件**：`__tests__/g7-integration.test.ts`

**依赖**：G2 + G4 + G5（需要完整 Loop 引擎 + Gate + StateManager）

| ID | 覆盖 AC | 场景 | 断言 |
|----|---------|------|------|
| TC-7-01 | AC1 | Phase 2→3 自动过渡无确认 | Stage 12 pass → 检测 `currentPhase` 自动变为 3，无确认对话框触发 |
| TC-7-02 | AC2 | 健康检查失败阻塞 Loop | Mock health check 返回 HTTP 500 → Phase 3 不进入 Loop，回退到 Stage 10 |
| TC-7-03 | AC4 | ERROR 场景 spawn subagent 修复 | Mock item status=ERROR → 验证引擎/agent 触发 fixer subagent → 验证 evidence 记录 `fix_commit` 非空 |
| TC-7-04 | AC8 | Gate PASS 触发人工确认 | Gate PASS + confirmationRequired=true → 触发确认流程 |
| TC-7-05 | AC9 | Gate FAIL 回退 Loop | Gate FAIL + rounds < maxRounds → phase 回到 in_round |
| TC-7-06 | AC11 | Phase 4 全流程收尾 | Stage 14→15 正常推进，Stage 15 pass → state.completed=true |
| TC-7-07 | AC12 | 确认点仅 3+Loop 出口 | 审计 `requiresConfirmation` 分布 = Stage 2/8/15 |
| TC-7-08 | AC13 | 旧 format 迁移 | 旧 state JSON（16 stages, currentPhase=2）→ 引擎自动映射到新 Phase 2/3/4 |

## 依赖关系图

```
G1 (类型+Stage) ──┬── G2 (Loop引擎) ──┬── G3 (L1检查) ── G4 (Phase3 Gate)
          │                   │                       │
          ├── G5 (State Mgr) ─┘                       │
          │                                           │
          └── G6 (向后兼容)                            │
                                │
          G7 (集成测试) ──────────────────────────────┘
          (依赖 G2 + G4 + G5)
```

- G1→G2：Loop 引擎需类型定义
- G1→G5：State Manager 需 LoopState 类型
- G2→G3：L1 检查需 evidence JSON 格式
- G3+G5→G4：Phase 3 Gate 需 L1 函数 + advanceTo
- G5→G6：向后兼容需 StateManager.load
- G2+G4+G5→G7：集成测试需完整引擎

**注**：G5 依赖 G1（类型）但不依赖 G2（引擎）。G1→G5 与 G1→G2 可并行，但 G2 和 G5 互不依赖。

## 测试数据准备

所有测试数据由 `__tests__/fixtures/` 目录提供：

| 文件 | 内容 |
|------|------|
| `fixtures/e2e-evidence-full.json` | 5 case_id, 2 轮, 1 ERROR, verification_round 全 EXECUTED |
| `fixtures/e2e-evidence-incomplete.json` | 5 case_id, 1 轮, 2 个只有 ERROR |
| `fixtures/e2e-evidence-empty.json` | 初始空 evidence JSON |
| `fixtures/screenshot-valid.png` | 2KB 有效 PNG |
| `fixtures/screenshot-tiny.png` | 10 字节最小 PNG |
| `fixtures/workflow-state-legacy.json` | 16 stages, currentPhase=2 |
| `fixtures/workflow-state-phase3.json` | 15 stages, currentPhase=3, Stage 13 active |

## 执行策略

```
Wave 1: [G1] 串行 (tsc 检查，G5 依赖 G1 类型定义)
Wave 2: [G2, G5] 并行 (G2 依赖 G1，G5 依赖 G1)
Wave 3: [G3, G6] 并行 (G3 依赖 G2, G6 依赖 G5)
Wave 4: [G4] 串行 (依赖 G3 + G5)
Wave 5: [G7] 串行 (依赖全部)
```

启动命令：`npx tsx --test extensions/coding-workflow/__tests__/*.test.ts`

## 覆盖率目标

| 模块 | 目标 |
|------|------|
| `types.ts` 新增类型 | 编译通过 = 100% |
| `loop-engine.ts` | 行覆盖 ≥ 80% |
| `gates/common.ts` L1 检查 | 行覆盖 ≥ 90% |
| `gates/gate_phase3.ts` | 行覆盖 ≥ 80% |
| `state-manager.ts` Loop 方法 | 行覆盖 ≥ 80% |

**总计**：37 个测试用例，预估 20 分钟执行时间（无浏览器/后端依赖）。
