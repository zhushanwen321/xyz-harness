---
review:
  type: spec_review
  round: 1
  timestamp: "2026-05-22T12:00:00"
  target: ".xyz-harness/2026-05-22-/spec.md"
  verdict: fail
  summary: "Spec 评审完成，第1轮，2条MUST FIX，需修改后重审"

statistics:
  total_issues: 4
  must_fix: 2
  must_fix_resolved: 0
  low: 1
  info: 1

issues:
  - id: 1
    severity: MUST_FIX
    location: ".xyz-harness/2026-05-22-/spec.md:FR-12"
    title: "FR-12 缺少明确的变更目标文件"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: MUST_FIX
    location: ".xyz-harness/2026-05-22-/spec.md:FR-13"
    title: "FR-13 与 FR-3 完全重复"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: LOW
    location: ".xyz-harness/2026-05-22-/spec.md:AC-12"
    title: "AC-12 合并了 3 个独立需求"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: INFO
    location: ".xyz-harness/2026-05-22-/spec.md:B1-B5"
    title: "各批次缺少独立的验收标准"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# Spec 评审 v1

## 评审记录
- 评审时间：2026-05-22 12:00
- 评审类型：计划评审（spec 完整性）
- 评审对象：`.xyz-harness/2026-05-22-/spec.md`

## 逐项检查结果

### 1. 目标明确性 ✅

**结论：通过。**

Spec 开篇一句话概括了核心目标——"基于 4 个项目 46 份复盘文件的扫描结果，对 harness 工程进行 16 项优化。按修改面分为 5 个批次（B1-B5），覆盖 P0+P1+P2 全部发现。"

Background 章节进一步交代了问题来源（跨项目复盘扫描）和核心认知（"AI 的核心弱点不是'写错'，而是'遗漏'"），提供了充分的上下文。

### 2. 范围合理性 ✅

**结论：通过。**

Constraints 章节明确限定了边界：
- 不兼容旧 topic（不处理历史文件）
- 不区分 Auto/Manual Mode
- 不涉及 P3（明确列出了不做的 11 项）
- 不修改 Pi SDK
- 技术栈不变
- 实施策略：按修改面分 5 批

修改文件数约 15 个，代码变化 ~200 行，文档变化 ~500 行——对 harness 工程来说是合理规模。

### 3. 验收标准可量化 ✅

**结论：通过。**

AC-1 到 AC-12 均有具体的验证方式：
- AC-1: "用两种格式的 review 文件分别跑 gate-check.py" ✓
- AC-2: "删除 Phase 3 review 文件后跑 Phase 5 gate，确认 FAIL" ✓
- AC-3 到 AC-11: "grep 确认" ✓
- 具体的构造步骤可复现

AC 覆盖了主要 FR（FR-1 到 FR-11 有对应 AC），但 FR-12/FR-13 缺少对应 AC。

### 4. [待决议] 项检查 ✅（有潜在问题见 MUST FIX #1）

**结论：spec 中没有显式的 `[待决议]` 标记。** 多数 FR 的变更方案已足够具体。
但 FR-12 实质上是研究型任务（先验证再决策是否需修改），缺少明确的交付物文件——这是开放性决策点未被标注的问题。

---

## 发现的问题

### MUST FIX #1: FR-12 缺少明确的变更目标文件

| 字段 | 值 |
|------|-----|
| 位置 | FR-12 (P2) |
| 严重度 | **MUST FIX** |
| 状态 | open |

**问题描述：**

FR-12 的描述为：
> 验证当前代码中 retrospect 的触发时机是否正确（只在 gate PASS + review PASS 后触发），确认 `buildRetrospectFollowUp()` 不在 review FAIL 时被调用。如果确认已正确，在 skill 文档中明确记录这个行为即可。

此 FR 的核心问题：**"在 skill 文档中明确记录" 没有指定具体文件。**

- 如果验证通过，这行文字记录在哪里？`harness-retrospect/SKILL.md`？`coding-workflow` 的 README？`xyz-harness-gate/SKILL.md`？
- 如果验证不通过（代码真的有 bug），需要修代码还是只写文档？
- 不同的 implementor 会做出不同的选择，导致交付物不可预测

**修改方向：**
1. 指定变更目标文件（如 `skills/harness-retrospect/SKILL.md` 或 `extensions/coding-workflow/README.md`）
2. 为"验证不通过"的情况提供 fallback 方案（修代码？改文档？标记已知风险？）
3. 建议增加对应的 AC，确保此 FR 的可验证性

---

### MUST FIX #2: FR-13 与 FR-3 完全重复

| 字段 | 值 |
|------|-----|
| 位置 | FR-13 (P2) |
| 严重度 | **MUST FIX** |
| 状态 | open |

**问题描述：**

FR-13 全文为：
> ### FR-13: MUST FIX 修复影响半径检查（F-13, P2）
> 已包含在 FR-3 的 Dev Skill 自检清单中。修复 MUST FIX 时强制检查同路径相关调用点。

这表明 FR-13 是 FR-3 的一部分，但作为一个独立的 FR 列出。这导致：
- FR 列表有 16 项，实际可独立执行的只有 15 项
- 对 FR-13 和 FR-3 的 AC 覆盖关系混乱（FR-13 算不算已被 AC-3 覆盖？）
- 未来复盘时可能被误判为遗漏

**修改方向：**
1. **方案 A**：删除 FR-13，在 FR-3 的 Dev Skill 行中明确标注 "包含 MUST FIX 修复影响半径检查（F-13）"
2. **方案 B**：保留 FR-13 但修改为 FR-3 的 **补充约束**，而非独立功能——如 "FR-3.1: 自检清单中的 MUST FIX 影响半径检查必须列出所有受影响的调用点"

---

### LOW #3: AC-12 合并了 3 个独立需求

| 字段 | 值 |
|------|-----|
| 位置 | AC-12 |
| 严重度 | LOW |
| 状态 | open |

**问题描述：**

AC-12 合并了 F-14（Spec 数据模型预检）、F-15（Plan 禁止写实现代码）、F-16（TDD 上下文传递）三个正交需求：

```
### AC-12: 其他 P2 发现
- Plan Skill 包含"禁止写实现代码"规则
- Spec Skill 包含"数据模型预检"规则  
- Plan Skill 包含"伪代码标注数据来源"规则
```

三个需求修改不同的 skill 文件、有独立的验证条件，合并为一条 AC 的后果：
- 如果其中一项未通过（如 grep 发现 Plan Skill 缺少规则），整条 AC 标记为 fail，但另外两项已完成却无法独立标注
- 追溯时不清楚具体哪一项失败

**修改方向：**
拆分为三条独立 AC（AC-12a/AC-12b/AC-12c 或 AC-14/AC-15/AC-16），每条独立验证。

---

### INFO #4: B1-B5 各批次缺少独立的验收标准

| 字段 | 值 |
|------|-----|
| 位置 | B1-B5 |
| 严重度 | INFO |
| 状态 | open |

**观察记录：**

Spec 的 Dependencies 章节描述了批次间依赖关系和建议实施顺序（B1 → B2 → B5(并行) → B3 → B4），但没有为每个批次定义独立的验收标准。

例如，B1（gate-check.py 修改）的验收标准是什么？AC-1 和 AC-4 涉及 gate，但它们是面向整体需求的，没有在批次层面确认 B1 是否"足够完成"。

这不是严重问题，因为 spec 已经定义了全量 AC。但如果实施中需要在每个批次完成后做增量验证，缺少批次级 check 会增加人工判断成本。建议在 Complexity Assessment 中为每个 Batch 增加一栏 "Acceptance" 引用涉及到的 AC。

---

## 合格检查汇总

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 目标明确 | ✅ | 一句话说清 16 项优化分 5 批 |
| 范围合理 | ✅ | Constraints 清晰，边界明确 |
| 验收标准可量化 | ⚠️ | 主体 12 项 AC 可操作，但 FR-12/FR-13 无对应 AC |
| [待决议] 标记 | ⚠️ | 无显式标记，但 FR-12 实质是研究型/决策型待定项 |

## 结论

**需修改后重审。**

Spec 整体质量较高——Background 充分、FR 详细、AC 可验证、Constraints 明确。但在以下两方面需要修复：
1. **FR-12 缺少交付目标文件**（MUST FIX）
2. **FR-13 与 FR-3 完全重复**（MUST FIX）

修复后 verdict 可变为 pass。

### Summary

计划评审完成，第1轮，2条MUST FIX，需修改后重审。
