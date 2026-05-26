---
phase: spec
verdict: pass
absorbed: false
topic: "2026-05-26-harness-plan-dev-review-retrospect-enhancement"
harness_issues:
  - "expert-reviewer skill 缺少'先验证外部引用再下结论'的准则，导致 v1 审查者误判 ADR-0006 不存在"
  - "brainstorming skill 对'用户已提供充分上下文时能否跳过提问流程'缺少指导，主 agent 需要自行判断"
  - "FR 编号管理无规范——中间插入 FR 时编号跳跃（FR-10 → FR-12），无预留机制"
  - "spec 与 Phase skill 文件的联动是盲区——spec 声明新 deliverable 但未要求更新 skill，plan 阶段可能遗漏"
---

# Spec Phase Retrospect

## 1. Phase Execution Review

### Summary

Phase 1 从用户已有的深入讨论出发，直接进入 spec 编写，跳过了常规的渐进式提问流程。产出了 13 个 FR、12 个 AC 的 spec，覆盖 Plan 阶段交付物增强（FR-1/2/9）、Dev 阶段审查拆分（FR-3/4/5/6/10/12）、Retrospect 吸收追踪（FR-7/8）、Gate 更新（FR-13）。两轮审查迭代（4 MUST FIX → 3 resolved + 1 dismissed）。

### Problems Encountered

**1. spec_review v1 审查者误判 ADR-0006 不存在（最大时间浪费）**

审查者在未检查 `docs/adr/` 目录的情况下，声称 ADR-0006 不存在并标记为 MUST FIX。v2 审查者验证后驳回此条。根因：expert-reviewer skill 的检查维度中有"架构约束"和"设计文档引用"，但没有明确的"验证外部引用的真实性再下结论"准则。审查者凭记忆/假设做了判断。

**2. AC-12 初始为孤立验收标准**

spec 首稿中 AC-12 要求 dev_retrospect 记录审查价值评估，但没有对应 FR 定义数据结构和收集机制。这导致 v1 审查者标记为 MUST FIX。修复方式是新增 FR-12（review_metrics 字段）。根因：写 spec 时先写了 AC 再补 FR，AC 没有和 FR 同步校对。

**3. 无 lint 项目 / Python 项目的边界条件遗漏**

首稿中 Standards Reviewer 强制要求 `linter_passed: true`，taste_review 依赖 ts/rust-taste-check skill。两个边界条件（无 lint 配置、Python 项目）都未处理。这些是 spec 编写时的"只考虑典型场景"倾向导致的。

### What Would You Do Differently

1. **FR 和 AC 同步校对**：每写完一个 FR，立即写对应的 AC，然后验证 AC 的每个断言都能在某个 FR 中找到实现锚点。避免"先 AC 后 FR"导致孤立 AC。
2. **边界条件 checklist**：spec 写完后，对每个 FR 过一遍"如果项目是 X 类型（无 lint / Python / 纯文档仓库 / 巨型 monorepo），这个 FR 是否还能工作？"
3. **外部引用验证**：spec 中引用的 ADR、文档、skill 路径，在 self-check 阶段用 bash 验证存在性。

### Key Risks for Later Phases

1. **Plan 阶段必须包含 skill 文件更新 task**：v2 审查者标记为 LOW #7——FR-1 和 FR-10 要求新增 deliverables 和审查步骤，但没有显式要求更新 Phase skill 文件（writing-plans SKILL.md 和 phase-dev SKILL.md）。Plan 阶段如果不把 skill 文件更新纳入 task list，生产环境中 AI 不会执行新流程。
2. **review_metrics 的 duration 格式**：LOW #8 指出 `duration_estimate` 字符串格式（"5min"）与 AC-12 聚合格式中的 `{M}min` 可能冲突。Plan/Dev 阶段需要统一为一种格式。

## 2. Harness Usability Review

### Flow Friction

**跳过提问流程的决策点不清晰。** brainstorming skill 要求渐进式提问（Layer 1 → 2 → 3），但本次用户在之前的讨论中已经充分明确了需求和设计方向。主 agent 判断"不需要再逐步提问"后直接写 spec。这个判断是正确的，但 skill 中没有为此提供明确的退出条件。建议在 brainstorming skill 中增加"快速通道"条件：当用户已提供完整的六要素信息且无歧义时，可以跳过 Step 2-3 直接进入 Step 4。

### Gate Quality

**Gate check 本身运行顺利（一次性 PASS），但 review 质量有问题。** spec_review v1 的 ADR-0006 误判浪费了一轮审查。Gate 层面的自动化检查（YAML 格式、字段存在性）是可靠的，但 AI 审查的可靠性取决于 skill 中的准则是否足够防止误判。

### Prompt Clarity

brainstorming skill 的六要素+AC 模板足够清晰。expert-reviewer skill 的检查维度清晰但缺少"验证外部引用"准则。新 skill（business-logic-reviewer、integration-reviewer 等）的 prompt 设计需要在 Plan 阶段仔细处理。

### Automation Gaps

1. **FR-AC 一致性检查没有自动化**：AC-12 初始为孤立 AC（无对应 FR），如果能用脚本扫描"AC 中引用的 FR 编号是否都存在"，可以在 self-check 阶段就发现。
2. **外部引用验证没有自动化**：spec 中引用的 ADR 编号、skill 路径，目前只能靠人工或 AI 审查者验证。可以增加一个简单的 self-check 命令（grep spec 中的 ADR 编号，验证文件存在）。

### Time Sinks

1. **v1 审查的 ADR-0006 误判**：导致一轮完整的修复+重审循环，消耗约 2 轮 subagent dispatch。如果 v1 审查者先验证再下结论，可以省掉这一轮。
2. **FR 编号管理**：修复 MUST FIX 时新增 FR-12 导致编号跳跃，v2 审查者标记为 INFO。不影响功能但需要后续清理。
