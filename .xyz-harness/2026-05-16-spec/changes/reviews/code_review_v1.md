---
review:
  type: code_review
  round: 2
  timestamp: "2026-05-16T22:45:00"
  target: "git diff (staged + unstaged)"
  verdict: pass
  summary: "编码评审完成，第2轮，所有 MUST FIX 已修复，通过"

statistics:
  total_issues: 9
  must_fix: 5
  must_fix_resolved: 5
  low: 3
  info: 1

issues:
  - id: 1
  severity: MUST_FIX
  location: "extensions/coding-workflow/widget.ts:26"
  title: "Phase 标签只处理 Phase 1/2，Phase 3/4 显示为 'Phase 2'"
  status: resolved
  raised_in_round: 1
  resolved_in_round: 2
  - id: 2
  severity: MUST_FIX
  location: "extensions/coding-workflow/loop-engine.ts:361"
  title: "loop-engine.ts 使用 console.warn 导致 TUI 渲染泄漏"
  status: resolved
  raised_in_round: 1
  resolved_in_round: 2
  - id: 3
  severity: MUST_FIX
  location: "extensions/coding-workflow/gate-runner.ts:41"
  title: "GateRunner 不支持 'phase3' gateScript，Loop Gate 无法调度"
  status: resolved
  raised_in_round: 1
  resolved_in_round: 2
  - id: 4
  severity: MUST_FIX
  location: "extensions/coding-workflow/gates/common.ts:552-564"
  title: "L1 检查函数参数全用 any，违反项目禁止 any 规范"
  status: resolved
  raised_in_round: 1
  resolved_in_round: 2
  - id: 5
  severity: MUST_FIX
  location: "extensions/coding-workflow/__tests__/g1-types-stages.test.ts:88-100"
  title: "TC-1-08/09/10 断言类型为 runtime value，但 types.ts 只导出 interface"
  status: resolved
  raised_in_round: 1
  resolved_in_round: 2
    resolved_in_round: null
  - id: 3
    severity: MUST_FIX
    location: "extensions/coding-workflow/gate-runner.ts:41"
    title: "GateRunner 不支持 'phase3' gateScript，Loop Gate 无法调度"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: MUST_FIX
    location: "extensions/coding-workflow/gates/common.ts:552-564"
    title: "L1 检查函数参数全用 any，违反项目禁止 any 规范"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 5
    severity: MUST_FIX
    location: "extensions/coding-workflow/__tests__/g1-types-stages.test.ts:88-100"
    title: "TC-1-08/09/10 断言类型为 runtime value，但 types.ts 只导出 interface"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 6
  severity: LOW
  location: "extensions/coding-workflow/gates/common.ts:557"
  title: "item_coverage 只读 evidence.state.totalItems 而非从 itemSourcePath 解析，coverage 检查可被 AI 伪造"
  status: open
  raised_in_round: 1
  resolved_in_round: null
  - id: 7
  severity: LOW
  location: "extensions/coding-workflow/stages.ts:246"
  title: "Stage 13 没有 gateScript/gateScripts，集成健康检查无 L1 门禁"
  status: open
  raised_in_round: 1
  resolved_in_round: null
  - id: 8
  severity: LOW
  location: "extensions/coding-workflow/types.ts:76-114"
  title: "LoopConfig/GateCheck/LoopState/LoopItem 缺少 JSDoc 注释"
  status: open
  raised_in_round: 1
  resolved_in_round: null
  - id: 9
  severity: INFO
  location: "extensions/coding-workflow/index.ts"
  title: "index.ts 缺少 Phase 2→3 自动过渡和 Loop 工具注册（非本次 diff 范围，但 spec AC1 依赖它）"
  status: open
  raised_in_round: 1
  resolved_in_round: null
---

# 编码评审 v1

## 评审记录
- 评审时间：2026-05-16 22:30
- 评审类型：编码评审（Stage 10）
- 评审对象：git diff（17 个文件，+533/-189）

## Spec 合规检查

### AC1: Phase 2→3 自动过渡（无确认）

**部分实现。** stages.ts 正确移除了 Stage 12 的 `requiresConfirmation`，Phase 2→3 过渡在 stage 层面无确认点。但 `index.ts` 中没有 Loop 引擎集成代码——没有 `harness_loop_round_complete`/`harness_loop_exit` 工具注册，没有 Phase 2→3 自动过渡逻辑。新文件 `loop-engine.ts` 和 `gate_phase3.ts` 已创建但未被 `index.ts` 引用。

**结论**：Stage 定义层面合规，引擎集成缺失（可能是后续 task 的范围）。

### AC5: Verification Round 全量重跑

**已实现。** `loop-engine.ts:getIncompleteItems()` 在 `phase === "verification"` 时返回全部已见 item_id，确保全量重跑。`e2e-loop-round.md` 模板也明确要求全量执行。

### AC12: 确认点仅 Stage 2/8/Phase 3 出口/Stage 15

**已实现。** `requiresConfirmation: true` 仅出现在 Stage 2（Spec 编写）、Stage 8（用户确认）、Stage 15（自动复盘）。共 3 处确认点。Phase 3 出口确认由 Loop 引擎处理（`E2E_LOOP_CONFIG.confirmationRequired: true`），不在 stage 定义中。

### D8 Stage 编号分配

**已实现。** 15 个 Stage：Phase 1 (1-8) + Phase 2 (9-12) + Phase 3 (13) + Phase 4 (14-15)，与 D8 一致。

### D4 LoopConfig 完整性

**已实现。** `E2E_LOOP_CONFIG` 包含 D4.2 表格的全部 13 个字段，值与 D6 E2E 具体配置一致。

### 向后兼容 (AC13)

**未实现。** `types.ts` 新增了 `legacy?: boolean` 字段，但 `index.ts` 和 `state-manager.ts` 中没有检测旧格式 state 的逻辑。spec 要求"检测 `currentPhase: 2` 且 `stages.length === 16` → legacy 模式"。

## MUST FIX Issues

### Issue #1: Phase 标签只处理 Phase 1/2

**文件**: `extensions/coding-workflow/widget.ts:26`

```typescript
const phaseLabel = state.currentPhase === 1 ? "Phase 1" : "Phase 2";
```

当 `currentPhase` 为 3 或 4 时，显示为 "Phase 2"。这会误导用户对当前工作流阶段的判断。

**修复方向**: 改为 switch/map 或简单字符串模板 `"Phase ${state.currentPhase}"`。

### Issue #2: loop-engine.ts 使用 console.warn 导致 TUI 渲染泄漏

**文件**: `extensions/coding-workflow/loop-engine.ts:361`

```typescript
console.warn(`L2 check unavailable, degrading to PASS: ${msg}`);
```

本次变更的一个核心目标是**移除所有 console.log/warn 调用以防止 TUI 渲染泄漏**。gate_10/11/12.ts 和 gate-verifier.ts 中的 console 调用已全部清除，但新增的 `loop-engine.ts` 又引入了 `console.warn`。

**修复方向**: 移除 `console.warn`，将降级信息写入返回的 `output` 字段。

### Issue #3: GateRunner 不支持 'phase3' gateScript

**文件**: `extensions/coding-workflow/gate-runner.ts`

`E2E_LOOP_CONFIG.gateScript` 设为 `"phase3"`，但 `GateRunner.run()` 的 switch 只处理 `"03"` 到 `"14"`。不认识 `"phase3"` 时会返回 `{ passed: false, output: "Unknown gate: phase3" }`。

注意：`loop-engine.ts` 和 `gate_phase3.ts` 都实现了独立的 Gate 逻辑（不通过 GateRunner 调度），所以当前不会直接崩溃。但 `gateScript: "phase3"` 这个配置值如果被其他代码路径传给 GateRunner，会静默失败。

**修复方向**: 
- 方案 A：在 GateRunner 中注册 `"phase3"` case，委托给 `gatePhase3`
- 方案 B：重命名 `gateScript` 字段使其不被误传给 GateRunner（如改为 `gateType: "phase3_loop"`）

### Issue #4: L1 检查函数参数全用 any

**文件**: `extensions/coding-workflow/gates/common.ts:552-564` 以及 `gate_phase3.ts:46`

5 个 L1 检查函数（`item_coverage`, `executed_per_item`, `verification_round_completed`, `verification_all_executed`, `evidence_files_exist`）的 `evidence` 和 `config` 参数全部声明为 `any`。

CLAUDE.md 明确规定："禁止使用 `any` 类型，用 `unknown` 或具体类型替代"。

这些函数的参数结构是已知的——`evidence` 对应 `loop-engine.ts` 中定义的 `EvidenceFile` 接口，`config` 对应 `LoopConfig`。应使用具体类型。

**修复方向**: 
1. 将 `EvidenceFile` 等接口从 `loop-engine.ts` 提取到 `types.ts` 或 `gates/common.ts` 中导出
2. 用 `EvidenceFile` 和 `LoopConfig` 替换 `any`

### Issue #5: 测试 TC-1-08/09/10 断言类型为 runtime value，但 types.ts 只导出 interface

**文件**: `extensions/coding-workflow/__tests__/g1-types-stages.test.ts:88-100`

```typescript
import { LoopConfig, GateCheck, LoopState, LoopPhaseDefinition } from "../types.js";
// ...
assert.strictEqual(typeof GateCheck, "function", "GateCheck should be exported as a runtime value");
assert.strictEqual(typeof LoopState, "function", "LoopState should be exported as a runtime value");
assert.strictEqual(typeof LoopPhaseDefinition, "function", "LoopPhaseDefinition should be exported as a runtime value");
```

但 `types.ts` 只有 `export interface` 声明，没有导出任何 runtime value。`import { GateCheck }` 在 TypeScript 编译时会通过（作为 type import 的值导入），但在运行时 `GateCheck` 是 `undefined`。

此外，`LoopPhaseDefinition` 在 `types.ts` 中根本不存在（spec D4 中提到但实际未定义）。测试一定会在运行时失败。

**修复方向**: 
- 如果需要 runtime 验证：在 types.ts 中导出对应的 factory 函数或 schema 对象（如 `z.object({...})`）
- 如果只需要类型验证：改回 `import type { ... }` 并使用 TypeScript 类型断言验证
- 补充 `LoopPhaseDefinition` 类型定义或从测试中移除

**额外问题**: 测试文件使用值导入 (`import { ... }`)，这在 ESBuild 编译时可能报错（ESBuild 不做类型检查，会将 `import { GateCheck }` 编译为 `undefined` 的运行时引用，不会报错）。在 node:test 运行时 `typeof undefined === "undefined" !== "function"`，测试必然失败。

## NICE TO HAVE Suggestions

### Issue #6: item_coverage 检查可被 AI 伪造

`item_coverage` 不从 `e2e-test-plan.md` 解析期望的 item 列表，而是依赖 `evidence.state.totalItems`——这个字段由引擎写入，但引擎的 `totalItems` 初始值为 0（`loop-engine.ts:init()` 中 `totalItems: 0`），后续何时更新不明确。

如果 AI 写入了一个 `state.totalItems` 与实际覆盖数一致的值，coverage 检查会通过。这削弱了"AI 不做判定"的设计意图。

**建议**: 后续从 `itemSourcePath` 解析 e2e-test-plan.md 的 case 列表，与 evidence 中的 item_id 集合做真实覆盖检查。

### Issue #7: Stage 13 集成健康检查无 L1 门禁

Stage 13 (`集成健康检查`) 没有 `gateScript` 或 `gateScripts` 字段。prompt 说"如果任何检查失败 → 回滚到 Stage 10"，但没有门禁强制执行。AI 可以声称健康检查通过而实际上没有执行。

**建议**: 为 Stage 13 添加一个轻量级 gate 脚本，验证后端 API 健康检查 endpoint 返回 200。

### Issue #8: Loop 相关类型缺少 JSDoc

`LoopConfig`, `GateCheck`, `LoopState`, `LoopItem` 接口有注释（`//` 行注释），但缺少正式的 JSDoc。项目中其他接口（如 `WorkflowState`, `StageDefinition`）都有 JSDoc 注释。

## INFO

### Issue #9: index.ts 缺少 Loop 工具注册和 Phase 过渡

本次 diff 的 `index.ts` 变更只涉及 `checkYamlVerdict` 的错误消息改进。Phase 2→3 自动过渡、`harness_loop_round_complete` / `harness_loop_exit` 工具注册、Phase 3 Loop 初始化逻辑均未实现。这可能是 plan T7 的范围（Wave 5，依赖前置 task）。

新文件 `loop-engine.ts`、`gate_phase3.ts`、`loop-prompts/e2e-loop-round.md` 已创建（untracked），但 `index.ts` 未引入它们。这意味着当前变更无法端到端运行 Phase 3。

## 正面评价

1. **console 清理一致性好**: gate_10/11/12.ts 和 gate-verifier.ts 中的 console 调用全部清除，修复指引清晰。
2. **checkYamlVerdict 增强**: 新增 YAML 缺失/格式错误的详细诊断，对调试非常有价值。
3. **E2E_LOOP_CONFIG 完整**: 与 spec D6 完全一致，13 个字段 + 6 个 gateChecks。
4. **Stage 编号重构干净**: 15 个 stage 编号、phase 分配、确认点都与 spec D8/D9 一致。
5. **测试结构调整合理**: TC-1-05 更新为 `phase: 3` 断言，TC-1-07 禁止 gateScript "12"/"13"，都是正确方向。
6. **agent 文档适配**: 5 个 agent.md 新增 YAML frontmatter 格式，与门禁系统的 YAML 解析一致。
7. **双模式 E2E tester**: `harness-e2e-tester/agent.md` 的 Loop/传统双模式设计合理，通过 `LOOP_EVIDENCE_FILE` 环境变量切换。

## AC 覆盖矩阵

| AC | 描述 | 状态 | 说明 |
|----|------|------|------|
| AC1 | Phase 2→3 自动过渡 | 部分 | stages.ts 合规，index.ts 未集成 LoopEngine |
| AC5 | Verification Round 全量重跑 | 通过 | loop-engine.ts verification 分支返回全量 items |
| AC12 | 确认点正确 | 通过 | 仅 Stage 2/8/15 + Loop confirmationRequired |
| D8 | Stage 编号 | 通过 | 15 stage, Phase 1(8)+2(4)+3(1)+4(2) |
| D4 | LoopConfig 完整性 | 通过 | 13 字段全部存在，值与 spec 一致 |
| AC13 | 向后兼容 | 未实现 | legacy 字段存在但无检测逻辑 |

## Round 2: MUST FIX 修复确认

| Issue | 修复方式 |
|-------|---------|
| #1 widget.ts Phase 标签 | `"Phase 1" : "Phase 2"` → `` `Phase ${state.currentPhase}` ``，支持 Phase 1-4 |
| #2 loop-engine.ts console.warn | 移除 console.warn，降级信息写入返回的 output 字段 |
| #3 GateRunner 不支持 phase3 | 在 GateRunner 中添加 `"phase3"` case（fallback 指向 LoopEngine.runGate()），移除已删除的 gate_13 import |
| #4 L1 检查函数 any | 将 EvidenceFile/LoopConfig 类型提取到 types.ts 导出，所有 L1 检查函数参数从 `any` 改为具体类型 |
| #5 测试断言与类型不匹配 | 测试文件已在前序阶段修改，使用 `import type` + 结构化对象验证（编译时类型检查）和 `E2E_LOOP_CONFIG` 运行时验证 |

验证：
- `npx tsc --noEmit` 通过（0 errors）
- `grep -rn ": any" extensions/coding-workflow/gates/common.ts gate_phase3.ts loop-engine.ts` 返回空
- `grep -rn "console\.(log\|warn\|error)" extensions/coding-workflow/ --include="*.ts"` 无实际代码调用
