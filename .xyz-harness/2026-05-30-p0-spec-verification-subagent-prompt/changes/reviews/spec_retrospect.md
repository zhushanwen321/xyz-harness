---
phase: spec
verdict: pass
---

# Phase 1 (Spec) Retrospect — p0-spec-verification-subagent-prompt

## 1. Phase Execution Review

### Summary

为两条 P0 改进（Spec 代码验证 + Subagent task prompt 标准化）编写了 spec。整个 Phase 在一个会话中完成，从 brainstorming 到 spec 提交到 gate 通过共 ~12 轮对话。

关键决策：
- **不增加独立 Step**：Assumption Audit 嵌入 Step 5 作为子步骤，避免增加流程长度
- **增强而非重构**：Pre-Dispatch Checklist 嵌入 The Process 章节，Prohibition Block 作为固定模板
- **L1 复杂度**：确认只改 2 个 SKILL.md 文件，不改 gate-check.py 和 coding-workflow 扩展

### Problems Encountered

1. **Brainstorming 前置分析消耗大量上下文**：在初始化 workflow 之前，已完成 15+ 个 topic 的复盘分析（3 个并行 subagent 读取 ~80 个文件），产出 ~8KB 分析文档。这些上下文在 workflow 初始化后仍然存在，占据了大量 token 预算。实际 spec 编写阶段只用了总上下文的一小部分。

2. **Spec review YAML 格式嵌套**：Review subagent 产出的 YAML frontmatter 使用了 `review:` 嵌套结构（`review.verdict` 而非顶层 `verdict`）。幸好 gate 脚本的 `_flatten_review_fields` 函数已经处理了这种嵌套，否则会 gate FAIL。

3. **Git staging 包含无关文件**：`git add -A` 暴露了 6 个无关修改（chrome-automation、merge-worktree 等），需要手动 reset 并选择性 add。这浪费了 1 轮操作。

### What Would You Do Differently

1. **Workflow 初始化前先 compact**：复盘分析消耗了 ~40K token 上下文，workflow 初始化后这些信息大部分不再需要。应该在 `coding-workflow-init` 之前执行 compact，用分析文档路径替代原始内容。

2. **Review subagent 的 YAML 格式指令更精确**：在 task prompt 中直接给出目标 YAML 格式（顶层 `verdict` + `must_fix`），而非依赖 gate 的容错解析。

3. **Git 操作用 `git add {具体路径}` 而非 `git add -A`**：避免混入无关改动。

### Key Risks

1. **L1 复杂度评估可能偏低**：虽然只改 2 个 markdown 文件，但 brainstorming skill 的 Step 流程嵌套关系复杂（Assumption Audit 插入位置需要与现有 Process Flow dot 图、Agent/Skill 关联表对齐）。Plan 阶段需要仔细规划插入点。

2. **Prohibition Block 的实际效果未验证**：6 条禁止事项是否能真正阻止 subagent 的 unsafe cast / placeholder 行为？需要在 Dev 阶段用实际 harness run 验证。

## 2. Harness Usability Review

### Flow Friction

- **Brainstorming 对"已有设计"的处理仍然缺失**：本次需求在 workflow 初始化前已完成分析（分析文档写入 docs/improvement/），但 brainstorming skill 没有显式的"从已有设计进入"模式。实际执行中跳过了 Step 2（提问）和 Step 3（方案探索），直接进入 Step 4（设计展示）。这是对 skill 的合理使用，但不是 skill 设计的预期路径。

- **Review subagent 派遣需要手动构造 task prompt**：spec review 的 task prompt 模板在 skill 文档中，但每次需要手动填写 topic_dir 路径和审查重点。可以模板化。

### Gate Quality

Gate 一次性通过，4 项检查全部正确：
- untracked files: PASS
- spec.md verdict: PASS
- spec_review verdict: PASS（嵌套 YAML 被正确解析）
- spec_review must_fix: 0

无 false positive。Gate 对 YAML 嵌套的容错（`_flatten_review_fields`）是一个好的防御性设计。

### Prompt Clarity

Skill 各步骤的指导清晰。特别好的：
- Checklist 结构让 Step 顺序执行很自然
- Six-Element Completeness Check 提供了具体的检查模板
- Self-Check Checklist 末尾的"数据模型预检"正好与本次改进主题相关

不足：
- Step 1（Quick Overview）对"已有分析"的场景没有指导——不知道该重新浏览还是引用已有文档

### Automation Gaps

1. **Git staging 应自动过滤**：harness topic 目录内的文件应自动被 gate 操作 add，无需手动指定路径
2. **Review task prompt 模板化**：skill 中的 review 模板可以通过变量替换自动填充 topic_dir

### Time Sinks

| 环节 | 耗时 | 可避免性 |
|------|------|---------|
| 前置复盘分析 | ~60% | 不可减少（分析本身有价值），但可通过 compact 减少 spec 阶段的上下文占用 |
| Spec 编写 | ~15% | 合理 |
| Spec review dispatch | ~10% | 可通过模板化减少 |
| Git 操作修复 | ~5% | 可通过精确 staging 避免 |
| Gate check | ~5% | 不可减少 |
