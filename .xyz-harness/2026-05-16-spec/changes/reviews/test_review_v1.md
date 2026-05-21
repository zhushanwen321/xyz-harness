---
review:
  type: test_review
  round: 1
  timestamp: "2026-05-16T22:00:00"
  target: "unit tests + E2E results"
  verdict: fail
  summary: "55 tests pass，但 G7 集成测试中 TC-7-02/7-03/7-05 断言几乎无意义（仅 assert.ok(engine)），多个关键路径缺少独立测试覆盖"
statistics:
  total_issues: 5
  must_fix: 2
  low: 3
  info: 0
issues:
  - id: 1
    severity: MUST_FIX
    location: "g7-integration.test.ts:TC-7-02,TC-7-03,TC-7-05"
    title: "三个 AC 测试仅断言 assert.ok(engine)，未验证任何行为"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: MUST_FIX
    location: "g7-integration.test.ts:TC-7-07"
    title: "ESM 模块中使用 require() 在 Node.js ESM 环境下可能运行失败"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: LOW
    location: "g7-integration.test.ts:TC-7-01,TC-7-06"
    title: "advanceTo 后未 save+load 验证持久化，仅验证内存对象"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: LOW
    location: "g2-loop-engine.test.ts"
    title: "LoopEngine.runGate() 未被任何测试覆盖"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 5
    severity: LOW
    location: "g7-integration.test.ts:TC-7-04"
    title: "TC-7-04 与 TC-4-01 测试逻辑高度重复，且未验证 confirmation 机制"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 测试评审报告 v1

## 评审记录

| 步骤 | 内容 | 状态 |
|------|------|------|
| 读取 spec | 无独立 spec.md，以 stages.ts + types.ts + CLAUDE.md 为准 | 完成 |
| 读取实现文件 | loop-engine.ts, gate_phase3.ts, common.ts(L1), state-manager.ts, index.ts(Loop 部分) | 完成 |
| 读取测试文件 | g1~g7 全部 7 个测试组，55 个用例 | 完成 |
| 读取 fixtures | e2e-evidence-full.json, empty, incomplete, screenshot-valid.png(2056B), screenshot-tiny.png(4B) | 完成 |
| 逐组评审 | G1~G7 覆盖度+断言质量 | 完成 |

## 测试覆盖度评估

### G1: Type system + Stage definitions (10 cases)

**覆盖度: 优秀** — 10 个用例全面验证了:
- Phase 分布 [1,2,3,4] ✓
- 总 stage 数 15 ✓
- Phase 内数量分布 ✓
- requiresConfirmation 精确到 [2,8,15] ✓
- Stage 13 phase=3 + type=automated ✓
- E2E_LOOP_CONFIG 13 个字段完整性 ✓
- 禁止引用 gateScript "12"/"13" ✓
- gateChecks 结构验证 ✓
- LoopState / LoopConfig 类型结构验证 ✓

**断言质量: 好** — 使用 `deepStrictEqual`、`strictEqual`、`ok` 组合，错误消息具体。

**遗漏:** 无明显遗漏。

### G2: Loop Engine state machine (11 cases)

**覆盖度: 良好** — 覆盖了:
- init() 创建 evidence JSON ✓
- {topicDir} 占位符替换 ✓
- startRound() → in_round ✓
- 部分完成计数 (3/5 EXECUTED) ✓
- 全部完成 → verification ✓
- verification 完成 → gate_check ✓
- maxRounds 达到 → failed ✓
- getPrompt() 变量替换 ✓
- getIncompleteItems() 过滤逻辑 ✓
- verification 阶段返回全量 items ✓
- Evidence JSON rounds 追加持久化 ✓

**断言质量: 好** — 通过文件系统读写验证状态机转换，边界值 3/5、5/5、2/5 有区分。

**遗漏:**
- `onRoundComplete()` 返回值 `"next_round"` 分支未被显式验证（TC-2-04 和 TC-2-09 验证了状态，但没检查返回值）
- `runGate()` 方法完全没有测试覆盖（见 issue #4）
- `getEvidencePath()` 方法未测试
- init() 读取 template JSON 的分支未测试

### G3: L1 Gate check functions (11 cases)

**覆盖度: 优秀** — 5 个 L1 检查函数各 2 个用例（PASS + FAIL），evidence_files_exist 额外测试了文件不存在和文件过小。

**断言质量: 好** — PASS/FAIL 判定 + output 包含函数名检查。

**Fixture 质量:**
- `e2e-evidence-full.json`: 完整的 5-item、2-round + verification_round 结构，真实数据 ✓
- `e2e-evidence-empty.json`: 初始空状态 ✓
- `e2e-evidence-incomplete.json`: 2/5 完成 ✓
- `screenshot-valid.png`: 2056B > 1KB 阈值 ✓
- `screenshot-tiny.png`: 4B < 1KB 阈值 ✓
- `screenshots/` 目录下的文件在 TC-3-09 中动态创建（不是预置 fixture）

**遗漏:** `executed_per_item` 未测试 verification_round 中的 items 影响。

### G4: Phase 3 Gate (5 cases)

**覆盖度: 良好** — 测试了:
- L1 全 PASS → Gate PASS ✓
- Evidence 文件不存在 → Gate FAIL ✓
- L2 不可用降级 → PASS ✓
- 结果类型检查 ✓
- 失败描述包含具体原因 ✓

**断言质量: 好** — 验证了 `passed` 和 `output` 字段。

**遗漏:** 没有测试 L2 真正 FAIL 的场景（需要 mock verifyGateL2）。

### G5: State Manager + Loop Engine (7 cases)

**覆盖度: 良好** — 测试了:
- loopState save/load round-trip ✓
- 旧状态无 loopState 加载 ✓
- advanceTo Phase 3→4 ✓
- rollback Phase 3→2 ✓
- startStage 创建 Phase 3 stage ✓
- LoopEngine 与真实 E2E_LOOP_CONFIG 集成 ✓
- LoopEngine state round-trip ✓

**断言质量: 好** — 使用 `deepStrictEqual` 验证序列化一致性。

**遗漏:** 无明显遗漏。

### G6: Backward compatibility (3 cases)

**覆盖度: 良好** — 测试了:
- 16-stage legacy JSON 加载 ✓
- legacy=true 标记设置 ✓
- legacy state Stage 13 加载 + Stage 12 pass ✓

**断言质量: 可接受** — 使用类型断言 `(loaded as Record<string, unknown>).legacy`。

**遗漏:** 无明显遗漏。

### G7: Integration tests (8 cases)

**覆盖度: 不合格** — 这是本次评审的主要问题区域。逐个分析:

| 用例 | 标注 | 实际断言 | 评价 |
|------|------|---------|------|
| TC-7-01 | AC1 Phase 2→3 | `advanceTo` 后检查 `currentPhase=3, currentStage=13` | 有效但未 save/load 验证持久化 |
| TC-7-02 | AC2 Health check fail blocks Loop | `assert.ok(engine)` | **无意义**，见 issue #1 |
| TC-7-03 | AC4 ERROR spawns fixer subagent | `assert.ok(engine)` | **无意义**，见 issue #1 |
| TC-7-04 | AC8 Gate PASS triggers confirmation | 创建 evidence + gatePhase3 → `passed=true` | 有效但重复 G4-TC-4-01，未测 confirmation |
| TC-7-05 | AC9 Gate FAIL loops back | `assert.ok(engine)` | **无意义**，见 issue #1 |
| TC-7-06 | AC11 Phase 4 full flow | `advanceTo` 14→15 + 手动 `completed=true` | 有效但 advanceTo(15,0,...) 未验证行为 |
| TC-7-07 | AC12 Confirmation points | `require()` 加载 + filter | **ESM 兼容问题**，见 issue #2 |
| TC-7-08 | AC13 Old format migration | 16-stage JSON load + legacy=true | 与 G6-TC-6-02 重复 |

## 断言质量评估

### 整体: G1~G6 良好，G7 堕落

G1~G6 的断言具体、可验证，使用 `strictEqual`/`deepStrictEqual` 精确匹配预期值。

G7 的问题集中且严重：3 个用例（TC-7-02/03/05）只做了 `assert.ok(engine)`，等于只验证了构造函数不抛异常。它们声称测试"Health check fail blocks Loop"、"ERROR spawns fixer subagent"、"Gate FAIL loops back"，但实际没有测试这些行为中的任何一个。

## 遗漏风险分析

### 高风险遗漏

1. **`LoopEngine.runGate()` 零测试覆盖** — 这是 Loop Engine 的核心方法，串联 L1+L2 检查、处理降级逻辑。虽然 `gate_phase3.ts` 的 `gatePhase3()` 在 G4 中有测试，但 `LoopEngine.runGate()` 有独立的实现逻辑（动态 import、checkMap 构建、短路返回），且未被测试。

2. **`index.ts` Loop 工具逻辑零测试** — `harness_loop_round_complete` 和 `harness_loop_exit` 两个工具的 execute 函数包含大量分支逻辑（verification/gate_check/failed/in_round 四种状态的处理、sendMessage 调用、stateMgr 操作），但没有任何单元测试。这部分逻辑需要 Pi Extension API 的 mock 才能测试，可以理解为集成测试范畴，但 G7 的集成测试实际上也没覆盖到。

### 中等风险

3. **LoopEngine.init() 的 template JSON 读取** — 当 `e2e-evidence-template.json` 存在时，init() 会从中读取 `expected_cases` 并初始化 items。这个分支未被测试。

4. **evidence_files_exist 的路径解析** — 测试中 screenshots 路径是相对路径，但实际运行时可能是绝对路径。TC-3-10 使用了 `/nonexistent/file.png` 绝对路径测试，但实现中 `join(workDir, relPath)` 的行为对绝对路径的处理（join 会忽略 workDir）未被验证。

## 发现的问题

### Issue #1 (MUST_FIX): TC-7-02/03/05 断言无意义

**位置**: `g7-integration.test.ts:TC-7-02, TC-7-03, TC-7-05`

**问题**: 这三个测试声称验证 AC2（Health check fail blocks Loop）、AC4（ERROR spawns fixer subagent）、AC9（Gate FAIL loops back），但实际代码：

```typescript
// TC-7-02
const engine = new LoopEngine(E2E_CONFIG, tmpDir, "test-topic");
assert.ok(engine, "LoopEngine should exist");

// TC-7-03
const engine = new LoopEngine(E2E_CONFIG, tmpDir, "test-topic");
assert.ok(engine);

// TC-7-05
const engine = new LoopEngine(E2E_CONFIG, tmpDir, "test-topic");
assert.ok(engine);
```

仅验证了 `LoopEngine` 构造函数不抛异常，完全没有测试各自声称的行为。如果这些 AC 无法在单元测试中验证（因为它们依赖 subagent 调度），应删除或改为集成/E2E 级别测试，不应在单元测试中占位但空断言。

**修改方向**: 要么补充实际行为验证（如 health check fail 后 engine 状态检查），要么删除这三个占位测试并在测试报告中标注为"需 E2E 手动验证"。

### Issue #2 (MUST_FIX): ESM 模块中使用 require()

**位置**: `g7-integration.test.ts:TC-7-07`

```typescript
const { WORKFLOW_STAGES } = require("../stages.js") as { WORKFLOW_STAGES: Array<Record<string, unknown>> };
```

项目使用 ESM（`import.meta.url`、`.js` 扩展名导入），`require()` 在纯 ESM 环境下不可用。虽然 Node.js 当前版本可能在某些配置下支持 `require()` on ESM，但这不是可靠的行为。其他所有测试文件都使用 `import` 语法，应保持一致。

**修改方向**: 改为 `import { WORKFLOW_STAGES } from "../stages.js"`（文件顶部导入）。

### Issue #3 (LOW): advanceTo 后未验证持久化

**位置**: `g7-integration.test.ts:TC-7-01, TC-7-06`

`advanceTo()` 修改的是内存中的 state 对象，测试只验证了内存对象。应 `save` 后重新 `load` 验证持久化正确性（G5 的 TC-5-01/03/04 也只在内存中操作，但因为 beforeEach 中做了 save，load 也从文件读取，所以部分覆盖了）。

### Issue #4 (LOW): LoopEngine.runGate() 零覆盖

**位置**: `loop-engine.ts:runGate()` 方法

`runGate()` 是 `gatePhase3()` 的并行实现（在 LoopEngine 内部），包含动态 import、L1 checkMap 构建、L2 降级逻辑。虽然 G4 测试了 `gatePhase3()`（独立函数），`runGate()` 的独立逻辑路径（如 unknown check name 处理、break on first L1 failure）未被验证。

考虑到 `gatePhase3()` 已覆盖了相同的逻辑，这是 LOW 而非 MUST FIX——但 `runGate()` 和 `gatePhase3()` 的代码重复本身是一个设计问题，测试应至少覆盖一次。

### Issue #5 (LOW): TC-7-04 与 G4 重复且未测 confirmation

**位置**: `g7-integration.test.ts:TC-7-04`

TC-7-04 标注测试 AC8 "Gate PASS triggers confirmation"，但实际只调用了 `gatePhase3()` 并验证 `passed=true`，与 G4 的 TC-4-01 测试逻辑几乎相同。关键差异——confirmation 机制（config.confirmationRequired 为 true 时应触发用户确认）——未被验证。

## 结论

**需修改后重审。**

G1~G6 共 47 个测试用例质量良好，覆盖了类型系统、Loop Engine 状态机、L1 检查函数、Phase 3 Gate、StateManager、向后兼容性的核心路径。Fixture 设计合理，数据构造有区分度。

但 G7 集成测试存在 2 个 MUST FIX 问题：
1. 3 个 AC 测试（TC-7-02/03/05）断言完全无效，声称测试的行为未被验证
2. TC-7-07 使用 `require()` 与项目 ESM 规范不一致

修复后重审范围：仅需审查 G7 修改后的 3+1 个测试用例。
