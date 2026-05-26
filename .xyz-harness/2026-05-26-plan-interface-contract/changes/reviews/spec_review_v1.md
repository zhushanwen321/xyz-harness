---
review:
  type: spec_review
  round: 1
  timestamp: "2026-05-26T11:30:00"
  target: ".xyz-harness/2026-05-26-plan-interface-contract/spec.md"
  verdict: fail
  summary: "计划评审完成，第1轮，2条MUST FIX，需修改后重审"

statistics:
  total_issues: 7
  must_fix: 2
  must_fix_resolved: 0
  low: 3
  info: 2

issues:
  - id: 1
    severity: MUST_FIX
    location: "spec.md:FR-6 / AC-7 (TDD subagent consumption)"
    title: "L1 plan 下 TDD subagent 消费接口签名的方式未定义"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 2
    severity: MUST_FIX
    location: "spec.md:FR-7 (Phase 4 consumption) vs Constraints"
    title: "test_cases_template.json 不改 schema 但需标注 data_flow 引用存在矛盾"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 3
    severity: LOW
    location: "spec.md:FR-2 / AC-4 (Spec Coverage Matrix)"
    title: "\"Postponed\" 概念未形式化——无判定标准、负责人、跟踪机制"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 4
    severity: LOW
    location: "spec.md:FR-2 (Interface Contracts chapter / Data section)"
    title: "数据字段文档（Data section）是否为必填、何时需要未明确"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 5
    severity: LOW
    location: "spec.md:AC-4"
    title: "\"Adopted AC\" 术语未定义——与 spec 中所有 AC 的关系不清晰"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 6
    severity: INFO
    location: "spec.md:FR-5 (Gate check) vs FR-1 (Schema)"
    title: "GL1 检查项与 FR-1 schema 的 `params` 必填要求不一致"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 7
    severity: INFO
    location: "spec.md:AC-7"
    title: "\"task prompt 包含\" 的精确形式和最低标准未定义"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 计划评审 v1 — spec 完整性审查

## 评审记录

- 评审时间：2026-05-26 11:30
- 评审类型：计划评审（模式一）
- 评审对象：`.xyz-harness/2026-05-26-plan-interface-contract/spec.md`
- 审查重点：spec 作为 "plan 阶段接口契约增强" 的需求文档的清晰度与完整性

## 审查维度分析

### 1. Spec 完整性

| 子项 | 状态 | 说明 |
|------|------|------|
| 目标明确 | ✅ | Background 段清楚说明问题（遗漏检测弱 + 逻辑串联验证空白）和方案（接口契约层） |
| 范围合理 | ✅ | FR-4 明确纳入/不纳入边界；Constraints 段列出 5 条不改项，边界清晰 |
| AC 可量化 | ⚠️ | 8 个 AC 大部分可量化验证，AC-7 格式未精确定义（见 #7） |
| `[待决议]` 项 | ✅ | 无待决议项 |

**结论：整体完整性较好。Background 到 FR 到 AC 到 Constraints 再到 Decisions Made，结构完整。**

### 2. FR 可行性

| FR | 可行性 | 说明 |
|----|--------|------|
| FR-1 | ✅ | JSON schema 定义完备（version/methods/data_flows/必填字段），可直接实现 |
| FR-2 | ✅ | Markdown 表格格式清晰，按模块分组的方式适合 subagent 阅读 |
| FR-3 | ✅ | L1/L2 分级策略合理，检查项差异明确 |
| FR-4 | ✅ | 边界清晰（公开方法 + 数据模型 + 不包含 helper/工具类/框架代码） |
| FR-5 | ✅ | GL1/GL2 分工明确（GL1 做 schema 校验，GL2 做语义校验） |
| FR-6 | ⚠️ | **L1 plan 下 TDD subagent 消费方式未定义（#1）** — FR-6 明确写 "从 interface_chain.json 提取"，但 FR-3 说 L1 不产出 JSON |
| FR-7 | ⚠️ | **与 Constraints 存在矛盾（#2）** — 要求标注 data_flow 引用但约束说不能改 test_cases_template.json |
| FR-8 | ✅ | 一致性检查方向明确 |

### 3. AC 可验证性

| AC | 可验证 | 说明 |
|----|--------|------|
| AC-1 | ✅ | JSON schema 校验—自动化可执行 |
| AC-2 | ✅ | 条件分支—自动化可执行 |
| AC-3 | ✅ | 存在性检查—review subagent 可执行 |
| AC-4 | ⚠️ | 依赖 "adopted AC" 定义（#5）和 "postponed" 形式化（#3） |
| AC-5 | ✅ | 悬空引用—自动化可执行 |
| AC-6 | ✅ | 一致性—review subagent 可执行 |
| AC-7 | ⚠️ | "包含" 标准未精确定义（#7）；L1 路径缺失（#1） |
| AC-8 | ✅ | Frontmatter 字段存在性—自动化可执行 |

### 4. 约束合理性

所有 5 条约束均有明确理由且合理。Backward compatibility 有专门处理（旧 plan 默认不检查）。总体良好。

### 5. 与 CLAUDE.md 架构约束一致性

| 约束 | 一致性 | 说明 |
|------|--------|------|
| 五层防御体系 | ✅ | 接口契约新增 GL1 schema 校验 + GL2 语义校验，与 L2/L3 防御理念一致 |
| Manual Mode 兼容 | ✅ | 当前 spec 通过 GL1/GL2 描述对齐 Manual Mode 的独立 gate 模型 |
| Skill 发现机制 | ✅ | interface_chain.json 不依赖 SkillResolver |
| Gate 脚本门禁 | ✅ | FR-5 明确更新 check_gate.py |
| review subagent 独立上下文 | ✅ | plan review subagent 做 GL2 检查，符合 L3 独立评审原则 |

---

### 发现的问题

| # | 优先级 | 位置 | 描述 | 修改建议 |
|---|--------|------|------|---------|
| 1 | **MUST FIX** | FR-6 / AC-7 | **L1 plan 下 TDD subagent 消费接口签名的方式未定义**：FR-6 明确写 "主 agent 从 interface_chain.json 中提取当前 Task 涉及的 methods 片段"，但 FR-3 说明 L1 plan 不产出 interface_chain.json。L1 路径下 TDD subagent 如何获取方法签名？是改为从 plan.md markdown 解析？还是 L1 plan 仍需要 JSON 但 gate 不强制？spec 未覆盖。 | 方案 A：FR-6 补充 L1 路径——主 agent 从 plan.md 的 Interface Contracts markdown 表解析方法签名；方案 B：FR-3 调整为 L1 也输出 interface_chain.json 但 gate 仅做轻度检查（仅校验存在性）。建议选 A 以保持 FR-3 的现有分级设计。 |
| 2 | **MUST FIX** | FR-7 vs Constraints | **test_cases_template.json 不改 schema 但需标注 data_flow 引用存在矛盾**：FR-7 要求集成测试用例的 steps 中 "标注验证了哪个 data_flow"，但 Constraints 明确说 "不改 test_cases_template.json schema" 且 "接口链路验证通过独立的 interface_chain.json 完成"。如果 schema 不能改，test_step 如何携带 data_flow 引用？是靠自由文本在 step description 中标注，还是通过新增字段？ | 方案 A：移除 FR-7 中 "标注验证了哪个 data_flow" 的要求，改为 "集成测试验证应覆盖 data_flows 中的所有调用链"；方案 B：在 Constraints 中声明 test_cases_template.json 新增一个可选 `data_flow_ref` 字段。建议选 A 以保持向后兼容。 |
| 3 | LOW | FR-2 / AC-4 | **"Postponed" 概念未形式化**：FR-2 说 AC 覆盖矩阵中的 `[GAP]` 可 "显式声明为 postponed"，但未定义谁有权判断 postponed、什么格式声明、是否有审批流程、是否需要在 gate 中跟踪。 | 补充定义：postponed 的判定标准（如"不在本轮 scope 内"）、记录格式（同一矩阵中用 `[POSTPONED]` 标记 + 责任人 + 目标 Phase）、及 gate 检查逻辑（postponed 是否算阻塞）。 |
| 4 | LOW | FR-2 (Data section) | **数据字段文档是否必填未明确**：FR-2 展示了 Data: ValidationResult 的字段定义表格，但未说明这是 required 还是 optional。如果方法签名中引入了新数据类型，是否必须提供字段定义？还是说只需在 plan.md 中提及即可？ | 明确规则：所有 method 返回值中出现的自定义数据类型（非基础类型如 string/int/bool），必须在对应模块的 Data 节中定义字段，否则可能造成 TDD subagent 对数据结构的理解不一致。 |
| 5 | LOW | AC-4 | **"Adopted AC" 术语未定义**：AC-4 使用 "所有 adopted AC" 的表述，但 spec 未区分 adopted AC 与 rejected/postponed AC。spec.md 中的 8 个 AC 是否全部是 adopted？plan 阶段是否需要从 spec 的 AC 池中筛选出 adopted 集？ | 统一术语：在 FR-2 补充 "Adopted AC = 本轮计划要实现的 Acceptance Criteria"，并在 Decisions Made 或 Constraints 中说明 adopted 与 postponed 的关系（如：postponed 的 AC 仍应出现在矩阵中但标记为 `[POSTPONED]`，不受 AC-4 的 GAP-free 要求约束）。 |
| 6 | INFO | FR-5 vs FR-1 | **GL1 检查项与 FR-1 schema 的 params 必填要求不一致**：FR-1 schema 将 `methods[].params` 标注为 "必填"，但 FR-5 的 GL1 检查列表只列了 `name`、`class`、`returns`，未包含 `params`。如果 `params` 是必填，GL1 应同步检查。 | 两个方向选一：① 将 `params` 加入 GL1 检查项；② 在 FR-1 中将 `params` 改为 "必填，但 JSON schema 格式为 `{}` 表示无参数"，并在 GL1 检查中确保该字段存在（允许空对象）。建议选①以保持 schema 定义和检查一致。 |
| 7 | INFO | AC-7 | **"task prompt 包含" 的精确形式和最低标准未定义**：AC-7 说 "task prompt 包含从 interface_chain.json 提取的方法签名"，但什么算 "包含"？是需要完整 JSON 片段、还是只方法名和参数列表、还是一个文件引用？无最低标准则 AC-7 无法收敛。 | 定义最低标准：至少包含（方法名、参数类型列表、返回类型、edge_cases 中与本 Task 相关的部分），可内联在 prompt 文本或作为附件引用。建议在 AC-7 的 Then 部分补充具体格式要求。 |

---

## 等级判定说明

| # | 等级 | 判定依据 |
|---|------|---------|
| 1 | MUST_FIX | 核心需求（TDD subagent 消费接口签名）存在路径缺失，实施时必然产生分歧或遗漏 |
| 2 | MUST_FIX | FR-7 和 Constraints 直接冲突，实施时无法同时满足两个要求 |
| 3-5 | LOW | 不影响框架性实现，但会导致 AC 判定有歧义 |
| 6-7 | INFO | 实现细节或格式问题，implementation 过程中可自行约定 |

---

## 结论

**需修改后重审。**

该 spec 整体架构清晰、结构完整，L1/L2 分级设计合理，FR 大部分可行。但有 **2 条 MUST FIX**：

1. **L1 plan 下 TDD subagent 消费接口签名的路径缺失** — 核心需求存在断路
2. **FR-7 与 Constraints 的冲突** — 要求标注 data_flow 引用但同时禁止改 test_cases_template.json schema

建议优先解决 #2（冲突性更高，可能影响 FR-7 的去留），再解决 #1（补充 L1 路径）。两条修正后可裁定通过。

### Summary

计划评审完成，第1轮，2条MUST FIX，需修改后重审。
