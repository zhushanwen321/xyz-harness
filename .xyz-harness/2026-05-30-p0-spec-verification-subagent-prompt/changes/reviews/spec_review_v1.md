---
review:
  type: spec_review
  round: 1
  timestamp: "2026-05-31T15:30:00"
  target: ".xyz-harness/2026-05-30-p0-spec-verification-subagent-prompt/spec.md"
  verdict: pass
  summary: "Spec评审完成，第1轮通过，0条MUST FIX，2条LOW建议"

statistics:
  total_issues: 3
  must_fix: 0
  low: 2
  info: 1

issues:
  - id: 1
    severity: LOW
    location: "spec.md > FR-1 > 3.结果处理"
    title: "UNVERIFIED 标记缺乏处理机制兜底"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: LOW
    location: "spec.md > FR-5 > Post-Dispatch Verification"
    title: "验证失败后的修复流程描述模糊"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: INFO
    location: "spec.md > FR-3 > 必填项表格"
    title: "grep 命令模板是示意而非强制格式"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# Spec 评审 v1

## 评审记录
- 评审时间：2026-05-31 15:30
- 评审类型：计划评审（spec 完整性维度）
- 评审对象：`.xyz-harness/2026-05-30-p0-spec-verification-subagent-prompt/spec.md`

## 评审方法

按 `xyz-harness-expert-reviewer` skill 的「模式一：计划评审 → 检查维度 1：spec 完整性」逐项检查。同时对照复盘数据验证 spec 中引用的数据是否准确。

## 逐项检查

### 1. 目标是否明确 ✅

**结论：明确。**

一段话说清楚了：两条 P0 改进——(1) Spec 阶段增加代码假设验证，(2) Subagent task prompt 标准化。

### 2. 范围是否合理 ✅

**结论：合理，边界清晰。**

- 明确声明只改 skill 文档（brainstorming SKILL.md + subagent-driven-development SKILL.md），不改 gate-check.py、不改 coding-workflow 扩展代码
- L1 复杂度评估合理——两个 markdown 文件的局部增强
- 向后兼容性约束明确
- 6 个 FR 都是围绕"检查点增强"而非"机制重构"，不过度设计

### 3. 验收标准是否可量化 ✅

**结论：可测试。**

逐条 AC 评估：

| AC | 可测试性 | 判定方法 |
|----|---------|---------|
| AC-1 | ✅ | Given/When/Then 格式，可验证：Step 5 前是否有 grep/read 执行记录 |
| AC-2 | ✅ | 可检查 skill 文档的 Self-Check 章节是否包含"代码假设验证"区块 |
| AC-3 | ✅ | 可检查 skill 文档的 Process 章节是否包含 5 项必填检查表 |
| AC-4 | ✅ | 可检查 task prompt 末尾是否有固定 6 条禁止事项 |
| AC-5 | ✅ | 可观察主 agent 在 subagent 返回后是否执行编译/测试命令 |
| AC-6 | ✅ | 可构造冲突的 Wave 场景，验证是否被拒绝 |

所有 AC 都有明确的 pass/fail 判断标准，无模糊描述。

### 4. FR 是否可执行 ✅

**结论：可执行，操作步骤具体。**

逐条 FR 评估：

| FR | 可执行性 | 说明 |
|----|---------|------|
| FR-1 | ✅ | 假设提取 → grep/read 验证 → 标注处理，三步流程清晰。"嵌入 Step 5a"定位明确 |
| FR-2 | ✅ | 在已有 Self-Check Checklist 中增加检查区块，改动最小 |
| FR-3 | ✅ | 5 项必填表格 + "不满足则禁止派遣"的硬性规则，操作明确 |
| FR-4 | ✅ | 固定文本块，直接复制注入，无歧义 |
| FR-5 | ✅ | 三步验证（文件存在 + 编译 + 测试），命令级别具体 |
| FR-6 | ✅ | 依赖扫描规则清晰：同 Wave 不允许接口依赖 |

### 5. 改进是否真的能解决复盘数据中的问题 ✅

**结论：对应关系清晰，根因到方案有完整追溯。**

复盘数据中的核心问题 vs spec 的 FR 覆盖：

| 复盘问题 | 出现频次 | 对应 FR |
|---------|---------|---------|
| Spec 假设接口/RPC 存在，实际没有 | 6/15 topic (40%) | FR-1 + FR-2 |
| Subagent 方法语义理解错误 | 4+ 次 | FR-3（完整方法签名）+ FR-4（禁止擅自变更） |
| Subagent unsafe cast | 2 次 | FR-4（禁止 unsafe cast） |
| Subagent 虚构测试/遗漏文件 | 3 次 | FR-5（Post-Dispatch 验证） |
| Subagent 留 no-op/placeholder | 2 次 | FR-4（禁止 TODO/placeholder）+ FR-6（依赖安全） |
| 并行 Task 隐式依赖 | 多次 | FR-6（Wave 依赖安全检查） |

所有高频问题都有对应的 FR 覆盖。未发现遗漏的系统性问题。

### 6. 改动范围是否合理 ✅

**结论：最小改动，不过度设计。**

- 每个改进都嵌入现有流程（Step 5a、Self-Check 扩展、Process 章节扩展），不增加独立 Step
- FR-4 的禁止事项是固定模板，不需要主 agent 判断，执行成本极低
- FR-5 的验证是轻量检查（文件存在 + tsc + vitest），不是重量级 CI
- Complexity Assessment 标注 L1 合理

### 7. 是否标记了 [待决议] 项 ✅

无 `[待决议]` 标记。Spec 中所有决策点都已明确。

### 8. Background 数据准确性 ✅

**结论：数据准确。**

- "40% 的 spec 返工"：对应复盘文档中"Spec 阶段未验证代码假设 6/15 = 40%"——准确
- "subagent 问题占 dev 返工的 50%"：对应复盘文档中"Subagent task prompt 信息不足 8/15 = 53%"——约 50%，合理近似

### 9. 业务用例覆盖 ✅

三个 UC 覆盖了核心场景：
- UC-1：Spec 阶段假设验证（FR-1）
- UC-2：Subagent 产出质量保障（FR-3/4/5）
- UC-3：并行依赖安全（FR-6）

### 10. Constraints 合理性 ✅

5 条约束都合理且可验证：
- "不增加独立 Step"：可检查修改后的 skill 文档 Step 数量
- "不改 gate-check.py"：可 git diff 验证
- "不改 coding-workflow 扩展代码"：可 git diff 验证
- "向后兼容"：老 spec/plan 仍可执行——因新增的都是前置检查步骤，不影响已有产出
- "最小改动"：只改 2 个 markdown 文件

### 发现的问题

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | LOW | spec.md > FR-1 > 3.结果处理 | `[UNVERIFIED]` 标记后"与用户确认"缺乏兜底：如果用户也无法确认怎么办？比如引用了第三方库的内部实现，代码可见但行为不确定。建议补充：如果确认后仍无法验证，该假设不得写入 FR，必须降级为 [待决议] 或从当前 spec 中移除 | 补充一句兜底规则 |
| 2 | LOW | spec.md > FR-5 > Post-Dispatch Verification | "验证失败 → subagent 产出不可信，必须修复或重新派遣"中的"修复"指向谁不明确。是主 agent 修复 subagent 产出，还是重新派遣 subagent 带更多上下文？建议明确：优先重新派遣（补充缺失上下文），次选主 agent 直接修复 | 区分两种修复路径 |
| 3 | INFO | spec.md > FR-3 > 必填项表格 | "完整方法签名"的获取方式写的是 `grep -n "function\|interface..."`，这只是示意命令。实际执行时主 agent 需要根据具体语言和项目结构调整 grep 模式。这不是问题，只是记录这一点 | — |

> 优先级定义：
> - **MUST FIX**：不修复则评审不通过，会阻塞流程
> - **LOW**：建议修复，但不阻塞
> - **INFO**：观察记录，无需操作

### 结论

**通过。**

Spec 目标明确、范围合理、FR 可执行、AC 可测试、改动范围最小、复盘数据追溯准确。2 条 LOW 建议可在后续 plan/实现阶段考虑，不阻塞当前流程。

### Summary

Spec评审完成，第1轮通过，0条MUST FIX，2条LOW建议。
