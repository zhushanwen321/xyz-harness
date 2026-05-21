# Implementation Plan: Phase 2/3/4 拆分 + E2E 证据-判定分离

## 复杂度评估

**L2**：跨 8+ 文件、新增模块（loop-engine.ts）、状态机设计、向后兼容约束。

## Task 列表

### T1：类型系统扩展

**描述**：扩展 `types.ts` 支持新 Phase 编号和 Loop 抽象。

**验收标准**：
- `WorkflowState.currentPhase` 类型为 `1 | 2 | 3 | 4`
- `StageDefinition.phase` 类型为 `1 | 2 | 3 | 4`
- 新增 `LoopConfig` 接口（含所有 D4.2 字段）
- 新增 `GateCheck` 类型（`{ name: string; type: "L1" | "L2" }`）
- 新增 `LoopState` 接口（round/items/maxRounds 等）
- 新增 `LoopRoundCompleteParams` 和 `LoopExitParams`
- tsc --noEmit 通过

| 文件 | 改动 |
|------|------|
| `extensions/coding-workflow/types.ts` | 修改现有类型 + 新增 5 个接口 |

**风险点**：
- `currentPhase` 从 `1 | 2` 扩展到 `1 | 2 | 3 | 4` 后，所有 switch/if 检查 phase 的地方需要更新。当前使用 `currentPhase` 的地方在 `index.ts`（推算 phase）、`widget.ts`（显示 phase 名称）和 `state-manager.ts`（`startStage`/`advanceTo`/`rollback` 的 phase 参数）。

---

### T2：Stage 定义重构

**描述**：按 D1 拆分 `WORKFLOW_STAGES` 为 Phase 1/2/3/4。

**验收标准**：
- Phase 1 (Stage 1-8) 不变
- Phase 2 (Stage 9-12)：TDD RED → 编码 → 编码评审 → 单元测试
- Phase 3 (Stage 13)：集成健康检查，type="automated"，gate 为简单连通性检查
- Phase 4 (Stage 14-15)：推送/CI/部署 → 自动复盘
- `requiresConfirmation` 仅 Stage 2/8/15 为 true（Phase 3 出口确认由 Loop 引擎处理。**注**：Spec D9 写 Stage 14 实际意为 Stage 15，此处以 D8 编号表为准——Stage 14=推送，Stage 15=复盘需要确认）
- 原 Stage 14（测试评审）移除，单元测试评审并入 Stage 12 prompt
- 原 Stage 16（自动复盘）→ Stage 15
- tsc --noEmit 通过

| 文件 | 改动 |
|------|------|
| `extensions/coding-workflow/stages.ts` | 重写 Phase 2-4 的 stage 定义 |

**风险点**：
- 14 个 Stage（原 16）→ 8+4+1+2=15，编号变化需同步 gate 脚本引用
- `gateScript` 字段在 gate_03/05/07/10/13/14 中的编号不变（gate 脚本按 gateNumber 查找，与 stage number 无关）


**Stage→Gate 映射表（旧→新）**：

| 旧编号 | 旧 Gate | 新编号 | 新 Gate | 处理 |
|--------|---------|--------|---------|------|
| 9 (TDD RED) | gate_09 | 9 | gate_09 | 保留不变 |
| 10 (编码) | gate_09 | 10 | gate_09 | 保留不变 |
| 11 (编码评审) | gate_10 | 11 | gate_10 | 保留不变 |
| 12 (单元测试) | gate_11 | 12 | gate_11 | 保留不变 |
| 13 (E2E) | gate_12 | — | — | 移除（Loop 替代） |
| 14 (测试评审) | gate_13 | — | — | 移除（评审并入 Stage 12） |
| 15 (推送+CI) | gate_14 | 14 | gate_14 | 保留不变 |
| 16 (复盘) | — | 15 | — | 无 gate |
| — | — | Loop | gate_phase3 | 新增 |
---

### T3：Loop 配置定义 (已并入 T2)

说明：LoopConfig 定义已并入 T2（与 Stage 定义同属 stages.ts 重构）。

---

### T4：Loop 引擎实现

**依赖**：T1（类型定义）、LoopConfig（T2）、T9（Prompt 模板文件已创建）


**描述**：实现 `loop-engine.ts`，通用 Loop 状态机。

**验收标准**：
- `LoopEngine` 类，构造函数接受 `LoopConfig` + `projectRoot` + `topicDir`
- `init()`：创建空 evidence JSON，替换 `{topicDir}`
- `startRound()`：读取 JSON → 统计 `state.completedItems` → 判断下一状态（新一轮/Verification/Gate）
- `onRoundComplete()`：从磁盘读 JSON → 更新 LoopState → 判断下一状态
- `getPrompt()`：读取 roundPrompt 模板 → 替换变量 → 返回给 AI
- `getIncompleteItems()`：返回所有缺少 `completedStatus` 的 item
- `runGate()`：依次执行 L1 检查 + L2 调用
- Verification Round 自动启用全量 case（不过滤 incomplete）
- 状态枚举：`initializing | in_round | verification | gate_check | done | failed`
- 单元测试覆盖核心状态转换

| 文件 | 改动 |
|------|------|
| 新增 `extensions/coding-workflow/loop-engine.ts` | ~180 行 |

**风险点**：
- 状态机正确性——每一轮完成后的状态判断逻辑
- Evidence JSON 格式与 `itemIdField`/`allowedStatuses` 的对应
- 并发安全——引擎是否需要在 round 执行期间锁定

---

### T5：Gate L1 预定义检查函数

**描述**：实现 5 个预定义 L1 检查函数。

**验收标准**：
- `item_coverage(evidence, config, planPath)`：从 e2e-test-plan.md 提取 task 列表（解析 YAML frontmatter → `test_groups[].cases[]` → 提取 `case_id`，复用 `gates/common.ts` 的 `extractYamlBlock`），验证 JSON 覆盖所有 task
- `executed_per_item(evidence, config)`：每个 item_id 至少 1 条 status=completedStatus
- `verification_round_completed(evidence, config)`：JSON.verification_round.completed === true
- `verification_all_executed(evidence, config)`：Verification Round 所有 item status=completedStatus
- `evidence_files_exist(evidence, config, cwd)`：读取 evidence 中声明的文件路径，验证存在 + size > 1KB
- 每个函数签名统一：`(evidence, config, cwd, itemSourcePath?) => { pass: boolean; output: string }`
- `checkNoMustFix` 保持不变（被现有 gate 脚本使用）

| 文件 | 改动 |
|------|------|
| `extensions/coding-workflow/gates/common.ts` | 新增 ~100 行 |

---

### T6：Phase 3 Gate 实现

**描述**：创建 `gate_phase3.ts`，组合预定义 L1 检查 + L2 调用。

**验收标准**：
- 按 `gateChecks` 列表依次执行 L1 检查
- 任一 L1 FAIL → 立即返回 FAIL
- 全部 L1 PASS → 调用 `verifyGateL2`（复用现有框架）
- L2 输入：JSON evidence 全文作为 deliverable
- Gate 输出格式与现有 gate 一致（`{ passed: boolean; output: string }`）
- 从 `LoopConfig.gateChecks` 读取检查列表（非硬编码）

| 文件 | 改动 |
|------|------|
| 新增 `extensions/coding-workflow/gates/gate_phase3.ts` | ~50 行 |

---

### T7：主入口 Loop 命令集成

**描述**：在 `index.ts` 注册 Loop 相关工具和 Phase 过渡逻辑。

**验收标准**：
- 注册 `harness_loop_round_complete` 工具（参数：无，引擎自动读 JSON）
- 注册 `harness_loop_exit` 工具（参数：reason: string）
- Phase 2→3 过渡：Stage 12 pass 后自动触发 Loop 初始化
- Phase 3→4 过渡：Gate PASS 后调用 `advanceTo` 推进到 Stage 14
- Phase 3 内部不通过 `harness_stage_complete` 推进（由 loop-engine 管理）
- AI context 重置：Phase 2 完成后发送 Phase 3 初始 prompt
- Loop 确认：Gate PASS 后触发 `harness_stage_complete` 确认流程

| 文件 | 改动 |
|------|------|
| `extensions/coding-workflow/index.ts` | ~120 行 |

****Phase 3 控制流详细说明**：

1. Stage 13（健康检查）通过 `harness_stage_complete` 完成
2. `index.ts` 检测：`currentStage=13` pass + `currentPhase=3` → 不调用 `findNextStage` → 直接初始化 `LoopEngine`
3. Loop 执行期间不通过 `harness_stage_complete` 推进——`harness_loop_round_complete` 由 loop-engine 接管
4. Loop Gate PASS → engine 调用 `StateManager.advanceTo(state, 13, 14, 4, summary)`
5. 此后恢复正常 stage 推进（Stage 14 → Stage 15）

**风险点**：
- 与现有 `harness_stage_complete` 流程的集成——Phase 3 不使用 stage 推进，需在 index.ts 的 `harness_stage_complete` handler 中增加 Phase 3 分支
- `widget.ts` 中 phase 名称显示需要更新（Phase 2→3→4）
- Loop 引擎初始化失败时的回退路径

---

### T8：状态管理器 Loop 支持

**描述**：扩展 `state-manager.ts` 支持 LoopState 持久化。

**验收标准**：
- `WorkflowState` 新增 `loopState?: LoopState` 字段
- `save()` 序列化 LoopState 到 state JSON
- `load()` 反序列化 LoopState
- 向后兼容：旧 state JSON 无 `loopState` 字段时不报错
- LoopState 包含当前轮次、完成情况等

| 文件 | 改动 |
|------|------|
| `extensions/coding-workflow/state-manager.ts` | ~50 行 |
| `extensions/coding-workflow/types.ts` | LoopState 类型（已在 T1） |

---

### T9：E2E Loop Prompt 模板

**描述**：创建 `e2e-loop-round.md` 模板文件。

**验收标准**：
- 内容按 D7.2 规范
- 包含所有变量占位符（`{phaseName}`/`{currentRound}`/`{maxRounds}`/`{incompleteItems}`/`{evidenceFilePath}`/`{completedStatus}`/`{allowedStatuses}`/`{batchSize}`）
- 描述清晰：禁止 AI 写 PASS/FAIL，只写 EXECUTED/ERROR
- 包含约束说明（batch size、screenshot 要求、harness_loop_round_complete 调用）

| 文件 | 改动 |
|------|------|
| 新增 `extensions/coding-workflow/loop-prompts/e2e-loop-round.md` | ~30 行 |

---

### T10：harness-e2e-tester Agent 适配

**描述**：更新 E2E 测试 agent 的语义和 JSON 写入规范。

**验收标准**：
- agent.md 说明 status 只写 EXECUTED/ERROR（不写 PASS/FAIL）
- 说明 evidence 字段格式（cdp_commands/screenshots/error/fix_commit）
- 说明 JSON evidence 文件路径和追加写入方式
- 说明 harness_loop_round_complete 调用时机

| 文件 | 改动 |
|------|------|
| `~/.pi/agent/agents/harness-e2e-tester/agent.md` | ~30 行 |

**风险点**：
- 这是 Pi 全局 agent，改动会影响所有使用该 agent 的项目
- 向后兼容策略：agent.md 描述两种模式——(1) 有 Loop 引擎时（Phase 3）：status 只写 EXECUTED/ERROR，evidence JSON 写入 `evidenceFile` 路径；(2) 无 Loop 引擎时（旧 Phase 2 Stage 13）：status 使用传统 PASS/FAIL/SKIP。Agent 通过检查 `evidenceFile` 环境变量是否存在来判断模式。

---

### T11：向后兼容处理

**描述**：确保旧 state JSON 文件可被新版本读取。

**验收标准**：
- 检测 `currentPhase: 2` 且 `stages.length === 16` → legacy 模式
- Legacy 模式下不启用 Phase 3 Loop
- 旧 state 推进到 Stage 13（原 E2E 测试）时仍按旧逻辑执行
- 文档说明迁移路径

| 文件 | 改动 |
|------|------|
| `extensions/coding-workflow/index.ts` | ~30 行（在 session_start 中） |

---

### T12：集成验证

**描述**：端到端验证 Phase 2→3→4 全流程。

**验收标准**：
- 创建 mock state JSON（Phase 1 完成，Phase 2 开始）
- 验证 Phase 2 各 Stage 正常推进
- 验证 Stage 12 pass 后自动触发 Phase 3
- 验证 Loop 初始化正确创建 JSON evidence
- 模拟 1 轮 Loop 完成，验证 JSON 正确写入
- 验证 Gate PASS/FAIL 行为
- 验证 Phase 3→4 过渡
- 验证确认点正确触发

**验证方式**：单元测试（loop-engine.ts）+ 集成测试脚本。

| 文件 | 改动 |
|------|------|
| 测试文件 | ~150 行 |

---

## 依赖关系

```
T1 (types) ──┬── T2 (stages) ──┬── T7 (index.ts)
       │                 │
       ├── T3 (LoopConfig)┤
       │                 │
       ├── T4 (loop-engine) ──┬── T7
       │                     │
       ├── T5 (L1 checks) ──┬── T6 (gate_phase3) ── T7
       │                   │
       └── T8 (state mgr) ─┘
         
T9 (prompt template) ── T4 ── T7

T10 (e2e-tester agent) ── (独立，无依赖)

T11 (向后兼容) ── T7

T12 (集成验证) ── T7
```

**并行机会**：
- T1 + T9 + T10 可并行（类型定义 + prompt 模板 + agent 文档，无代码依赖）
- T2 + T3 + T5 可并行（stages 重写 + LoopConfig + L1 检查，都依赖 T1 但互相独立）
- T4 依赖 T1 + T3（loop-engine 需要类型 + Config）
- T6 依赖 T5（gate_phase3 使用 L1 检查）
- T7 依赖 T2 + T4 + T6（index.ts 集成所有模块）
- T8 依赖 T1（state manager 只需 LoopState 类型定义，不需要 engine 实现）

## Execution Groups

### Group 1：类型 + 模板 + 文档（可并行）

| Task | Agent | Model | 文件 |
|------|-------|-------|------|
| T1 | harness-executor | llm-simple-router/glm-5.1 | `types.ts` |
| T9 | harness-executor | llm-simple-router/glm-5-turbo | 新增 `loop-prompts/e2e-loop-round.md` |
| T10 | harness-executor | llm-simple-router/glm-5-turbo | `harness-e2e-tester/agent.md` |

### Group 2：Stage 定义 + L1 检查（并行）

| Task | Agent | Model | 文件 |
|------|-------|-------|------|
| T2 | harness-executor | llm-simple-router/glm-5.1 | `stages.ts` |
| T3 | harness-executor | llm-simple-router/glm-5.1 | `stages.ts`（T2 同一文件） |
| T5 | harness-executor | llm-simple-router/glm-5.1 | `gates/common.ts` |

说明：T2 和 T3 修改同一文件，建议合并为一个 agent 执行。

### Group 3：Loop 引擎 + Gate + State Manager（串行依赖）

| Task | Agent | Model | 文件 |
|------|-------|-------|------|
| T4 | harness-executor | llm-simple-router/glm-5.1 | 新增 `loop-engine.ts` |
| T6 | harness-executor | llm-simple-router/glm-5.1 | 新增 `gates/gate_phase3.ts` |
| T8 | harness-executor | llm-simple-router/glm-5.1 | `state-manager.ts` + `types.ts` |

### Group 4：主入口集成 + 向后兼容

| Task | Agent | Model | 文件 |
|------|-------|-------|------|
| T7 | harness-executor | llm-simple-router/glm-5.1 | `index.ts` |
| T11 | harness-executor | llm-simple-router/glm-5.1 | `index.ts`（T7 同一文件） |

说明：T7 和 T11 修改同一文件，合并为一个 agent 执行。

### Group 5：集成验证

| Task | Agent | Model | 文件 |
|------|-------|-------|------|
| T12 | harness-executor | llm-simple-router/glm-5.1 | 手动集成测试脚本 |

## 执行顺序

```
Wave 1: [T1, T9, T10] 并行
Wave 2: [T2+T3, T5] 并行（依赖 T1）
Wave 3: [T4] 串行（依赖 T1+T3）
Wave 4: [T6, T8] 并行（依赖 T5, T4）
Wave 5: [T7+T11] 串行（依赖 T2+T4+T6+T8）
Wave 6: [T12] 串行（依赖全部）
```

## 工作量估算

| Wave | 任务 | 估算行数 | 估算时间 |
|------|------|---------|---------|
| 1 | T1, T9, T10 | 80 + 30 + 30 = 140 行 | 15 min |
| 2 | T2+T3, T5 | 100 + 100 = 200 行 | 20 min |
| 3 | T4 | 180 行 | 25 min |
| 4 | T6, T8 | 50 + 50 = 100 行 | 15 min |
| 5 | T7+T11 | 150 行 | 20 min |
| 6 | T12 | 50 行 | 10 min |

总计：~820 行新代码，~1.5-2 小时。
