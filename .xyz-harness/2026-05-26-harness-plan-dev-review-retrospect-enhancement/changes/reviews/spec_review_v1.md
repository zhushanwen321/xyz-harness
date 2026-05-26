---
review:
  type: spec_review
  round: 1
  timestamp: "2026-05-26T08:30:00"
  target: ".xyz-harness/2026-05-26-harness-plan-dev-review-retrospect-enhancement/spec.md"
  verdict: fail
  summary: "计划评审完成，第1轮，4条MUST FIX，需修改后重审"

statistics:
  total_issues: 6
  must_fix: 4
  must_fix_resolved: 0
  low: 1
  info: 1

issues:
  - id: 1
    severity: MUST_FIX
    location: "spec.md:AC-12"
    title: "AC-12 无对应 FR 实现，是孤立验收标准"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 2
    severity: MUST_FIX
    location: "spec.md:AC-11"
    title: "AC-11 引用不存在的 ADR-0006 作为向后兼容机制"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 3
    severity: MUST_FIX
    location: "spec.md:AC-5 / FR-5"
    title: "Standards Reviewer 缺少无 lint 配置项目的处理规则"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 4
    severity: MUST_FIX
    location: "spec.md:FR-10 / AC-10"
    title: "Python 项目在 taste_review 步骤无 Skill 可用，且未定义 fallback"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 5
    severity: LOW
    location: "spec.md:AC-7"
    title: "harness_issues 的'不含模糊描述'要求不可量化验证"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 6
    severity: INFO
    location: "spec.md:Non-functional Considerations"
    title: "Subagent 并发调度约束已明确说明，建议在 FR-10 编排图中标注 semaphore 限制"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 计划评审 v1

## 评审记录
- 评审时间：2026-05-26 08:30
- 评审类型：计划评审（spec 完整性检查）
- 评审对象：`.xyz-harness/2026-05-26-harness-plan-dev-review-retrospect-enhancement/spec.md`

## 概述

本 spec 描述的是 xyz-harness V5 引擎自身的增强改造，涉及：
- Phase 2 新增 use-cases.md + non-functional-design.md
- 4 个新建 Reviewer Skill（Business Logic / Integration / Standards / Robustness）
- Phase 3 审查从单步 code_review 拆分为 5 步专项审查
- Retrospect YAML 元数据增强 + Collector 脚本
- Phase 1 spec 新增业务用例章节
- Gate-check.py 同步更新

整体结构清晰，FR 与 AC 之间有较高的覆盖度，范围边界明确（列出明确不包含的内容）。以下按检查维度逐项分析。

---

## 1. Spec 完整性

### 1.1 目标明确性 ✅

目标可在一段话内概括：将 Plan/Dev/Review/Retrospect 四个 phase 的业务用例描述、多维度审查和复盘吸收追踪三块联动改造。背景中三个结构性缺陷的阐述清晰，能帮助读者理解为什么需要这个增强。

### 1.2 范围合理性 ✅

FR 列表覆盖适当，范围约束中明确排除了 5 项 P2 内容（py-taste-check、gate-check.py 配置外部化、Phase 5 CI 结构化、coding-workflow index.ts 改动、review 文件子目录分组）。L2 复杂度评估合理——跨多个 skill 联动改造确实需要较高复杂度。

### 1.3 FR 依赖关系 ⚠️

FR 之间的上下游关系在 spec 中多处提及（FR-3 的上游输入、FR-4 依赖 FR-3 产出、FR-10 依赖 FR-3/4/5/6 的产出），但缺少一张**统一的 FR 依赖关系图或表格**。当前散布在各 FR 描述中，需读者自行拼接。建议增加一个 FR 依赖关系表格。

### 1.4 验收标准可量化性 ⚠️

多数 AC 可量化（文件存在性检查、YAML 字段检查、命令行输出格式），但以下问题影响量化：

- **AC-12**（见 MUST FIX #1）：无对应 FR，且"记录每个审查步骤的价值评估"中的"耗时"如何收集未定义
- **AC-7**（见 LOW #5）："不含模糊描述"是主观判断
- **AC-11**（见 MUST FIX #2）：引用不存在的文档

### 1.5 [待决议] 项审查 ✅

未发现显式标记的 [待决议] 项。

---

## 2. Plan 可行性参考（仅基于 spec 推导，无 plan.md）

无 plan.md 提供，本部分仅对 spec 中隐含的可行性做初步判断：

- **任务规模合理**：11 个 FR 分布在 5 个原有 skill 的修改 + 4 个新建 skill + 1 个新建 skill（collector）+ gate-check.py 修改，总量可管理
- **依赖链清晰**：FR-9 → FR-1 → FR-3 → FR-4 → FR-10 的主链清晰；FR-7 → FR-8 的 retrospect 链路独立；FR-11 是收尾集成
- **Subagent 并发合理**：Batch 1 的 4 并行 subagent 在 semaphore 限制（最多 5）内，符合项目约束
- **风险**：Python Python 项目的 taste_review 无实现（见 MUST FIX #4），需要在 plan 中定义 fallback

---

## 发现的问题

### MUST FIX

#### #1 — AC-12 无对应 FR 实现，是孤立验收标准

- **位置**：`spec.md / Acceptance Criteria / AC-12`
- **描述**：AC-12 要求 Phase 3 的 `dev_retrospect` 记录每个审查步骤的价值评估（must_fix/LOW/INFO 数量、耗时），但没有任何一个 FR 定义这些指标的数据结构、存储位置或收集机制。FR-7（Retrospect YAML 元数据增强）只定义了 `absorbed`/`topic`/`harness_issues` 字段，未包含每步审查的统计指标。AC-12 是一个**没有实现锚点的孤立验收标准**，开发阶段将被遗漏。
- **影响**：开发完成后 AC-12 无法通过验收，dev_retrospect 缺少该数据。如果门禁检查此 AC，则 Phase 3 gate 将失败。
- **修改建议**：

  方案 A（推荐）：在 FR-7 中新增两个 YAML 字段：
  ```yaml
  step_reviews:
    business_logic_review: { must_fix: 0, low: 2, info: 1, duration_seconds: 120 }
    integration_review: { must_fix: 0, low: 0, info: 0, duration_seconds: 90 }
    ...
  ```
  并更新 retrospect skill 的输出模板。

  方案 B：保留 AC-12 但删除 FR-7 中的实现要求，改为在 retrospect skill 的编写指南中指导 AI 以自然语言段落记录，不作为结构化 YAML 字段。同时 AC 应调整为 "dev_retrospect 中必须包含审查价值评估段落"而非结构化数据。

  方案 C：如果认为该指标价值不高，直接删除 AC-12，不再要求。

#### #2 — AC-11 引用不存在的 ADR-0006

- **位置**：`spec.md / Acceptance Criteria / AC-11`，末行
- **描述**：AC-11 中写道"旧 topic 目录不受新规则影响（ADR-0006）"，引用 ADR-0006 作为向后兼容机制的说明。但项目 `docs/adr/` 下仅有 ADR-0001 和 ADR-0002，**ADR-0006 不存在**。当前审阅范围未包含 plan.md，因此无法判断 plan 中是否创建了此 ADR。如果 plan 中也不存在，则 AC-11 的向后兼容声明是无依据的。
- **影响**：Gate-check.py 改动后如何处理旧 topic 成为未定义行为。如果 gate 对新旧 topic 一视同仁，旧 topic 所有 Phase 2/3 gate 将因缺少 new deliverable 而永久失败。
- **修改建议**：

  方案 A：在 spec 中删除 ADR-0006 引用，改为在 spec 中直接描述向后兼容机制（如 FR-11 中补充："gate-check.py 检测 topic 创建时间，对某日期之前的 topic 跳过新 deliverable 检查"）。**同时必须**在 Constraints 或 FR-11 中明确这个机制的判断逻辑。

  方案 B（推荐）：保留 ADR-0006 引用，但将其改为 "ADR-0006（待创建）" 并补充一句概要："向后兼容机制：gate-check.py 通过检测 topic 目录创建日期或 phase spec 中的版本标记来决定是否应用新规则"。在 plan 阶段必须创建 ADR-0006。

#### #3 — Standards Reviewer 缺少无 lint 配置项目的处理规则

- **位置**：`spec.md / FR-5, AC-5`
- **描述**：AC-5 要求 `standards_review_v1.md` 的 YAML 强制包含 `linter_passed: true`（布尔值）。但对于一个没有配置 linter（或没有标准 lint 命令）的项目，此字段的值如何定义不明确。如果强行设为 `true` 但实际未运行 lint，则失去校验意义。如果设为 `false` 则 gate 永久失败，形成死锁。
- **影响**：当 harness 用于不含 linter 的项目（如纯 Python 脚本项目、或新项目尚未配置 ESLint 时），Standards Reviewer 步骤和 Phase 3 gate 将永远无法通过。
- **修改建议**：

  方案 A（推荐）：在 FR-5 中补充说明："若项目无配置的 linter，`linter_passed` 须设置为 `true`（表示 no-op 通过），且 `linter_configured: false` 字段在 YAML 中标记。Gate-check.py 仅当 `linter_configured` 为 `true` 时才校验 `linter_passed` 值。" 或者直接合并为：
  ```yaml
  linter: { configured: false, passed: true }
  ```

  方案 B：将 `linter_passed` 改为可选字段（required: false），当无 linter 时省略此字段，gate-check.py 只在字段存在时检查。

#### #4 — Python 项目在 taste_review 步骤无 Skill 可用，且未定义 fallback

- **位置**：`spec.md / FR-10, AC-10, Constraints`
- **描述**：FR-10 将 taste_review 列为 Phase 3 审查 5 步中的强制步骤，依赖 `ts-taste-check` / `rust-taste-check` skill。但范围约束明确排除了 `py-taste-check` 新建（P2）。FR-10 中注释"Python 项目暂无品味检查 skill（P2 待建）"，但未定义 Python 项目在 Phase 3 审查时 taste_review 的处理方式。
- **影响**：当 harness 运行在 Python 项目上时，taste_review 步骤无 skill 可 dispatch，导致 Phase 3 审查无法完成。如果跳过该步骤，AC-10（要求 5 步全部产出独立 review 文件）无法满足。
- **修改建议**：

  方案 A（推荐）：在 FR-10 中明确 Python 项目的 taste_review fallback——"Python 项目跳过 taste_review 步骤（在 gate-check.py 中标记为 PASS_WITH_SKIP），不产出 taste_review 文件。Phase 3 gate 检查时对此步骤做透明跳过处理。"

  方案 B：用一个通用代码审查 subagent 替代，不使用品��检查 skill，产出 `taste_review_v1.md` 但标注 "analyzed with general-purpose reviewer"。

### LOW

#### #5 — AC-7 中"不含模糊描述"的要求不可量化验证

- **位置**：`spec.md / AC-7`，末行
- **描述**：AC-7 要求 `harness_issues` 数组中"每项是一句具体的改进建议（不含模糊描述）"。但"模糊"是主观判断，无法通过脚本或自动化验证。门禁系统无法判定某条 issue 是否"模糊"。
- **修改建议**：将"不含模糊描述"从 AC 中移除（AC 应承载可测试的验证条件），移到 `non-functional-design.md` 或 skill 编写指南中作为最佳实践。或者改为格式要求："每条 issue 包含动词+名词结构，至少指明一个可操作的文件或组件"。

### INFO

#### #6 — Subagent 并发约束已在文中说明，建议在 FR-10 编排图中标注

- **位置**：`spec.md / Non-functional Considerations`，第二段
- **描述**：Non-functional Considerations 中已经说明了 semaphore 限制（最多 5 并发），Batch 1 的 4 并行在限制内。但 FR-10 的审查编排图中没有直接标注此限制，读者需要对照 Non-functional Considerations 才能理解 Batch 1 为什么是 4 并行而非更多。
- **修改建议**：在 FR-10 的 Batch 1/2 编排图下方添加一条脚注："NOTE：4 并行受 subagent semaphore 限制（最大 5 并发），Batch 1 占 4 个，为 future Batch 2 的 integration_review 预留空间。"——让 FR 本身自包含此信息，减少跨章节跳转。

---

## 检查维度评分

| 维度 | 状态 | 说明 |
|------|------|------|
| 目标明确性 | ✅ | 一段话可概括，三个缺陷阐述清晰 |
| 范围合理性 | ✅ | 边界明确，排除了 5 项 P2 |
| AC 可量化性 | ⚠️ | 4 条 MUST FIX 影响量化 |
| FR 依赖关系清晰度 | ⚠️ | FR 间关系散布在各处，缺少依赖图 |
| 是否有 [待决议] | ✅ | 无显式标记的待决议项 |
| 向后兼容考虑 | ❌ | ADR-0006 不存在 |

---

## 结论

**需修改后重审。**

Spec 整体结构良好，FR 和 AC 覆盖度高（11 FR / 12 AC），范围边界明确，约束项清晰。但存在 4 条 MUST FIX：
1. AC-12 是孤立验收标准（无 FR 实现）
2. AC-11 引用不存在的 ADR-0006
3. Standards Reviewer 缺少无 lint 配置的处理规则
4. Python 项目的 taste_review 无 fallback

修复以上 4 条后，spec 质量可通过审查进入 plan 阶段。

### Summary

计划评审完成，第1轮，4条MUST FIX，需修改后重审。
