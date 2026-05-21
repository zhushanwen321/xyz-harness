---
review:
  type: e2e_test_plan_review
  round: 2
  timestamp: "2026-05-16T21:00:00"
  target: "e2e-test-plan.md"
  verdict: fail
  summary: "2 条 MUST-FIX：TC-7-03 测试行为与 AC4 不匹配（测 loop exit 而非 spawn fixer）、G5 依赖声明与 Wave 1 并行执行矛盾"

statistics:
  total_issues: 6
  must-fix: 2
  must-fix_resolved: 0
  low: 4
  info: 0

issues:
  - id: 1
    severity: MUST_FIX
    location: "TC-7-03 / AC4"
    title: "TC-7-03 测试的是 loop exit 行为而非 AC4 要求的 spawn fixer subagent"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 2
    severity: MUST_FIX
    location: "执行策略 Wave 1 vs 依赖关系图"
    title: "G5 依赖 G1 但 Wave 1 声明 G1/G5 并行，仍未修正"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 3
    severity: LOW
    location: "全局"
    title: "测试用例总数仍为 37，实际为 50（新增 G7 后未更新）"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 4
    severity: LOW
    location: "TC-7-07 / AC12"
    title: "TC-7-07 断言 Stage 2/8/15，但 spec AC12 写 Stage 14。未引用 plan.md T2 的澄清说明"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 5
    severity: LOW
    location: "G7"
    title: "G7（8 个用例）未出现在依赖关系图的 ASCII 图中，仅在文字说明中提及"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 6
    severity: LOW
    location: "G5 依赖声明"
    title: "G4 标注依赖 G3+G5，但 G5 实际上不依赖 G2（只是类型依赖 G1），依赖图的可视化路径有误导性"
    status: open
    raised_in_round: 2
    resolved_in_round: null
---

# E2E 测试计划评审 v2

## 评审记录
- 评审时间：2026-05-16 21:00
- 评审类型：E2E 测试计划独立评审
- 评审对象：e2e-test-plan.md（v2，修复后）
- 评审轮次：第 2 轮
- 上轮结果：8 条 MUST-FIX

---

## V1 Issue 解决情况

| V1 # | 严重度 | 描述 | 解决状态 | 说明 |
|-------|--------|------|---------|------|
| #1 | MUST-FIX | AC1 无覆盖 | ✅ 已解决 | TC-7-01 覆盖 Phase 2→3 自动过渡 |
| #2 | MUST-FIX | AC2 无覆盖 | ✅ 已解决 | TC-7-02 覆盖健康检查失败阻塞 |
| #3 | MUST-FIX | AC4 无覆盖 | ⚠️ 部分解决 | TC-7-03 覆盖了 AC4 但测试行为不匹配（见新 Issue #1） |
| #4 | MUST-FIX | AC8 无覆盖 | ✅ 已解决 | TC-7-04 覆盖 Gate PASS + 确认 |
| #5 | MUST-FIX | AC9 无覆盖 | ✅ 已解决 | TC-7-05 覆盖 Gate FAIL + 回退 |
| #6 | MUST-FIX | AC11 无覆盖 | ✅ 已解决 | TC-7-06 覆盖 Phase 4 收尾 |
| #7 | MUST-FIX | 步骤不可执行 | ✅ 已解决 | 每组有文件路径、断言描述、运行命令 |
| #8 | MUST-FIX | G1/G5 并行矛盾 | ❌ 未解决 | 见新 Issue #2 |
| #9 | LOW | 用例数不一致 | ❌ 未解决 | 37→50，仍未更新（见新 Issue #3） |
| #10 | LOW | AC12/D9 编号不一致 | ⚠️ 部分解决 | TC-7-07 用 Stage 2/8/15 但未标注 plan.md 澄清（见新 Issue #4） |
| #11 | LOW | 测试环境配置 | ✅ 已解决 | 新增测试环境表（运行时、框架、文件位置、启动命令） |

---

## Spec AC 覆盖矩阵

| AC | 场景 | 覆盖状态 | 测试用例 | 说明 |
|----|------|---------|----------|------|
| AC1 | Phase 2→3 自动过渡无确认 | ✅ 完整覆盖 | TC-7-01 | Stage 12 pass → currentPhase 自动变为 3，无确认 |
| AC2 | 健康检查失败阻塞 Loop | ✅ 完整覆盖 | TC-7-02 | Mock HTTP 500 → 不进入 Loop，回退 Stage 10 |
| AC3 | E2E Loop 正确写入 JSON | ✅ 完整覆盖 | TC-2-01, TC-2-02, TC-2-11 | init 创建 + 路径替换 + 每轮追加 |
| AC4 | ERROR 场景 spawn subagent | ⚠️ 行为不匹配 | TC-7-03 | TC 测 loop exit 而非 spawn fixer（见 Issue #1） |
| AC5 | 全部 EXECUTED → Verification Round | ✅ 完整覆盖 | TC-2-05, TC-2-10 | |
| AC6 | Verification Round 完成声明 | ✅ 完整覆盖 | TC-2-05, TC-3-05 | |
| AC7 | Gate 五项 L1 检查 | ✅ 完整覆盖 | TC-3-01~TC-3-11, TC-4-01~TC-4-05 | 每个 L1 有 PASS/FAIL + 组合测试 |
| AC8 | Gate PASS + 人工确认 | ✅ 完整覆盖 | TC-7-04 | confirmationRequired=true → 确认流程 |
| AC9 | Gate FAIL + 回退 Loop | ✅ 完整覆盖 | TC-7-05 | rounds < maxRounds → phase 回到 in_round |
| AC10 | max_rounds 达到后 FAIL | ✅ 完整覆盖 | TC-2-07 | |
| AC11 | Phase 4 全流程收尾 | ✅ 完整覆盖 | TC-7-06 | Stage 14→15 推进 + completed=true |
| AC12 | 确认点分布 | ✅ 完整覆盖 | TC-1-03, TC-7-07 | requiresConfirmation 计数 + Stage 编号审计 |
| AC13 | 向后兼容 | ✅ 完整覆盖 | TC-6-01~TC-6-03, TC-7-08 | 旧 state + legacy 标记 + 自动映射 |

**覆盖率：13 个 AC 全部有对应测试用例。AC4 的用例存在行为偏差（见 Issue #1）。**

---

## 四层策略合理性

| 用例组 | 验证层级 | 场景 | 评估 |
|--------|---------|------|------|
| G1 | L1（编译检查） | 类型定义 + Stage 配置 | ✅ 纯 TS 框架，编译验证合理 |
| G2 | L1+L4 | API + JSON 数据验证 | ✅ Loop 状态机，验证状态 + JSON 结构 |
| G3 | L1+L4 | 函数调用 + JSON 输出 | ✅ L1 检查函数，输入输出明确 |
| G4 | L1+L4 | 函数组合 + 结果 | ✅ Gate 组合逻辑 |
| G5 | L1+L4 | save/load + 状态转换 | ✅ State Manager |
| G6 | L1+L4 | 加载兼容 + 映射 | ✅ 向后兼容 |
| G7 | L1+L4 | 集成状态机流转 | ✅ 跨模块集成，无 UI/DB/HTTP（全部 mock） |

所有组均至少覆盖两层（L1 函数调用 + L4 数据/JSON 验证），符合最少两层要求。无 L2（DOM）和 L3（视觉）需求，本项目不涉及 UI。

---

## 发现的问题

### MUST-FIX 问题

| # | 优先级 | 维度 | 位置 | 描述 | 修改建议 |
|---|--------|------|------|------|---------|
| 1 | MUST-FIX | AC 覆盖 + 步骤准确性 | TC-7-03 | TC-7-03 描述为"Loop 内 item status=ERROR → 引擎/agent 调用 `harness_loop_exit("CDP crash")` → 不触发 Gate"。但 spec AC4 要求的是"ERROR 时 spawn subagent 修复"，而非 loop exit。两者是不同的行为路径：(1) spawn fixer → 记录 fix_commit → 继续循环 (2) loop exit → 放弃循环。TC-7-03 测试的是路径(2)而 AC4 验证的是路径(1) | 修改 TC-7-03 为：构造 item status=ERROR → 验证引擎 spawn fixer subagent → 验证 evidence 中记录 fix_commit。如需同时覆盖 loop exit 场景，可新增 TC-7-09 |
| 2 | MUST-FIX | 依赖关系 | 执行策略 Wave 1 | Wave 1 声明 `[G1, G5] 并行`，但 G5 的依赖说明写"G1（需要 LoopState 类型定义）"，依赖关系图也标注 G1→G5。并行执行无法保证 G1 在 G5 之前完成 | 修正执行策略：Wave 1: [G1] → Wave 2: [G2, G5] 并行（均仅依赖 G1）→ Wave 3: [G3, G6] 并行 → Wave 4: [G4] → Wave 5: [G7] |

### LOW 问题

| # | 优先级 | 维度 | 位置 | 描述 | 修改建议 |
|---|--------|------|------|------|---------|
| 3 | LOW | 用例质量 | 全局 | "总计：37 个测试用例"但实际为 50（G1:7 + G2:11 + G3:11 + G4:5 + G5:5 + G6:3 + G7:8） | 更正为 50 |
| 4 | LOW | AC 覆盖 | TC-7-07 | 断言"requiresConfirmation 分布 = Stage 2/8/15"，但 spec AC12 写 Stage 14。plan.md T2 已澄清"D9 写 Stage 14 实际意为 Stage 15"，但 TC 未引用此澄清 | 在 TC-7-07 中添加注释："以 plan.md T2 澄清为准，Stage 15 = Phase 4 终审" |
| 5 | LOW | 依赖关系图 | ASCII 图 | G7 仅在文字中说明"依赖 G2+G4+G5"，但 ASCII 图中 G7 的连线箭头指向不清晰——图示中 G7 出现在右下角但无明确的入边标注 | 在 ASCII 图中为 G7 补充清晰的入边：`G7 (集成) ← G2 + G4 + G5` |
| 6 | LOW | 依赖关系 | G5 依赖声明 | 依赖图可视化中 G2 和 G5 共享从 G1 的分支，G2→G3→G4 路径上 G4 标注依赖"G3+G5"，但 G5 并不在该路径上。读者需要交叉核对文字说明才能理解 | 小问题，不影响执行。可在依赖图旁补充简短文字说明 G5 与 G2-G3-G4 路径的关系 |

---

## 依赖关系验证

### 依赖矩阵

| 组 | 声明的前置依赖 | 执行 Wave | 冲突？ |
|----|-------------|----------|--------|
| G1 | 无 | Wave 1 | ✅ |
| G2 | G1 | Wave 2 | ✅ |
| G3 | G2 | Wave 3 | ✅ |
| G4 | G3 + G5 | Wave 4 | ✅（Wave 3 后 G3 和 G5 均完成） |
| G5 | G1 | Wave 1（与 G1 并行） | ❌ 依赖 G1 但与 G1 并行 |
| G6 | G5 | Wave 3 | ✅（Wave 1/2 后 G5 完成——如果修正 G5 到 Wave 2） |
| G7 | G2 + G4 + G5 | Wave 5 | ✅（Wave 4 后全部完成） |

**关键问题**：G5 标注依赖 G1 但被放在 Wave 1 与 G1 并行。这是 v1 Issue #8 的延续，声称已修复但实际未改。

### 修正后的执行策略

```
Wave 1: [G1]（类型 + Stage 定义）
Wave 2: [G2, G5] 并行（均仅依赖 G1）
Wave 3: [G3, G6] 并行（G3 依赖 G2, G6 依赖 G5）
Wave 4: [G4]（依赖 G3 + G5）
Wave 5: [G7]（依赖 G2 + G4 + G5）
```

无循环依赖。拓扑排序可行（修正 G5 执行时机后）。

---

## 测试环境检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 运行时 | ✅ | Node.js ≥ 22, node --import tsx |
| 测试框架 | ✅ | node:test 或 vitest |
| 测试文件位置 | ✅ | `extensions/coding-workflow/__tests__/` |
| 项目根 | ✅ | 指定绝对路径 |
| 启动命令 | ✅ | `npx tsx --test extensions/coding-workflow/__tests__/*.test.ts` |
| 测试数据 | ✅ | `__tests__/fixtures/` 目录，7 个 fixture 文件列表 |
| 前端启动 | N/A | 纯 TS 框架 |
| 后端启动 | N/A | 无后端服务 |
| 数据库 | N/A | 无数据库 |

环境配置完整。

---

## 步骤可执行性抽查

抽查 4 个用例（覆盖不同类型）：

### TC-2-01（init 创建空 JSON）
- 断言：`init()` → `existsSync(evidenceFile)` 为 true，`readFileSync` 含 `"rounds": []`
- 评估：✅ 可执行。步骤明确：调用 init → 检查文件存在 → 检查 JSON 内容

### TC-3-02（item_coverage FAIL）
- 断言：JSON 含 4 个 + plan 声明 5 个 → `pass === false`, output 含 case_id
- 评估：✅ 可执行。输入（4/5 case JSON）和预期输出（pass=false + 输出含 ID）均明确

### TC-7-02（健康检查阻塞）
- 断言：Mock health check 返回 HTTP 500 → Phase 3 不进入 Loop，回退到 Stage 10
- 评估：✅ 可执行。Mock 方式 + 预期行为明确

### TC-5-03（advanceTo Phase 3→4）
- 断言：`advanceTo(state, 13, 14, 4, "summary")` → state.currentStage=14, state.currentPhase=4
- 评估：✅ 可执行。函数签名和预期状态变化明确

**结论：v2 的步骤可执行性显著改善。每个用例有明确的断言描述，执行 agent 可据此编写测试代码。**

---

## 用例质量检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 用例编号规范 | ✅ | TC-{组号}-{序号}，全局唯一，50 个无重复 |
| 用例目标清晰 | ✅ | 每个用例有"场景"列描述验证什么 |
| 测试数据说明 | ✅ | fixtures 目录 + 7 个文件列表，每个 TC 引用明确 |
| 严重程度标注 | ❌ | 未标注 | 
| 无重复用例 | ✅ | 50 个用例无重复场景 |

---

## 结论

**需修改后重审。**

2 条 MUST-FIX：
1. TC-7-03 测试行为与 AC4 不匹配——测试的是 loop exit 而非 spawn fixer subagent
2. G5 依赖 G1 但 Wave 1 将其与 G1 并行——v1 Issue #8 的延续

---

### Summary

E2E 测试计划评审完成，第 2 轮，2 条 MUST-FIX（TC-7-03 行为偏差 + G5 依赖矛盾未修），需修改后重审。v1 的 6 条 AC 覆盖缺失已解决，步骤可执行性已改善，但仍有 2 条阻塞性问题。
