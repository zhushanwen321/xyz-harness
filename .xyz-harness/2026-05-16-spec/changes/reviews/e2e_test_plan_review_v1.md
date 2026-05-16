---
review:
  type: e2e_test_plan_review
  round: 1
  timestamp: "2026-05-16T12:31:00"
  target: "e2e-test-plan.md"
  verdict: fail
  summary: "6 条 MUST-FIX：AC 覆盖缺失（AC1/AC2/AC4/AC8/AC9/AC11 无对应测试）、步骤不可执行（无测试代码/文件路径/运行命令）、依赖矛盾（G1/G5 并行声明 vs G5 依赖 G1）、缺少 Subagent 配置"

statistics:
  total_issues: 11
  must-fix: 8
  must-fix_resolved: 0
  low: 3
  info: 0

issues:
  - id: 1
    severity: MUST_FIX
    location: "AC1"
    title: "AC1（Phase 2→3 自动过渡无确认）无对应测试用例"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: MUST_FIX
    location: "AC2"
    title: "AC2（健康检查失败阻塞 Loop）无对应测试用例"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: MUST_FIX
    location: "AC4"
    title: "AC4（ERROR 场景 spawn subagent 修复）无对应测试用例"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: MUST_FIX
    location: "AC8"
    title: "AC8（Gate PASS 触发人工确认）无对应测试用例"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 5
    severity: MUST_FIX
    location: "AC9"
    title: "AC9（Gate FAIL 回退 Loop 重新执行）无对应测试用例"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 6
    severity: MUST_FIX
    location: "AC11"
    title: "AC11（Phase 4 正常收尾全流程）无对应测试用例"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 7
    severity: MUST_FIX
    location: "全局"
    title: "步骤不可执行：无测试文件路径、无测试代码、无测试运行命令"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 8
    severity: MUST_FIX
    location: "依赖关系图 vs 执行策略"
    title: "G1/G5 并行声明与 G5 依赖 G1 矛盾"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 9
    severity: LOW
    location: "全局"
    title: "测试用例数不一致：正文统计 33 个，实际清点 40 个"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 10
    severity: LOW
    location: "TC-1-03"
    title: "AC12 与 D9 确认点编号不一致（Stage 14 vs Stage 15），测试计划未标注此差异"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 11
    severity: LOW
    location: "全局"
    title: "缺少测试环境详细配置（测试框架、Node 版本、项目特定启动命令）"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# E2E 测试计划评审 v1

## 评审记录
- 评审时间：2026-05-16 20:31
- 评审类型：E2E 测试计划独立评审
- 评审对象：e2e-test-plan.md
- 评审轮次：第 1 轮

---

## Spec AC 覆盖矩阵

| AC | 场景 | 覆盖状态 | 测试用例 | 说明 |
|----|------|---------|----------|------|
| AC1 | Phase 2（Stage 12）完成后自动进入 Phase 3，无人工确认 | ❌ 未覆盖 | 无 | plan.md T7 描述了此逻辑，但 e2e-test-plan 无用例验证"Stage 12 pass 后引擎自动触发 Phase 3 且不弹确认" |
| AC2 | 集成健康检查失败时阻塞 Loop | ❌ 未覆盖 | 无 | TC-1-04 仅验证 Stage 13 的 type=automated，未验证失败时的阻塞行为和 rollback 到 Stage 10 的逻辑 |
| AC3 | E2E Loop 正确写入 JSON evidence | ✅ 部分覆盖 | TC-2-01, TC-2-10 | TC-2-01 验证 init 创建空 JSON；TC-2-10 验证追加不覆盖。但未验证 JSON 各字段完整结构 |
| AC4 | case status=ERROR 时 spawn subagent 修复 | ❌ 未覆盖 | 无 | spec 明确要求模拟三种 ERROR 场景（CDP 断开、selector 失效、API 超时），计划中无对应用例 |
| AC5 | 所有 case 有 ≥1 EXECUTED 后自动进入 Verification Round | ✅ 完整覆盖 | TC-2-04 | |
| AC6 | Verification Round 完成后 AI 声明 Loop 结束 | ✅ 完整覆盖 | TC-2-05 | |
| AC7 | Phase 3 Gate 五项 L1 检查全部正确判定 | ✅ 完整覆盖 | TC-3-01~TC-3-11, TC-4-01~TC-4-05 | 每个 L1 检查有正向和反向用例，组合 Gate 也有用例 |
| AC8 | Phase 3 Gate PASS 后弹出人工确认 | ❌ 未覆盖 | 无 | TC-4-01 验证 Gate PASS 输出，但未验证"Gate PASS 后触发确认流程"这个端到端行为 |
| AC9 | Phase 3 Gate FAIL 后回退 Loop 重新执行 | ❌ 未覆盖 | 无 | TC-4-02 验证 Gate FAIL 输出，但未验证"FAIL 后 loop-engine 状态回到 in_round" |
| AC10 | Loop 达到 max_rounds 后 Gate FAIL | ✅ 完整覆盖 | TC-2-06 | |
| AC11 | Phase 4 正常收尾（推送+CI+复盘） | ❌ 未覆盖 | 无 | 整个 Phase 4 的端到端流程无测试 |
| AC12 | 确认点仅 Stage 2/8/Phase 3 出口/Stage 14 | ⚠️ 部分覆盖 | TC-1-03 | 验证了 requiresConfirmation 字段，但 AC12 与 D9 的 Stage 编号不一致（见 Issue #10） |
| AC13 | 向后兼容 | ✅ 完整覆盖 | TC-6-01~TC-6-03 | |

**覆盖率：13 个 AC 中 5 个完整覆盖，2 个部分覆盖，6 个未覆盖。**

---

## 四层策略合理性

本项目是 TypeScript 框架（无 UI、无数据库、无后端 API），验证层级选择：

| 用例组 | 验证层级 | 场景 | 评估 |
|--------|---------|------|------|
| G1 | 编译时 + 代码审查 | 类型定义 + Stage 配置 | ✅ 合理（纯类型检查） |
| G2 | 单元测试（内存） | Loop 状态机 | ✅ 合理 |
| G3 | 单元测试（mock data） | L1 检查函数 | ✅ 合理 |
| G4 | 单元测试（mock data） | Phase 3 Gate 组合 | ✅ 合理 |
| G5 | 单元测试 | State Manager | ✅ 合理 |
| G6 | 集成测试 | 向后兼容 | ✅ 合理 |

四层策略评估：对于本项目（纯 TS 框架，无 UI/DB/HTTP），全部使用 L1（API/编译）+ L4（数据/JSON 验证）是合理的。无 L2（DOM）和 L3（视觉对比）需求。

**但问题在于**：AC1/AC2/AC4/AC8/AC9/AC11 这些 AC 要求的是集成/E2E 级别的验证（涉及 index.ts 的 Phase 过渡逻辑、健康检查的 curl 调用、subagent spawn 等），当前计划缺少一个 G7（集成/E2E 组）来覆盖这些跨模块交互场景。

---

## 发现的问题

### MUST-FIX 问题

| # | 优先级 | 维度 | 位置 | 描述 | 修改建议 |
|---|--------|------|------|------|---------|
| 1 | MUST-FIX | AC 覆盖 | AC1 | Phase 2→3 自动过渡无确认（spec 核心行为）无测试用例 | 新增 G7 集成测试组，包含 TC-7-01：模拟 Stage 12 pass → 验证引擎自动推进到 Phase 3 Stage 13，不触发 requiresConfirmation |
| 2 | MUST-FIX | AC 覆盖 | AC2 | 健康检查失败阻塞 Loop 无测试用例 | 新增 TC-7-02：Mock curl 返回非 200 → 验证 Phase 3 阻塞 + rollback 到 Stage 10 |
| 3 | MUST-FIX | AC 覆盖 | AC4 | ERROR 场景 spawn subagent 修复无测试用例。Spec 明确要求 3 种 ERROR 类型 | 新增 TC-7-03/04/05：模拟 CDP 连接断开、selector 失效、API 超时，验证 subagent 触发和 evidence.fix_commit 写入 |
| 4 | MUST-FIX | AC 覆盖 | AC8 | Gate PASS 触发人工确认无测试用例 | 新增 TC-7-06：构造 Gate PASS → 验证 loop-engine 调用 harness_stage_complete 的确认流程（confirmationRequired=true） |
| 5 | MUST-FIX | AC 覆盖 | AC9 | Gate FAIL 回退 Loop 重新执行无测试用例 | 新增 TC-7-07：构造 Gate FAIL + maxRounds 未达上限 → 验证 state.phase 回到 in_round |
| 6 | MUST-FIX | AC 覆盖 | AC11 | Phase 4 端到端流程无测试用例 | 新增 TC-7-08：模拟 Phase 3 Gate PASS + 确认完成 → 验证 advanceTo(13,14,4) → Stage 14/15 正常推进 |
| 7 | MUST-FIX | 步骤可执行性 | 全局 | 所有测试用例只有自然语言描述，无可直接执行的命令或代码。（1）无测试文件路径（写到哪里？）（2）无测试框架指定（vitest? jest? node:test?）（3）无测试运行命令（4）无断言代码示例 | (1) 为每组指定测试文件路径，如 `extensions/coding-workflow/__tests__/loop-engine.test.ts` (2) 确定测试框架（建议 vitest 或 node:test）(3) 每个 TC 提供至少核心断言代码片段 (4) 指定运行命令如 `npx vitest run extensions/coding-workflow/__tests__/` |
| 8 | MUST-FIX | 依赖关系 | 执行策略 vs 依赖关系图 | 依赖关系图标注"G1→G5: State Manager 需要类型定义"，但执行策略写"G1/G5 可并行"。两者矛盾 | 修正执行策略：G5 必须在 G1 之后，正确并行组合应为"G1 先行，G2+G5 可并行（均仅依赖 G1）" |

### LOW 问题

| # | 优先级 | 维度 | 位置 | 描述 | 修改建议 |
|---|--------|------|------|------|---------|
| 9 | LOW | 用例质量 | 全局 | 正文声称"33 个测试用例"，实际清点 6 组共 40 个（7+10+11+5+4+3） | 更正统计数字为 40 |
| 10 | LOW | AC 覆盖 | TC-1-03 | AC12 写"确认点仅 Stage 2/8/Phase 3 出口/Stage 14"，但 D9 表写 Stage 15。TC-1-03 按 Stage 2/8/15 验证，未标注此 spec 内部不一致 | 在 TC-1-03 中添加注释说明此差异，或提请 spec 修正 AC12 编号 |
| 11 | LOW | 测试环境 | 全局 | 测试环境章节过于简略：未指定测试框架、未指定 Node 版本要求、未说明如何在无测试基础设施的项目中引入测试（当前项目 `echo "no tests yet"`） | 补充：(1) 测试框架选择及安装方式 (2) tsconfig.json 是否需要调整（test 目录 include）(3) 运行命令 |

---

## 依赖关系验证

### 依赖矩阵

| 组 | 前置依赖 | 执行策略声明 | 实际依赖 | 冲突？ |
|----|---------|-------------|---------|--------|
| G1 | 无 | 独立运行 | 无 | ✅ |
| G2 | G1 通过 | G1 后执行 | G1 | ✅ |
| G3 | G2 通过 | G2 后执行 | G2 | ✅ |
| G4 | G3 通过 | G3 后执行 | G2+G5 | ✅ |
| G5 | G1 通过 | 与 G1 并行 | G1 | ❌ 矛盾 |
| G6 | G5 通过 | G5 后执行 | G5 | ✅ |

### 拓扑排序（修正后）

```
Wave 1: G1（类型 + Stage 定义）
Wave 2: G2（Loop 引擎）+ G5（State Manager）—— 均仅依赖 G1，可并行
Wave 3: G3（L1 检查）—— 依赖 G2
Wave 4: G4（Phase 3 Gate）+ G6（向后兼容）—— G4 依赖 G3+G5，G6 依赖 G5
```

无循环依赖。拓扑排序可行（修正 G5 执行时机后）。

---

## 测试环境检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 前端启动方式 | N/A | 无前端，纯 TS 框架项目 |
| 后端启动方式 | N/A | 无后端服务 |
| 数据库初始化 | N/A | 无数据库 |
| Chrome CDP 配置 | N/A | 无 L2/L3 测试 |
| 测试框架 | ❌ 缺失 | 未指定使用哪个测试框架（vitest/jest/node:test），也未说明如何引入 |
| 测试文件路径 | ❌ 缺失 | 未指定测试文件写在哪个目录 |
| TypeScript 运行方式 | ⚠️ 部分说明 | 提到 `node --import tsx`，但测试运行方式未说明 |
| Mock 数据路径 | ⚠️ 部分说明 | 提到了 Mock 数据种类，但未给出具体文件路径 |

---

## 步骤可执行性抽查

抽查 5 个用例：

### TC-1-01（类型编译通过）
- 描述：`npx tsc --noEmit`
- 评估：✅ 可直接执行。但需注意当前项目 tsconfig 可能不包含新增文件

### TC-1-02（15 个 stage + Phase 编号）
- 描述："读 stages.ts → 验证 WORKFLOW_STAGES: 15 entries, phase 1/2/3/4"
- 评估：❌ 不可执行。"读 stages.ts" 不是可执行命令。需要写成具体断言，例如：
  ```typescript
  expect(WORKFLOW_STAGES).toHaveLength(15)
  expect(WORKFLOW_STAGES.filter(s => s.phase === 3)).toBeDefined()
  ```

### TC-2-01（init 创建空 JSON）
- 描述："调用 init → 读 JSON 文件 → 验证路径无 {topicDir}"
- 评估：❌ 不可执行。无测试代码框架，无法知道如何"调用 init"。

### TC-3-01（item_coverage PASS）
- 描述："JSON 含全 5 个 case_id + plan 声明 5 个 → PASS"
- 评估：❌ 不可执行。需要构造 mock evidence 和 mock plan 文件，调用 item_coverage 函数，断言结果。无任何代码。

### TC-6-01（旧 state 加载不报错）
- 描述："构造 currentPhase=2, stages.length=16 → load → 无异常"
- 评估：❌ 不可执行。需要 mock JSON 文件路径和内容。

**结论：仅 TC-1-01 的步骤可直接执行。其余用例均为自然语言描述，Phase 2 执行 agent 需要自行推断测试代码实现，增加了执行失败的风险。**

---

## Subagent/分组配置检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 测试分组合理性 | ⚠️ | 每组 3-11 个用例，G3（11 个）偏大但可接受 |
| Subagent 配置 | ❌ 缺失 | 无任何 subagent 配置信息（Agent 名称、Model、注入上下文、读写文件列表） |
| 串行执行调度 | ⚠️ 部分 | 有依赖图和执行策略，但未明确声明"严格串行"或指定 Wave 编排 |
| 上下文充分性 | ❌ 不足 | 未说明每组 subagent 需要注入哪些文件作为上下文（如 G2 需要读 types.ts + loop-engine.ts） |

**说明**：���项目测试全部是单元/集成测试，由同一执行 agent 完成，不需要多 subagent 并行。但应明确：(1) 使用哪个 agent（harness-executor?）(2) 每组需要读取哪些源文件 (3) 整体串行还是分组串行。

---

## 结论

**需修改后重审。**

核心问题：
1. **6 个 AC 无覆盖**（AC1/AC2/AC4/AC8/AC9/AC11），这些 AC 涉及 Phase 过渡、健康检查阻塞、ERROR 修复、确认触发、回退循环、Phase 4 收尾——都是跨模块的集成行为，当前计划完全缺少集成测试组
2. **步骤不可执行**——所有用例仅有自然语言描述，Phase 2 执行 agent 无法直接复制执行任何命令或代码
3. **依赖关系矛盾**——G5 与 G1 的并行声明与依赖声明不一致

建议修改方向：
1. 新增 G7（集成测试组），覆盖 6 个缺失 AC，用例数约 8-10 个
2. 为每组提供测试文件路径、测试框架、核心断言代码
3. 修正依赖关系和执行策略
4. 补充测试环境配置

---

### Summary

E2E 测试计划评审完成，第 1 轮，8 条 MUST-FIX（6 条 AC 覆盖缺失 + 1 条步骤不可执行 + 1 条依赖矛盾），需修改后重审。
