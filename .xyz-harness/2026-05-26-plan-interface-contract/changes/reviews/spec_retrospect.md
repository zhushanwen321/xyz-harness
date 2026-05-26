---
phase: spec
verdict: pass
---

# Spec Phase Retrospect — plan-interface-contract

## 1. Phase Execution Review

### Summary

Phase 1 的目标是审查"plan 阶段接口契约增强"方案是否需要额外澄清的 spec。经过 8 轮逐步澄清问答，产出了完整的 spec.md，涵盖 8 个 FR、8 个 AC、5 条约束、6 条已做决策。

关键决策：
- L1/L2 复杂度分级（L2 强制完整契约，L1 简化版）
- `interface_chain.json` 作为独立结构化交付物（方法签名表为主体，数据流为附属）
- plan.md 保留人读 markdown 表格 + JSON 机读双表示
- GL1 只做 JSON schema 校验，GL2 做 cross-reference（保持 gate 脚本简单）

### Problems Encountered

1. **Review subagent 产出的 YAML frontmatter 嵌套层级错误**：spec_review_v2.md 的 verdict/must_fix 字段嵌套在 `review` 和 `statistics` 对象内，gate-check.py 期望顶层字段。手动修复了 frontmatter 格式。这是 subagent 对输出格式理解偏差的典型案例——skill 要求顶层字段，但 subagent 按自己的"合理"理解做了嵌套。

2. **L1 路径下 TDD subagent 消费方式遗漏**：Review 准确发现 FR-6 只描述了 L2 路径（从 JSON 提取），L1 路径断路。这验证了独立 review 的价值——设计者容易忽略自己分叉路径中的死胡同。

3. **FR-7 与 Constraints 自相矛盾**：要求标注 data_flow 引用但约束禁止改 test_cases_template.json。Review 第 1 轮 catch 住了这个矛盾。

### What Would You Do Differently

- **Q&A 过程可以更紧凑**：8 个问题中有 2-3 个可以在一个问题中合并（如粒度边界 + 数据模型字段），减少用户等待轮次。
- **先写 FR 再问细节**：当前是先问完所有问题再一次性写 spec。如果先写 FR 初稿，再针对性地问澄清问题，可能效率更高。

### Key Risks for Later Phases

- **Phase 2 (plan) 的工作量可能比预估大**：writing-plans skill 需要新增 Interface Contracts 整个章节 + JSON schema 定义 + AC 覆盖矩阵，加上 gate-check.py 的 Python 改动和 4 个 skill 文档更新，Task 拆分需要注意不要让单个 Task 过大。
- **plan.md 和 interface_chain.json 的漂移风险**：双表示意味着维护两份数据。plan review subagent 的 cross-reference 检查能否有效 catch 漂移，需要 Phase 3 验证。

## 2. Harness Usability Review

### Flow Friction

- **brainstorming skill 的提问节奏偏慢**：one-at-a-time 原则在这个场景下导致 8 轮往返。对于"方案审查"类需求（用户已有明确方向，只需要确认设计细节），可以考虑批量提问模式。

### Gate Quality

- **Gate 正确发现了 review 文件格式问题**：frontmatter 嵌套导致 gate FAIL，这是 gate 的本职工作，表现正确。
- **Review subagent 准确发现了 2 个 MUST_FIX**：L1 路径断路和 FR-7 矛盾，都是真实的设计缺陷，不是误报。

### Prompt Clarity

- **brainstorming skill 适用于新功能设计，但对"方案审查/优化"类需求的适配不够**：skill 的 Step 2 提问层级（Purpose → Core Behavior → Boundaries）是为从零开始设计的场景设计的。当用户带着一个成熟方案来做审查时，这些层级有些多余。
- **Review subagent 的输出格式约束不够明确**：skill 中只说 "YAML frontmatter 必须包含 verdict 和 must_fix"，没有说这些字段必须在顶层。subagent 自行决定嵌套结构导致格式问题。

### Automation Gaps

- **Review frontmatter 格式校验可以自动化**：如果 gate-check.py 在检查 review 文件时不仅检查字段值，还检查字段是否在顶层（而非嵌套），可以避免手动修复。

### Time Sinks

- **8 轮 Q&A + 2 轮 review** 整体投入较高（约 12 个交互轮次）。但对于一个涉及 6 个文件修改、8 个设计决策的横切需求，这个投入是合理的。
