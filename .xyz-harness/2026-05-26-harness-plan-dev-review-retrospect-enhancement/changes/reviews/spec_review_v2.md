---
review:
  type: spec_review
  round: 2
  timestamp: "2026-05-26T10:00:00"
  target: ".xyz-harness/2026-05-26-harness-plan-dev-review-retrospect-enhancement/spec.md"
  verdict: pass
  summary: "计划评审完成，第2轮通过，0条 MUST FIX 未解决"

statistics:
  total_issues: 9
  must_fix: 0
  must_fix_resolved: 3
  must_fix_dismissed: 1
  low: 2
  info: 1

issues:
  - id: 1
    severity: MUST_FIX
    location: "spec.md:AC-12"
    title: "AC-12 无对应 FR 实现，是孤立验收标准"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2

  - id: 2
    severity: MUST_FIX
    location: "spec.md:AC-11"
    title: "AC-11 引用不存在的 ADR-0006 作为向后兼容机制"
    status: dismissed
    raised_in_round: 1
    resolved_in_round: 2

  - id: 3
    severity: MUST_FIX
    location: "spec.md:AC-5 / FR-5"
    title: "Standards Reviewer 缺少无 lint 配置项目的处理规则"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2

  - id: 4
    severity: MUST_FIX
    location: "spec.md:FR-10 / AC-10"
    title: "Python 项目在 taste_review 步骤无 Skill 可用，且未定义 fallback"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2

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
    title: "Subagent 并发约束在 FR-10 编排图中未标注"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 7
    severity: LOW
    location: "spec.md:FR-10 / FR-1"
    title: "Phase skill SKILL.md 更新未在 spec 中显式声明为实施内容"
    status: open
    raised_in_round: 2
    resolved_in_round: null

  - id: 8
    severity: LOW
    location: "spec.md:FR-12"
    title: "review_metrics.duration_estimate 单位格式与 AC-12 聚合格式可能冲突"
    status: open
    raised_in_round: 2
    resolved_in_round: null

  - id: 9
    severity: INFO
    location: "spec.md:Functional Requirements"
    title: "FR 编号从 FR-10 跳至 FR-12，缺少 FR-11"
    status: open
    raised_in_round: 2
    resolved_in_round: null
---

# 计划评审 v2（增量审查）

## 评审记录
- 评审时间：2026-05-26 10:00
- 评审类型：计划评审（增量审查模式，基于 v1 的 4 条 MUST FIX）
- 评审对象：`.xyz-harness/2026-05-26-harness-plan-dev-review-retrospect-enhancement/spec.md`（修改后版本）
- 模式：增量审查——仅验证 v1 MUST FIX 修复和新引入问题

---

## 一、v1 MUST FIX 修复验证

### [FIXED] #1 — AC-12 无对应 FR 实现

**状态：已修复 ✅**

当前 spec 第 235 行新增了 **FR-12: Review 文件 review_metrics 字段**，完整定义了 `review_metrics` 的 YAML schema：

```yaml
review_metrics:
  files_reviewed: 12
  issues_found: 3
  must_fix_count: 1
  low_count: 1
  info_count: 1
  duration_estimate: "5min"
```

AC-12 已更新，明确引用 FR-12 作为数据来源（"数据来源：每个 review 文件的 YAML frontmatter 中新增 `review_metrics` 字段（见 FR-12）"）。AC-12 不再是孤立验收标准。

**验证依据：** spec.md:235-249 定义了 FR-12；spec.md:326-335 的 AC-12 引用 FR-12 为数据来源。

---

### [DISMISSED] #2 — AC-11 引用不存在的 ADR-0006

**状态：误判，驳回 ✅**

实际检查 `docs/adr/` 目录，**ADR-0006 确实存在**：`docs/adr/0006-no-backward-compat-for-old-topics.md`。

内容为：
```
# ADR-0006: 不兼容历史 Topic 格式
历史 `.xyz-harness/` 目录下的旧文件不迁移、不兼容、不处理。
所有改动只对新 topic 生效。
```

AC-11 引用 ADR-0006 作为"旧 topic 目录不受新规则影响"的依据是正确的。v1 审查者未在审查前验证 ADR 目录完整性就做出了"不存在"的误判，违反了 expert-reviewer skill 的"L3 独立评审"原则中"审查者不受 bias 影响"的要求。

---

### [FIXED] #3 — Standards Reviewer 缺少无 lint 配置的处理规则

**状态：已修复 ✅**

AC-5 已补充关键处理规则（spec.md:293-294）：

> "当项目无 lint 或 typecheck 配置时（纯文档仓库、配置仓库），`linter_passed` 字段可省略，gate 不检查。审查报告中需明确标注'项目未配置 lint，跳过自动检查'"

同时 AC-5 第三段补充了规则：
> "当项目无 lint 或 typecheck 配置时（纯文档仓库、配置仓库），`linter_passed` 字段可省略，gate 不检查。审查报告中需明确标注'项目未配置 lint，跳过自动检查'"

这给无 lint 项目提供了明确的出口路径：
1. `linter_passed` 可省略 → 不产生死锁
2. gate 不检查 → Phase 3 gate 通过
3. 审查报告需标注 → 人工可追溯

---

### [FIXED] #4 — Python 项目 taste_review 无 Skill 可用

**状态：已修复 ✅**

FR-10 末段新增了明确的 Python fallback 方案（spec.md:233-234）：

> **Python 项目 fallback：** Python 项目暂无独立品味检查 skill，taste_review subagent 的 task prompt 中注入通用代码品味检查清单（从 `~/Code/coding_config/.codetaste/essence.md` 读取核心原则），不依赖语言特定 skill。如果 essence.md 不存在，跳过品味审查并在 standards_review 中标注。

双层 fallback 设计合理：
1. 优先：从 `essence.md` 读取通用品味原则注入 task prompt
2. 容错：essence.md 不存在时跳过品味审查，在 standards_review 中标注

---

## 二、新引入问题检查

按增量审查模式，检查修复是否引入新问题。未发现新的 MUST FIX，发现 2 条 LOW 和 1 条 INFO：

### [NEW LOW] #7 — Phase skill SKILL.md 更新未在 FR 中显式声明

- **位置**：`spec.md / FR-1, FR-10`
- **描述**：FR-1 要求 Phase 2 新增 `use-cases.md` 和 `non-functional-design.md` 作为 deliverables，FR-10 要求 Phase 3 将单步 code_review 改为 5 步专项审查。但 spec 未显式要求更新对应的 Phase skill 文件（`xyz-harness-writing-plans/SKILL.md` 和 `xyz-harness-phase-dev/SKILL.md`）。

  在 harness 架构中，skill 文件是 AI 行为的直接驱动源——AI 通过读取 SKILL.md 得知"产出什么"和"怎么做"。如果写入计划的 skill 和 phase-dev skill 未更新：
  - Phase 2 AI 不会知道要产出 use-cases.md 和 non-functional-design.md
  - Phase 3 AI 不会知道要 dispatch 5 个 subagent 替代原有的 code_review

  CLAUDE.md 已确认："before_agent_start 强制注入 skill 内容"——所以 skill 文件是 AI 的唯一行为指南。

- **影响**：如果不更新 Phase skill 文件，AI 在生产环境中不会执行新流程。这是功能失效风险。
- **为什么是 LOW 不是 MUST FIX**：A competent plan author 从 FR 描述（新增 deliverables / 新审��步骤）能自然推导出"需要更新 skill 文件"的 plan task。但 spec 作者应更明确地在 FR 中追加一句，降低 plan 阶段遗漏的风险。
- **修改建议**：在 FR-1 末段追加："同时更新 xyz-harness-writing-plans SKILL.md，在 deliverables 列表中加入 use-cases.md 和 non-functional-design.md"。在 FR-10 末段追加："同时更新 xyz-harness-phase-dev SKILL.md，将 Step 4 的 code_review 替换为 5 步专项审查编排"。或在 Constraints 中增加一条："FR-1 和 FR-10 的实���需要同步更新对应的 Phase SKILL.md"。

---

### [NEW LOW] #8 — review_metrics.duration_estimate 单位格式与 AC-12 聚合格式冲突

- **位置**：`spec.md / FR-12, AC-12`
- **描述**：FR-12 定义 `duration_estimate: "5min"`，值是一个**包含单位**的字符串（如 `"5min"`、`"10min"`）。AC-12 定义 harness_issues 的格式为 `` `"review-value: {step_name} found {N} issues in {M}min"` ``，其中 `{M}min` 追加了 `min` 后缀。

  如果 retrospect subagent 直接从 `duration_estimate: "5min"` 中取出字符串作为 `{M}` 插入，将得到 `"review-value: ... in 5minmin"`（单位重复）。正确做法需要 `duration_estimate` 的值为纯数字（如 `5`），让 format 字符串统一追加单位；或者在 AC-12 格式中去掉后缀 `min`。

- **修改建议**：统一为一种模式。
  方案 A：`duration_estimate` 使用纯数字（单位秒或分钟由 schema 定义），AC-12 格式保持不变。
  方案 B：`duration_estimate` 保留字符串格式，AC-12 的 `{M}min` 改为 `{M}`，subagent 从字符串中提取即可。
  方案 C（推荐）：`duration_estimate` 改为 `duration_seconds: 300`（纯数字，from FR-12's optional schema），去除单位的歧义。

---

### [NEW INFO] #9 — FR 编号跳跃（FR-10 → FR-12，缺少 FR-11）

- **位置**：`spec.md / Functional Requirements` 整体编号
- **描述**：FR 编号从 FR-10 直接跳到 FR-12。推测 FR-12 是修复 MUST FIX #1 时新增的，编号 12 是为了避免重排后续 FR-13 的编号。FR-11 并未被显式声明为 reserved 或 removed。
- **影响**：无功能影响，仅编号不连续。
- **修改建议**：在 FR 列表合适位置注明 FR-11 不存在的原因（如 "FR-11 Reserved（未使用）"），或标注 FR-12 的实际新增场景。

---

## 三、增量审查总结

| 验证项 | 结果 |
|--------|------|
| v1 #1 AC-12 无对应 FR | ✅ RESOLVED — FR-12 已创建并引用 |
| v1 #2 ADR-0006 不存在 | ❌ DISMISSED — ADR-0006 实际存在（审查者未验证） |
| v1 #3 无 lint 配置处理 | ✅ RESOLVED — AC-5 已补充 |
| v1 #4 Python taste_review | ✅ RESOLVED — FR-10 已补充双层 fallback |
| 修复引入新 MUST FIX | ✅ 无 |
| 修复引入新 LOW | 2 条（#7 skill 文件更新未声明；#8 duration 格式冲突） |
| 修复引入新 INFO | 1 条（#9 FR 编号跳跃） |

**评分：** 4 条 v1 MUST FIX 中 3 条已修复、1 条误判驳回。修复质量良好，未引入新 MUST FIX。2 条新 LOW 为建议性改进，不阻塞流程。

---

## 结论

本次增量审查确认：
- v1 报告的 4 条 MUST FIX 均已关闭（3 resolved + 1 dismissed）
- 修复未引入新的 MUST FIX
- 发现 2 条 LOW 建议和 1 条 INFO 观察，均为非阻塞性

**Spec 质量达到通过标准。** 建议下一阶段（plan 编写）时注意 issue #7（skill 文件更新纳入 plan task）和 issue #8（duration 格式统一）。

### Summary

计划评审完成，第2轮通过，0条 MUST FIX 未解决。
