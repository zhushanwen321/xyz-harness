---
review:
  type: e2e_test_plan_review
  round: 3
  timestamp: "2026-05-16T21:15:00"
  target: "e2e-test-plan.md"
  verdict: pass
  summary: "v2 的 2 条 MUST-FIX 均已修复，无新增 MUST-FIX，评审通过"

statistics:
  total_issues: 4
  must-fix: 0
  must-fix_resolved: 2
  low: 4
  info: 0

issues:
  - id: 1
    severity: MUST_FIX
    location: "TC-7-03 / AC4"
    title: "TC-7-03 测试的是 loop exit 行为而非 AC4 要求的 spawn fixer subagent"
    status: resolved
    raised_in_round: 2
    resolved_in_round: 3
  - id: 2
    severity: MUST_FIX
    location: "执行策略 Wave 1 vs 依赖关系图"
    title: "G5 依赖 G1 但 Wave 1 声明 G1/G5 并行"
    status: resolved
    raised_in_round: 2
    resolved_in_round: 3
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
---

# E2E 测试计划评审 v3

## 评审记录
- 评审时间：2026-05-16 21:15
- 评审类型：E2E 测试计划独立评审（终轮）
- 评审对象：e2e-test-plan.md（v3，修复后）
- 评审轮次：第 3 轮
- 上轮结果：2 条 MUST-FIX

---

## V2 Issue 解决情况

| V2 # | 严重度 | 描述 | 解决状态 | 验证 |
|-------|--------|------|---------|------|
| #1 | MUST-FIX | TC-7-03 测 loop exit 而非 spawn fixer | ✅ 已解决 | 当前文本："Mock item status=ERROR → 验证引擎/agent 触发 fixer subagent → 验证 evidence 记录 `fix_commit` 非空"。行为路径从 loop exit 改为 spawn fixer，与 AC4 匹配 |
| #2 | MUST-FIX | G5 与 G1 并行矛盾 | ✅ 已解决 | 当前执行策略：Wave 1: [G1] 串行 → Wave 2: [G2, G5] 并行。G5 不再与 G1 并行 |
| #3 | LOW | 用例总数 37→50 | ❌ 未修 | 仍写"37 个测试用例"，实际 grep 统计 50 条 TC 记录 |
| #4 | LOW | TC-7-07 未引用 plan.md 澄清 | ❌ 未修 | 仍断言 Stage 2/8/15，未注明 plan.md T2 澄清 |
| #5 | LOW | G7 在 ASCII 图中入边不清晰 | — | 图中有文字说明"(依赖 G2 + G4 + G5)"，可接受 |
| #6 | LOW | G4 依赖 G3+G5 可视化 | — | 小问题，不影响执行 |

---

## Spec AC 覆盖矩阵

| AC | 场景 | 覆盖状态 | 测试用例 |
|----|------|---------|----------|
| AC1 | Phase 2→3 自动过渡无确认 | ✅ 完整覆盖 | TC-7-01 |
| AC2 | 健康检查失败阻塞 Loop | ✅ 完整覆盖 | TC-7-02 |
| AC3 | E2E Loop 正确写入 JSON | ✅ 完整覆盖 | TC-2-01, TC-2-02, TC-2-11 |
| AC4 | ERROR 场景 spawn subagent | ✅ 完整覆盖 | TC-7-03 |
| AC5 | 全部 EXECUTED → Verification Round | ✅ 完整覆盖 | TC-2-05, TC-2-10 |
| AC6 | Verification Round 完成声明 | ✅ 完整覆盖 | TC-2-05, TC-3-05 |
| AC7 | Gate 五项 L1 检查 | ✅ 完整覆盖 | TC-3-01~TC-3-11, TC-4-01~TC-4-05 |
| AC8 | Gate PASS + 人工确认 | ✅ 完整覆盖 | TC-7-04 |
| AC9 | Gate FAIL → 回退 Loop | ✅ 完整覆盖 | TC-7-05 |
| AC10 | max_rounds 达到后 FAIL | ✅ 完整覆盖 | TC-2-07 |
| AC11 | Phase 4 全流程收尾 | ✅ 完整覆盖 | TC-7-06 |
| AC12 | 确认点分布 | ✅ 完整覆盖 | TC-1-03, TC-7-07 |
| AC13 | 向后兼容 | ✅ 完整覆盖 | TC-6-01~TC-6-03, TC-7-08 |

覆盖率：13/13 AC 全部覆盖，无遗漏。

---

## 四层策略合理性

| 用例组 | 验证层级 | 场景 | 评估 |
|--------|---------|------|------|
| G1 | L1 | 类型定义 + Stage 配置（编译检查） | ✅ |
| G2 | L1+L4 | Loop 状态机 + JSON 数据 | ✅ |
| G3 | L1+L4 | L1 检查函数 + JSON 输入输出 | ✅ |
| G4 | L1+L4 | Gate 组合逻辑 | ✅ |
| G5 | L1+L4 | StateManager save/load + 状态转换 | ✅ |
| G6 | L1+L4 | 向后兼容加载 | ✅ |
| G7 | L1+L4 | 跨模块集成（全 mock） | ✅ |

本项目无 UI、无浏览器、无数据库服务。所有测试基于 TS 函数调用 + JSON 文件验证。L1（函数调用）+ L4（数据/JSON）是合理的层级选择。无 L2/L3 需求。

---

## 依赖关系验证

| 组 | 前置依赖 | 执行 Wave | 正确性 |
|----|---------|----------|--------|
| G1 | 无 | Wave 1 | ✅ |
| G2 | G1 | Wave 2 | ✅（Wave 1 后） |
| G5 | G1 | Wave 2 | ✅（Wave 1 后，与 G2 并行） |
| G3 | G2 | Wave 3 | ✅（Wave 2 后） |
| G6 | G5 | Wave 3 | ✅（Wave 2 后，与 G3 并行） |
| G4 | G3 + G5 | Wave 4 | ✅（Wave 3 后） |
| G7 | G2 + G4 + G5 | Wave 5 | ✅（Wave 4 后） |

拓扑排序有效，无循环依赖，执行顺序与依赖矩阵一致。

---

## 步骤可执行性抽查

抽查 3 个用例（含 v2 修复的 TC-7-03）：

### TC-7-03（v2 修复项）
- 断言：Mock item status=ERROR → 验证引擎/agent 触发 fixer subagent → 验证 evidence 记录 `fix_commit` 非空
- 评估：✅ 可执行。Mock 方式明确（构造 ERROR item），验证目标明确（fixer subagent 触发 + fix_commit 非空）

### TC-3-09（evidence_files_exist PASS）
- 断言：写 2KB 文件 → `pass === true`
- 评估：✅ 可执行。输入（写文件）和预期输出均明确

### TC-5-01（LoopState 往返）
- 断言：创建 LoopState → save → load → 字段一致
- 评估：✅ 可执行。经典的序列化往返测试模式

---

## 测试环境检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 运行时 | ✅ | Node.js ≥ 22 |
| 测试框架 | ✅ | node:test 或 vitest |
| 文件位置 | ✅ | `extensions/coding-workflow/__tests__/` |
| 启动命令 | ✅ | `npx tsx --test extensions/coding-workflow/__tests__/*.test.ts` |
| 测试数据 | ✅ | 7 个 fixture 文件列表完整 |
| 前端/后端/DB | N/A | 纯 TS 框架测试 |

---

## 发现的问题

### 遗留 LOW 问题（不阻塞）

| # | 优先级 | 维度 | 位置 | 描述 |
|---|--------|------|------|------|
| 3 | LOW | 用例质量 | 第 186 行 | 总计写"37 个测试用例"，实际为 50 |
| 4 | LOW | AC 覆盖 | TC-7-07 | 断言 Stage 2/8/15 但未引用 plan.md T2 澄清（以 plan.md T2 为准，实际正确） |

无 MUST-FIX 问题。

---

## 结论

**通过。**

v2 的 2 条 MUST-FIX 均已正确修复：
1. TC-7-03 改为测试 spawn fixer subagent 行为，与 AC4 匹配
2. 执行策略改为 G1 串行先行，G2/G5 并行随后，依赖关系一致

2 条遗留 LOW 问题（用例计数 37→50、TC-7-07 未引用 plan.md 澄清）不阻塞执行，可后续修正。

---

### Summary

E2E 测试计划评审完成，第 3 轮，0 条 MUST-FIX，通过。
