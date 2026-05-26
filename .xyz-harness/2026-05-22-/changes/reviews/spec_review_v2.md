---
verdict: pass
must_fix: 0
review:
  type: spec_review
  round: 2
  timestamp: "2026-05-22T21:50:00"
  target: ".xyz-harness/2026-05-22-/spec.md"
  summary: "Spec 评审完成，第2轮通过，0条MUST FIX，2条MUST FIX已修复"

statistics:
  total_issues: 4
  must_fix: 0
  must_fix_resolved: 2
  low: 1
  info: 1

issues:
  - id: 1
    severity: MUST_FIX
    location: ".xyz-harness/2026-05-22-/spec.md:FR-12"
    title: "FR-12 缺少明确的变更目标文件"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 2
    severity: MUST_FIX
    location: ".xyz-harness/2026-05-22-/spec.md:FR-13"
    title: "FR-13 与 FR-3 完全重复"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 3
    severity: LOW
    location: ".xyz-harness/2026-05-22-/spec.md:AC-12"
    title: "AC-12 合并了 3 个独立需求"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 4
    severity: INFO
    location: ".xyz-harness/2026-05-22-/spec.md:B1-B5"
    title: "各批次缺少独立的验收标准"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# Spec 评审 v2

## 评审记录
- 评审时间：2026-05-22 21:50
- 评审类型：计划评审（变更验证 — 第 1 轮 MUST FIX 修复确认）
- 评审对象：`.xyz-harness/2026-05-22-/spec.md`

---

## 第 1 轮 MUST FIX 修复验证

### MUST FIX #1: FR-12 缺少明确的变更目标文件 → ✅ 已修复

**检查项 1：是否指定了具体变更目标文件（skill 文档路径）**

FR-12 当前内容：

> 如验证通过：在 `skills/xyz-harness-brainstorming/SKILL.md` 和 `skills/harness-retrospect/SKILL.md` 中明确记录 retrospect 只在 gate PASS 后触发的行为。
> 
> 如验证不通过（发现 retrospect 确实在 review FAIL 时被触发）：修改 `extensions/coding-workflow/lib/review-dispatcher.ts` 的 `buildRetrospectFollowUp()` 调用逻辑，确保只在 review `must_fix == 0` 时才在 followUp 中加入 retrospect 指令。

| 场景 | 目标文件 | 状态 |
|------|---------|------|
| 验证通过（代码已正确） | `skills/xyz-harness-brainstorming/SKILL.md` | ✅ 明确指定 |
| 验证通过（代码已正确） | `skills/harness-retrospect/SKILL.md` | ✅ 明确指定 |
| 验证不通过（代码有缺陷） | `extensions/coding-workflow/lib/review-dispatcher.ts` | ✅ 明确指定 |

**结论：已修复。** 三个可能涉及的变更目标文件均已明确列出。

---

**检查项 2：是否有验证不通过的 fallback 方案**

FR-12 的 fallback 方案完整：

> 如验证不通过（发现 retrospect 确实在 review FAIL 时被触发）：修改 `extensions/coding-workflow/lib/review-dispatcher.ts` 的 `buildRetrospectFollowUp()` 调用逻辑，确保只在 review `must_fix == 0` 时才在 followUp 中加入 retrospect 指令。

- ✅ 条件明确："review `must_fix == 0` 时才触发"
- ✅ 目标文件明确：`review-dispatcher.ts`
- ✅ 操作范围明确：修改 `buildRetrospectFollowUp()` 调用逻辑

**结论：已修复。**

---

**检查项 3：AC-14 是否覆盖了 FR-12 的验证需求**

新增 AC-14：

> ### AC-14: Retrospect 流程验证（F-12）
> - 确认 `buildRetrospectFollowUp()` 只在 review `must_fix == 0` 时被调用
> - 如需修改：review-dispatcher.ts 中增加条件判断
> - 如已正确：在 skill 文档中记录该行为
> - **验证方式**：代码审查 review-dispatcher.ts 的 followUp 生成逻辑

- ✅ 覆盖代码审查路径
- ✅ 包含"修改"和"记录"两条行动路径
- ✅ 验证方式具体（代码审查 review-dispatcher.ts）

**结论：已修复。** FR-12 的验证需求被 AC-14 完整覆盖。

---

### MUST FIX #2: FR-13 与 FR-3 完全重复 → ✅ 已修复

FR-13 当前内容：

> ### FR-13: （已合并至 FR-3）
> F-13 的内容已完整包含在 FR-3 的 Dev Skill 自检清单（影响半径检查、迁移 checklist）中，不再单独列出以避免冗余。

- ✅ FR-13 不再作为独立 FR 包含可执行内容
- ✅ 明确声明已合并至 FR-3
- ✅ 无冗余内容（原有重复项已在 FR-3 的 Dev Skill 自检清单中体现）

**结论：已修复。**

---

### LOW #3: AC-12 合并了 3 个独立需求 → ✅ 已修复

原 AC-12 合并了 F-14（Spec 数据模型预检 + Plan 伪代码标注）和 F-15（Plan 禁止写实现代码），现被拆分为独立的 AC：

| 原 AC-12 项 | 对应 FR | 当前 AC | 状态 |
|------------|---------|---------|------|
| Plan Skill 包含"禁止写实现代码"规则 | F-15 | **AC-12** | ✅ 独立 |
| Spec Skill 包含"数据模型预检"规则 | F-14 | **AC-13**（第一条） | ✅ 独立 |
| Plan Skill 包含"伪代码标注数据来源"规则 | F-14 | **AC-13**（第二条） | ✅ 独立 |
| TDD subagent 上下文传递 | F-16 | **AC-6**（原已覆盖） | ✅ 无需拆分 |

说明：
- F-14 的两条子规则（Spec 数据模型预检 + Plan 伪代码标注）属于同一 FR，合并在 AC-13 中是合理的——它们是同一个功能需求的两面
- F-16（TDD 上下文传递）原本就不在旧 AC-12 中，已在 AC-6 覆盖
- 新增 AC-14（FR-12 Retrospect 流程验证）不在旧 AC-12 范围内，是新增的独立 AC

**结论：已修复。** 拆分后的 AC-12/AC-13 各自聚焦单个 FR，互不重叠。

---

## 新增 AC 覆盖检查

检查新增的 AC-12、AC-13、AC-14 是否完整覆盖了原 AC-12 拆分出的需求：

| 原 AC-12 需求点 | 覆盖 AC | 完全覆盖？ | 说明 |
|----------------|---------|-----------|------|
| Plan Skill 包含"禁止写实现代码"规则 | AC-12 | ✅ | 单条规则，验证方式明确（grep 指定文件） |
| Spec Skill 包含"数据模型预检"规则 | AC-13（第一条） | ✅ | 规则描述与原 AC-12 一致 |
| Plan Skill 包含"伪代码标注数据来源"规则 | AC-13（第二条） | ✅ | 规则描述与原 AC-12 一致 |
| FR-12 Retrospect 流程验证（新增需求） | AC-14 | ✅ | 新 AC，不在旧 AC-12 范围内 |

**结论：全部覆盖，无遗漏。**

---

## 未处理项

### INFO #4: B1-B5 各批次缺少独立的验收标准（未处理）

第 1 轮 INFO 观察提到 Complexity Assessment 中缺少批次级验收标准。当前 spec 未做此修改。维持 open 状态，但此条为 INFO 级别，不影响 verdict。

---

## 额外观察

无新发现问题。第 1 轮的全部 2 条 MUST FIX 已正确修复，AC 拆分合理。

---

## 结论

**通过。**

第 1 轮的 2 条 MUST FIX 均已正确修复：
1. FR-12 → 已指定具体变更目标文件 + 已验证不通过的 fallback 方案 + 已有 AC-14 覆盖
2. FR-13 → 已声明合并至 FR-3，不再独立列出冗余内容
3. AC-12/AC-13/AC-14 → 已拆分，完整覆盖各 FR 需求

### Summary

计划评审完成，第2轮通过，0条MUST FIX。
