---
review:
  type: plan_review
  round: 2
  timestamp: "2026-05-22T20:15:00"
  target: ".xyz-harness/2026-05-22-/plan.md"
  verdict: pass
  summary: "计划评审完成，第2轮，0条MUST FIX，4条LOW建议，2条INFO观察。plan 整体质量高，v1 发现的5个问题中有6个仍未修复（计划未变更），新增1条LOW（File Structure 表格描述与M1-3/M1-4结论不一致）。"

statistics:
  total_issues: 7
  must_fix: 0
  must_fix_resolved: 0
  low: 4
  info: 2

issues:
  - id: 1
    severity: LOW
    location: "plan.md:Task 1 Steps 5-6"
    title: "验证性步骤未明确标注仅验证不改写"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: LOW
    location: "plan.md:Dependency Graph & Wave Schedule"
    title: "计划重组了 spec 的建议批次顺序但未说明重组逻辑"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: LOW
    location: "plan.md:BG2 Subagent 配置 + Complexity 声明"
    title: "BG2 使用 high 模型与 plan 自声明 L1 复杂度不一致"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: INFO
    location: "plan.md:BG3"
    title: "BG3 单任务覆盖 5 个不同 Skill 文件，执行上下文负载较高"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 5
    severity: INFO
    location: "plan.md:M1-5 vs M3-4"
    title: "verification_method 字段跨 BG1/BG3 分布缺少交叉引用"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 6
    severity: LOW
    location: "plan.md:File Structure 表格（gate-check.py 行）"
    title: "File Structure 表格描述 gate-check.py 的 FR-8/FR-9 为 modify，但 M1-3/M1-4 结论为'验证即可，无需修改'"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 7
    severity: LOW
    location: "plan.md:BG2 Subagent 配置 - 注入上下文"
    title: "BG2 注入上下文缺少 index.ts 的 gate prepareReviewContext 函数和 compileReviewFollowUp 分支路径"
    status: open
    raised_in_round: 2
    resolved_in_round: null
---

# 计划评审 v2

## 评审记录
- 评审时间：2026-05-22 20:15
- 评审类型：计划评审
- 评审对象：`.xyz-harness/2026-05-22-/plan.md`

## 轮次上下文

第 2 轮评审。上一轮（v1）verdict: pass，0 条 MUST FIX，3 条 LOW，2 条 INFO。本轮进行独立复审，验证 v1 发现是否仍适用，并查找 v1 可能遗漏的问题。

> **说明：** 截至本轮，plan.md 未见修改。v1 的 5 个问题中有 5 个仍为 open 状态，新增 2 个本轮新发现。

---

## 1. Spec 完整性（复检）

### 目标是否明确
✅ **通过**。Spec 目标依然清晰：基于 4 个项目 46 份复盘扫描结果，对 harness 工程进行 16 项优化（P0+P1+P2）。

### 范围是否合理
✅ **通过**。16 项优化分为 5 个批次（B1-B5），P3 的 11 项明确排除。边界清晰。

### 验收标准是否可量化
✅ **通过**。14 个 AC 均可通过 grep、gate-check.py 运行、代码审查等方式验证。无模糊指标。

### 是否标记了 [待决议] 项
✅ **无**。所有 16 个 FR 均有明确的决策状态。

---

## 2. Plan 可行性（复检）

### 任务拆分是否合理
✅ **通过**。4 个 Task 按修改面拆分，粒度适中：
- **Task 1**（gate-check.py）：5 项修改内聚于同一文件（496 行 Python 脚本）
- **Task 2**（扩展代码）：index.ts（~700 行）+ review-dispatcher.ts（~140 行）密切关联
- **Task 3**（5 个 Phase Skill）：同类文档修改
- **Task 4**（3 个 Reference Skill）：同类方法论调整

### 依赖关系是否正确
✅ **通过**。依赖图正确：
- BG2 → BG1（review 前置检查依赖 frontmatter 扁平化）
- BG3/BG4 无外部依赖

### 工作量估算是否现实
✅ **通过**。~15 个文件（1 Python + 2 TS + 5 Phase Skill + 3 Reference Skill），代码 ~200 行，文档 ~500 行。符合 L1 复杂度。

### 是否有遗漏的 task
✅ **无遗漏**。逐条对照 spec 的 16 个 FR 和 14 个 AC：

| 维度 | 检查结果 |
|------|---------|
| 16 个 FR 全部有对应 Task | ✅ |
| 14 个 AC 全部能追溯 plan 步骤 | ✅ |
| Spec Metrics Traceability 表格完整 | ✅ |
| E2E Test Plan 覆盖 8 个 TC group | ✅ |

---

## 3. Spec 与 Plan 一致性（复检）

### Spec AC → Plan 覆盖矩阵

| AC | Plan 实现路径 | 状态 |
|----|--------------|------|
| AC-1 Frontmatter 兼容性 | M1-1（gate 解析）+ M2-2（源头模板注入） | ✅ |
| AC-2 评审不可跳过 | M2-1（index.ts 前置检查） | ✅ |
| AC-3 自检清单存在 | M3-1~5（5 个 Phase Skill 各增 checklist） | ✅ |
| AC-4 Gate 深度统一 | M1-2（PHASE_SPECS review 检查统一） | ✅ |
| AC-5 指标传递 | M3-2（Plan Skill Spec Metrics Traceability 章节） | ✅ |
| AC-6 验收标准 | M3-3（Dev Skill）+ M4-4（Subagent-dev） | ✅ |
| AC-7 验证方式标注 | M1-5（gate 解析 verification_method） | ✅ |
| AC-8 跨 topic 隔离 | M1-3（验证已有实现） | ✅ |
| AC-9 竞态修复 | M1-4（验证不存在 dirty check） | ✅ |
| AC-10 LOW 收紧 | M4-1（expert-reviewer） | ✅ |
| AC-11 增量审查 | M4-2（expert-reviewer） | ✅ |
| AC-12 Plan 禁止实现代码 | M3-2（Plan Skill checklist） | ✅ |
| AC-13 数据模型预检 | M3-1（Spec Skill）+ M3-2（Plan Skill） | ✅ |
| AC-14 Retrospect 流程 | M2-3（验证已有行为 + 文档记录） | ✅ |

### 代码库假设验证（本轮新增）

本轮对 plan 中引用的现有代码进行了 grep 验证：

| plan 假设 | 代码验证结果 |
|-----------|-------------|
| `_flatten_review_fields()` 已存在于 gate-check.py | ✅ 在第 124 行 |
| `ReviewCheck.nested` 字段存在 | ✅ 在第 165 行 |
| `parseReviewVerdict()` 在 index.ts 存在 | ✅ 在 ~第 115-161 行 |
| `buildReviewTaskPrompt()` 已有 frontmatter 模板 | ✅ 第 80 行：`"YAML frontmatter 必须包含（在顶层，不能嵌套）"` |
| `buildRetrospectFollowUp()` 只在 mustFix==0 时被调用 | ✅ 第 403-404 行的条件分支正确 |

所有假设已验证，支撑 plan 的可行性。

---

## 4. Execution Groups 合理性（复检）

### 基础检查

| Group | 文件数 | Task 数 | 类型 | 功能关联度 | 状态 |
|-------|--------|---------|------|-----------|------|
| BG1 | 1 (≤10) | 1 | Python | 高度内聚：同一文件 5 项修改 | ✅ |
| BG2 | 2 (≤10) | 1 | TypeScript | 高度关联：前置检查 + 调度优化 | ✅ |
| BG3 | 5 (≤10) | 1 | Markdown | 同类文档：5 个 Phase Skill 自检清单 | ✅ |
| BG4 | 3 (≤10) | 1 | Markdown | 同类文档：3 个 Reference Skill 方法论 | ✅ |

### 类型划分
✅ 正确。无混合类型 Group。

### Wave 编排
✅ 合理：
- Wave 1：BG1 + BG3 + BG4 可并行（无文件冲突、无数据竞争）
- Wave 2：BG2 仅依赖 BG1，不依赖 BG3/BG4

### Subagent 配置
✅ 每组配置完整（Agent、Model、注入上下文、读取文件、修改/创建文件）。

### 文件数预估
✅ 标注准确。

---

## 5. 发现的问题汇总

### v1 遗留问题（仍未修复）

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | LOW | plan.md Task 1 Steps 5-6 | M1-3（跨 topic 隔离验证）和 M1-4（dirty check 验证）结论是"验证即可，无需修改"，但 step 描述未标注为 verification-only。subagent 执行时可能浪费时间寻找不存在的修改。当前文件仍未加标注。 | 在每个 verification-only step 前加 `(verification only, no code change)` 前缀 |
| 2 | LOW | plan.md Wave Schedule | spec 建议实施顺序为 B1 → B2 → B5(并行) → B3 → B4，但 plan 将 B5 合并入 BG1，将 B3/B4 提前至 Wave 1 与 BG1 并行。这是合理优化，但 Wave Schedule 下方未见重组逻辑说明。 | 在 Wave Schedule 表格下方加一句说明重组理由 |
| 3 | LOW | plan.md Complexity 声明 + BG2 Model | plan 自声明 Complexity: L1（所有维度均为简单），但 BG2 的 model 选择 taskComplexity=high。L1 项目通常不需要 high 模型处理 2 个 TS 文件（~80 行实际修改）。 | 统一声明：BG2 用 medium，或在 Complexity 中解释 BG2 的特殊性 |

### v1 遗留观察项

| # | 优先级 | 文件/位置 | 描述 |
|---|--------|----------|------|
| 4 | INFO | plan.md BG3 | BG3 单任务处理 5 个不同 Skill 文件。subagent prompt 需严格区分"哪段内容注入哪个文件"（5 种不同的 checklist 内容）。建议在 Subagent 配置的"注入上下文"中显式列出每个文件的 checklist 项对应关系。 |
| 5 | INFO | plan.md M1-5 vs M3-4 | `verification_method` 字段的 gate 解析（gate-check.py M1-5）与 schema 文档说明（Test Skill M3-4）分属 BG1 和 BG3，两组并行执行。如果 BG3 subagent 不知道 BG1 已经改了解析，schema 文档可能与 gate 实现不一致。 |

### 本轮新增问题

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 6 | LOW | plan.md File Structure 表格（gate-check.py 行） | Description 列列出 "FR-1, FR-4, FR-7, FR-8, FR-9"，但 M1-3（FR-8 跨 topic 隔离）和 M1-4（FR-9 竞态修复）的结论均为"验证即可，无需修改"。Description 列过度声明了实际修改范围。 | 将 Description 改为 "Gate 验证脚本（FR-1, FR-4, FR-7）；FR-8, FR-9 为验证性不修改"，或在 Task 描述中明确标注哪些 FR 有实际代码变更 |
| 7 | LOW | plan.md BG2 Subagent 配置 - 注入上下文 | 注入上下文列出 "index.ts gate execute 函数 + review-dispatcher.ts 完整代码"，但 index.ts 的 gate execute 函数中包含 `prepareReviewContext()` 和 `compileReviewFollowUp()` 两个辅助函数，分别负责 review 上下文准备和 followUp 编译。subagent 如果不提前了解这两个函数的存在和调用依赖，容易遗漏 review 上下文构建路径。 | 在注入上下文中明确提及 `prepareReviewContext()` 和 `compileReviewFollowUp()` 的调用位置和职责 |

---

### 等级判定校准检查

依据校准规则，逐条检查是否有被误降级的问题：

| 校准规则 | 检查结果 |
|----------|---------|
| 1. 数据丢失 | ✅ 无。所有数据路径在 plan 中有明确说明 |
| 2. 功能失效 | ✅ 无。未有代码因注册/调用/时序问题无法执行 |
| 3. 数据语义错误 | ✅ 无 |
| 4. 重复副作用 | ✅ 无 |
| 5. 时序错误 | ✅ 无。Wave 编排正确，BG2 依赖 BG1 |

**判定结论：所有问题评级正确，无 MUST FIX 被降级为 LOW/INFO 的情况。**

---

## 6. 综合结论

**verdict: pass**（0 条 MUST FIX，4 条 LOW，2 条 INFO）

plan.md 结构完整、任务拆分合理、spec-plan 一致性高、执行组编排正确、代码库假设均已验证。16 个 FR 和 14 个 AC 全部有对应实现路径。

v1 的 5 个问题仍有 5 个未修复（plan 未变更），本轮新增 2 条 LOW（File Structure 表格描述准确性、BG2 注入上下文完整性）。均为不影响 plan 可行性的建议性改进。

### 修复优先级建议

| 优先级 | 问题 ID | 说明 |
|--------|---------|------|
| 修复 | #1, #6 | subagent 执行效率影响（验证性步骤标注 + File Structure 表格准确度） |
| 视情况 | #2, #7 | 文档完整性（重组逻辑说明 + 注入上下文补充） |
| 考虑 | #3 | 模型选型统一（L1 vs high 不一致） |
| 记录 | #4, #5 | 观察项，无需操作 |

---

## Summary

计划评审完成，第2轮，0条MUST FIX，4条LOW建议，2条INFO观察，verdict: pass。
