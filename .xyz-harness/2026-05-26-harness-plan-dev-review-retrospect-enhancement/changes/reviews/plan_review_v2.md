---
review:
  type: plan_review
  round: 2
  timestamp: "2026-05-26T18:55:00"
  target: ".xyz-harness/2026-05-26-harness-plan-dev-review-retrospect-enhancement/plan.md, e2e-test-plan.md"
  verdict: pass
  must_fix: 0
  summary: "增量审查完成，第2轮。第1轮 MUST FIX #1 已修复，后附 1 条新 LOW 发现和 1 条 INFO"

statistics:
  total_issues_round1: 5
  resolved_round1:
    must_fix: 1
    low: 2
    info: 2
  new_issues_round2:
    low: 1
    info: 1

issues:
  - id: 1
    severity: MUST_FIX
    location: "plan.md → Task 10"
    title: "缺少 gate-check.py 向后兼容的具体实现策略"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
    resolution: >-
      Task 10 已增加"向后兼容策略（ADR-0006）"章节，明确声明 gate-check.py 不区分新旧 topic，
      新规则适用于所有 topic，旧 topic 如需重新跑 gate 需补齐 deliverables。策略与已接受的
      ADR-0006（accepted 2026-05-22）一致。MUST FIX 关闭。

  - id: 2
    severity: LOW
    location: "plan.md → Dependency Graph & Wave Schedule"
    title: "Wave 编排未明确 subagent 粒度"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
    resolution: >-
      Wave 编排已增加显式并行约束段落，Batch 1: BG1+BG2+BG3（3 并行）、Batch 2: BG4+BG5（2 并行），
      隐含 Group 级 subagent 而非 Task 级，消除了歧义。LOW 关闭。

  - id: 3
    severity: LOW
    location: "e2e-test-plan.md → TS-8"
    title: "缺少有 typecheck 配置时的场景测试"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
    resolution: >-
      E2E 测试计划新增 TS-9：对有 ESLint+TypeScript 的项目 dispatch standards_review，
      验证产出包含 linter_passed + typecheck_passed。LOW 关闭。

  - id: 4
    severity: INFO
    location: "plan.md → Spec Metrics Traceability 表格"
    title: "Spec Metrics Traceability 与 Spec Coverage Matrix 内容重复"
    status: unresolved
    raised_in_round: 1
    resolved_in_round: null
    note: "两个表格仍并存。重复但无实际危害，INFO 保留。"

  - id: 5
    severity: INFO
    location: "e2e-test-plan.md"
    title: "缺少 AC-12 (review_metrics + retrospect 价值评估) 的测试场景"
    status: unresolved
    raised_in_round: 1
    resolved_in_round: null
    note: "E2E 测试仍无 AC-12 专项场景，但 TS-1/2/3 间接覆盖 reviewer skill 的 gate 检查。INFO 保留。"

  - id: 6
    severity: LOW
    location: "spec.md → AC-11 line 324 vs Constraints line 342"
    title: "Spec AC-11 与 ADR-0006 存在矛盾，需 spec 修订"
    status: open
    raised_in_round: 2
    resolved_in_round: null
    findings:
      - "spec.md AC-11 line 324: '旧 topic 目录不受新规则影响（ADR-0006）' — 错误引用 ADR-0006"
      - "ADR-0006 实际内容: '不兼容历史 Topic 格式，历史文件不迁移、不兼容、不处理'"
      - "spec.md Constraints line 342: '保持对旧 topic 的兼容（通过 phase spec 的可选字段实现）' — 与 ADR-0006 冲突"
      - "plan.md 正确遵循 ADR-0006（不兼容策略），但 spec 仍保留反向要求"
    recommendation: >-
      spec.md AC-11 的 line 324 应修正引用（ADR-0006 说的是不兼容，不是兼容），
      Constraints line 342 应删除或改为与 ADR-0006 一致（删除可选字段要求）。
      此举不阻塞 plan 执行——plan 的选择（ADR-0006）是正确的且已实施。

  - id: 7
    severity: INFO
    location: "plan.md → Task 10"
    title: "ADR-0006 引用验证通过"
    status: open
    raised_in_round: 2
    resolved_in_round: null
    findings:
      - "docs/adr/0006-no-backward-compat-for-old-topics.md 存在，status: accepted，date: 2026-05-22"
      - "plan 对 ADR-0006 的解读（不兼容策略）与原文一致"
      - "plan Task 10 Step 5 测试旧 topic Phase 1 gate 不受影响，但未测试 Phase 2 gate（预期 FAIL）"
    note: "引用有效，策略一致性验证通过。"
---

# 计划评审 v2（增量审查）

## 评审记录
- 评审时间：2026-05-26 18:55
- 评审类型：增量审查（第 2 轮）
- 评审对象：已修复的 `plan.md` + `e2e-test-plan.md`
- 评审范围：第 1 轮 MUST FIX #1 修复验证 + 修复引入的新问题
- 对比基准：`plan_review_v1.md`（第 1 轮审查）

---

## 1. MUST FIX #1 修复验证

### 1.1 修复内容

`plan.md` Task 10 新增了 **"向后兼容策略（ADR-0006）"** 章节：

```
向后兼容策略（ADR-0006）：gate-check.py 不区分新旧 topic。新规则对旧 topic 的影响：
Phase 2 旧 topic 缺少 use-cases.md/non-functional-design.md 时 gate FAIL，
Phase 3 旧 topic 缺少 5 个新 review 文件时 gate FAIL。
这是 ADR-0006 的预期行为——"不兼容历史 Topic 格式，所有改动只对新 topic 生效"。
旧 topic 如果需要重新跑 gate，需要按新规则补齐 deliverables。
```

### 1.2 有效性验证

✅ **策略清晰。** plan 选择了明确的路线：不兼容旧 topic，新规则无条件生效。旧 topic 不再需要重新跑 gate（已完成历史的 gate PASS + merged），如需重跑必须补齐。

✅ **与 ADR-0006 一致。** 验证了 `docs/adr/0006-no-backward-compat-for-old-topics.md`（status: accepted, date: 2026-05-22），内容与 plan 引用一致。

### 1.3 备选路线评估

| 路线 | 方案 | 谁选的 | 评价 |
|------|------|--------|------|
| 可选字段 | 新 deliverable 文件不存在时跳过检查 | Round 1 审查建议 + spec Constraints line 342 | 安全但增加代码复杂度（每处有条件的判断） |
| **ADR-0006 策略（已选）** | 不兼容旧 topic，新规则无条件检查 | **plan** | 简单直接，ADL 已有决策记录 |

✅ **plan 的选择是合理的。** ADR-0006 是已接受的架构决策，早于本 spec（2026-05-22 vs 2026-05-26），且其背景（旧 topic 无重新跑 gate 场景）在本场景中仍然成立。

**结论：MUST FIX #1 → RESOLVED。**

---

## 2. LOW #2 修复验证（Wave 编排粒度）

### 2.1 修复内容

Wave 编排新增并行约束段落：

```
并行约束: Wave 1 有 5 个 Group，Semaphore 限制最多 3 个 subagent 并行。分两批：
- Batch 1: BG1, BG2, BG3（3 并行）
- Batch 2: BG4, BG5（2 并行）
```

### 2.2 有效性验证

✅ 批次划分（3+2）隐含了 Group 级 subagent 假设，排除了 Task 级 10 个 subagent 的歧义。

✅ 但 plan 仍未 **显式声明**"每个 Group 由 1 个 subagent 整体执行（Group 内 Task 串行）"。考虑到 LOW 优先级，当前表述已足够消除执行歧义。

**结论：LOW #2 → RESOLVED。**

---

## 3. LOW #3 修复验证（typecheck 场景）

### 3.1 修复内容

E2E 测试计划新增 **TS-9: Standards Reviewer 有 lint+typecheck 项目**：

```
1. 对有 ESLint + TypeScript 的项目 dispatch standards_review subagent
2. 验证：产出包含 linter_passed: true 和 typecheck_passed: true
3. 如果 lint 失败：验证 linter_passed: false, must_fix>0
```

### 3.2 有效性验证

✅ 直接覆盖了 AC-5 的 typecheck_passed 字段验证。

✅ 同时测试了成功和失败两条路径（步骤 2 vs 3）。

**建议改进（非阻塞）：** TS-9 未指定使用的项目名称。建议标注参考项目路径，如 `e2e/` 或指定一个已知有 TypeScript 的 topic 目录。

**结论：LOW #3 → RESOLVED。**

---

## 4. 修复是否引入新问题

### 4.1 范围检查（无新增）

| 检查项 | 结果 | 说明 |
|--------|------|------|
| plan 新增内容是否超出 spec 范围 | ✅ 否 | ADR-0006 是现有决策，非新增需求 |
| plan 是否新增了无 spec 依据的 Task | ✅ 否 | 无新增 Task |
| plan 是否删除了 spec 要求的 Task | ✅ 否 | 所有 FR→Task 映射完整 |
| e2e 是否删除了原有过关场景 | ✅ 否 | TS-1~8 保留，新增 TS-9 |

### 4.2 新引入的风险

| 风险 | 影响 | 可能性 |
|------|------|--------|
| 执行者不熟悉 ADR-0006，按 spec Constraints line 342 做可选字段实现 | 实现与 plan 不一致 | 低（plan 已覆写为 ADR-0006 策略） |
| 旧 topic 意外重跑 Phase 2 gate 获得 FAIL | 用户困惑 | 低（旧 topic 已完结，无重新跑场景） |

---

## 5. 新发现的问题

### 5.1 LOW #6: Spec AC-11 与 ADR-0006 矛盾，需 spec 修订

**严重度：** LOW（不阻塞 plan 执行，但需要在进入 Phase 3 前解决）

**发现：**

spec.md 的 AC-11 与 ADR-0006 之间存在三重矛盾：

| 位置 | 原文 | 与 ADR-0006 关系 |
|------|------|-----------------|
| AC-11 line 324 | "旧 topic 目录不受新规则影响（ADR-0006）" | ❌ 错误引用。ADR-0006 说的是"不兼容"，不是"不受影响" |
| Constraints line 342 | "保持对旧 topic 的兼容（通过 phase spec 的可选字段实现）" | ❌ 与 ADR-0006 直接冲突。ADR 明确说"不兼容、不处理" |
| Non-functional line 363 | "旧 topic 的 gate-check 不受新规则影响" | ❌ 与 ADR-0006 冲突 |

ADR-0006 实际内容（accepted 2026-05-22）：

```
所有改动只对新 topic 生效。
历史 .xyz-harness/ 目录下的旧文件不迁移、不兼容、不处理。
历史 topic 已全部完成（gate PASS + PR merged），没有重新跑 gate 的场景。
兼容旧格式会增加 gate-check.py 的复杂度...而收益为零。
```

**影响评估：** plan.md 正确选择了 ADR-0006 路线。但 spec 仍保留相反要求，进入 Phase 3 实现时如果执行者同时参考 spec 和 plan，会产生困惑。**建议在 Phase 2 内更新 spec.md**，将 AC-11 的 ADR-0006 引用修正为实际含义，删除或修改 Constraints line 342。

**建议修改方案：**

```
// AC-11 line 324（修正引用）
- 旧 topic 目录不受新规则影响 → 遵循 ADR-0006：新规则适用于所有 topic，
  旧 topic 已完结无需重新跑 gate

// Constraints line 342（删除或修改）
- 删除: "Gate-check.py 改动必须保持对旧 topic 的兼容（通过 phase spec 的可选字段实现）"
- 替换: "遵循 ADR-0006：不兼容旧 topic 格式，新规则无条件生效"
```

### 5.2 INFO #7: ADR-0006 引用验证

✅ `docs/adr/0006-no-backward-compat-for-old-topics.md` 存在且内容与 plan 引用一致。
✅ 验证命令：`ls docs/adr/` → 文件存在，grep "ADR-0006" → 标题匹配。

**唯一问题：** plan Task 10 Step 5 只测试旧 topic 的 Phase 1 gate（预期 PASS），未测试旧 topic 的 Phase 2 gate（预期 FAIL）。建议在 Step 6 备注中明确：旧 topic Phase 2 gate **预期 FAIL**，这是 ADR-0006 的预期行为而非 bug。

---

## 6. 第 1 轮未修复项回溯

| 问题 | 状态 | 依据 |
|------|------|------|
| INFO #4: Spec Metrics Traceability 重复 | 未修复 | 两表仍并存。删除建议保留但非阻塞。 |
| INFO #5: 缺少 AC-12 测试场景 | 未修复 | E2E 无 AC-12 专项场景。但 AC-12 的验证依赖 Phase 3 执行，当前 E2E 聚焦在 Phase 2 前的检查点，可接受。 |

---

## 7. 最终结论

| 维度 | 评估 |
|------|------|
| MUST FIX #1 修复 | ✅ 已修复。策略清晰，与 ADR-0006 一致 |
| 修复是否引入新问题 | ✅ 无引入。spec 的 ADR-0006 引用错误独立存在，不影响 plan 正确性 |
| 整体可执行性 | ✅ 可执行。11 个 Task 依赖正确，Wave 编排无歧义 |
| 待处理事项 | 建议在 Phase 2 内更新 spec.md AC-11 的 ADR-0006 引用错误（LOW） |

**verdict: pass**（可进入 Phase 3 实施，建议先修正 spec 矛盾）

### 整体评估

第 1 轮的 1 条 MUST FIX（gate-check.py 向后兼容策略）已通过 ADR-0006 策略修复。修复本身没有引入新问题。新发现的 spec 与 ADR-0006 矛盾需要 spec 修订，但不阻碍计划执行。

### 第 1 轮 Issues 关闭状态

| ID | Severity | Round 1 | Round 2 |
|----|----------|---------|---------|
| 1 | MUST_FIX | open | **resolved** ✅ |
| 2 | LOW | open | **resolved** ✅ |
| 3 | LOW | open | **resolved** ✅ |
| 4 | INFO | open | unresolved |
| 5 | INFO | open | unresolved |
| 6 | LOW | — | **new** (spec 矛盾) |
| 7 | INFO | — | **new** (ADR 验证) |
