---
verdict: pass
must_fix: 0

review:
  type: spec_review
  round: 2
  timestamp: "2026-05-26T12:00:00"
  target: ".xyz-harness/2026-05-26-plan-interface-contract/spec.md"
  summary: "第 2 轮 spec 审查完成，2 条 MUST_FIX 均已解决，通过"

statistics:
  total_issues: 2
  must_fix_resolved: 2
  low: 0
  info: 0

issues:
  - id: 1
    severity: MUST_FIX
    location: "spec.md:FR-6 / AC-7 (TDD subagent consumption)"
    title: "L1 plan 下 TDD subagent 消费接口签名的方式未定义"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
    resolution: >-
      FR-6 新增 L1 plan 路径：主 agent 从 plan.md 的 Interface Contracts markdown
      表格中提取方法签名。新增最低传递标准（L1/L2 统一）。AC-7 补充来源说明
      "interface_chain.json（L2）或 plan.md 接口签名表（L1）"。

  - id: 2
    severity: MUST_FIX
    location: "spec.md:FR-7 (Phase 4 consumption) vs Constraints"
    title: "test_cases_template.json 不改 schema 但需标注 data_flow 引用存在矛盾"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
    resolution: >-
      FR-7 移除"标注验证了哪个 data_flow"的表述，改为 data_flow 覆盖验证在
      Phase 4 执行步骤描述中体现，不改 test_cases_template.json schema。
      冲突已消除。
---

# 计划评审 v2 — spec 第 2 轮审查

## 审查目标

验证第 1 轮审查（spec_review_v1.md）提出的 2 条 MUST_FIX 是否已在当前 spec.md 中得到解决。

## 逐条验证

### Issue #1 — L1 plan 下 TDD subagent 消费接口签名的方式 (MUST_FIX)

**v1 问题陈述：**
FR-6 明确写"主 agent 从 interface_chain.json 中提取"，但 FR-3 说明 L1 plan 不产出 interface_chain.json。L1 路径下 TDD subagent 如何获取方法签名？未覆盖。

**当前 spec 处理情况：**

FR-6 已补充 L1 路径：
> **L1 plan（无 interface_chain.json）：**
> 主 agent 从 plan.md 的 Interface Contracts markdown 表格中提取当前 Task 涉及的方法签名
> 提取方式：read plan.md 对应模块的接口签名表，将方法名、参数、返回值整理为结构化文本传入 task prompt

同时新增了最低传递标准：
> **最低传递标准（L1/L2 统一）：** task prompt 至少包含方法名、参数类型列表、返回类型。edge_cases 为可选附加信息。

AC-7 的 Then 部分也已更新：
> task prompt 包含当前 Task 涉及的方法签名（至少：方法名、参数类型列表、返回类型），来源为 interface_chain.json（L2）或 plan.md 接口签名表（L1）

**验证结论：已解决 ✅**

路径完整：L1 → plan.md markdown table → read 提取 → 结构化文本 → task prompt。最低标准统一。v1 建议的方案 A（from plan.md markdown 解析）被采用。

---

### Issue #2 — FR-7 与 Constraints 的冲突 (MUST_FIX)

**v1 问题陈述：**
FR-7 要求集成测试用例的 steps 中"标注验证了哪个 data_flow"，但 Constraints 明确说"不改 test_cases_template.json schema"。如果 schema 不能改，test_step 如何携带 data_flow 引用？

**当前 spec 处理情况：**

FR-7 已改写，移除了要求 test_step 标注 data_flow 引用的语言：
> 集成测试用例的验证应覆盖 data_flows 中定义的所有完整调用链
> 验证方式：每个 data_flow 的 chain 中相邻方法之间的数据传递是否正确
> **不改 test_cases_template.json schema，data_flow 覆盖验证在执行层面（Phase 4 的执行步骤描述）中体现**

Constraints 中原有的"不改 test_cases_template.json schema"保留不变。

**验证结论：已解决 ✅**

冲突消除路径：移除"标注"要求 → 验证方式改为执行层面覆盖 → 不改 schema。v1 建议的方案 A（移除标注要求，改为"覆盖 data_flows 中的所有调用链"）被采用。

---

## 新发现的问题

本轮审查未发现新的 MUST_FIX、LOW 或 INFO 问题。v1 中的 3 条 LOW 和 2 条 INFO 问题已被认定为非阻塞性，可在后续实施阶段处理，无需在本轮 spec review 中重审。

## 结论

| 指标 | 值 |
|------|-----|
| 第 1 轮 MUST_FIX | 2 |
| 已解决 | 2 |
| 新 MUST_FIX | 0 |
| 总 MUST_FIX | 0 |

两个 MUST_FIX 均得到有效解决：
- **#1** 通过 FR-6 新增 L1 路径 + 最低传递标准
- **#2** 通过 FR-7 移除矛盾要求，改为执行层面覆盖

**verdict: pass**
