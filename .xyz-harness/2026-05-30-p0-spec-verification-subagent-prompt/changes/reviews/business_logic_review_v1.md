---
verdict: pass
must_fix: 0
---

# Business Logic Review v1 — P0 Spec Verification + Subagent Task Prompt Standardization

## 评审记录
- 评审时间：2026-05-31
- 评审类型：业务逻辑审查（流程逻辑对照）
- 评审对象：`skills/xyz-harness-brainstorming/SKILL.md`（Step 5a + Self-Check）+ `skills/xyz-harness-subagent-driven-development/SKILL.md`（Pre-Dispatch + Prohibition + Post-Dispatch + 并行依赖）
- 对照基准：`.xyz-harness/2026-05-30-p0-spec-verification-subagent-prompt/spec.md` AC-1 ~ AC-6

## 检查结果

### AC-1：Assumption Audit 触发条件 — PASS

| 检查项 | spec 要求 | skill 实现 | 状态 |
|--------|----------|-----------|------|
| 触发时机 | 用户确认设计后、写 spec 前 | Step 5a 章节明确：「触发时机：用户确认设计后、写 spec 前」 | 匹配 |
| 作为子步骤嵌入 | 不增加独立 Step | 「这是 Step 5 的前置子步骤，不是独立 Step」 | 匹配 |
| 假设提取范围 | 接口/API/RPC、类型/枚举值、DB 字段、前端组件职责 | 4 类假设类型完全覆盖 | 匹配 |
| 代码验证工具 | grep/read 命令模板 | 提供了 4 组 grep 命令模板 | 匹配 |
| 结果标记 | VERIFIED / UNVERIFIED | 3 种处理路径（验证通过/失败/无法验证）对应标记 | 匹配 |
| 流程图确认 | Process Flow 包含 Audit 节点 | `User approves → Assumption Audit → Write design doc` | 匹配 |

### AC-2：Self-Check Checklist 增强 — PASS

| 检查项 | spec 要求 | skill 实现 | 状态 |
|--------|----------|-----------|------|
| 代码假设验证区块 | 包含 grep 命令模板 | Self-Check Checklist 新增「代码假设验证」区块，含 4 组 grep 命令 | 匹配 |
| 前端 FR 验证 | 组件职责分工验证 | 「前端 FR 涉及的组件职责分工，是否扫描现有代码确认」 | 匹配 |
| 后端 FR 验证 | 接口签名验证 | 「后端 FR 涉及的 DB/API 字段，是否 grep 确认字段名和类型」 | 匹配 |

### AC-3：Pre-Dispatch Checklist 强制执行 — PASS

| 检查项 | spec 要求 | skill 实现 | 状态 |
|--------|----------|-----------|------|
| 5 项必填 | 完整方法签名、实际枚举值/import 路径、已知约束、禁止事项、必须产出文件 | 表格逐项列出，字段名称与 spec 完全一致 | 匹配 |
| 任一缺失禁止派遣 | 不满足任一项 → 禁止派遣 | 「不满足任一项 → 禁止派遣，必须先补充信息」 | 匹配 |
| 嵌入 The Process 章节 | Checklist 嵌入 skill 文档 | 章节位于 Process Flow 之后、Example Workflow 之前 | 匹配 |
| 来源标注 | 每项标注来源 | 表格含「来源」列（grep 命令/spec+plan/固定模板/plan task） | 匹配 |

### AC-4：Prohibition Block 自动注入 — PASS

| 检查项 | spec 要求 | skill 实现 | 状态 |
|--------|----------|-----------|------|
| 标准 6 条禁止事项 | 逐条列出 | 6 条文本与 spec FR-4 逐字一致 | 匹配 |
| 每个必须附加 | 末尾包含 | 「每个 task prompt 末尾必须附加」 | 匹配 |
| 不需手写 | 固定模板 | 「主 agent 无需每次手写，直接复制」 | 匹配 |
| 数据支撑 | 有复盘数据背景 | 「unsafe cast 占 15%，placeholder 占 20%，虚构测试占 10%」 | 匹配 |

### AC-5：Post-Dispatch Verification 可执行 — PASS

| 检查项 | spec 要求 | skill 实现 | 状态 |
|--------|----------|-----------|------|
| 文件存在性检查 | 验证文件是否创建/修改 | 步骤 1：`ls -la {expected_output_files}` | 匹配 |
| 编译检查 | `npx tsc --noEmit` 或等效 | 步骤 2：`npx tsc --noEmit`（标注如适用） | 匹配 |
| 测试检查 | 测试文件验证 | 步骤 3：`npx vitest run {test_file}`（标注如适用） | 匹配 |
| 验证失败处理 | 触发修复流程 | 「验证失败 → subagent 产出不可信，必须修复或重新派遣」 | 匹配 |

### AC-6：并行依赖安全检查 — PASS

| 检查项 | spec 要求 | skill 实现 | 状态 |
|--------|----------|-----------|------|
| 同 Wave 禁止接口依赖 | 并行 Task 不允许接口依赖 | 3 条规则明确覆盖 | 匹配 |
| 依赖拆到不同 Wave | 被依赖方在前 | 「将依赖方拆到下一个 Wave（被依赖方在前）」 | 匹配 |
| 派遣前扫描 | 主 agent 在派遣前执行 | 「Wave 派遣前必须执行」+ 伪代码中 SAFETY CHECK | 匹配 |

## 额外发现

| # | 优先级 | 位置 | 描述 | 说明 |
|---|--------|------|------|------|
| 1 | INFO | subagent skill：并行依赖安全检查 | 检查粒度为 Group 级别而非 Task 级别 | spec FR-6 提到「同 Wave 内并行 Task」，但 skill 实现为 Group 级别。Wave 模式中 Task 由 Group 内 subagent 串行处理，Group 间并行，因此 Group 级检查是合理的上卷，不影响正确性。 |
| 2 | INFO | brainstorming skill：Step 5a 假设提取 | 未强制要求列出所有假设的完整列表 | skill 说「提取所有对现有代码的假设」但未要求产出假设清单文件。不过结果直接在 spec 中标注 VERIFIED/UNVERIFIED，隐含了假设清单的功能。 |

## 结论

全部 6 项 AC 对照检查通过，spec 定义的业务逻辑在两个 skill 文档中得到了完整、准确的实现。无 MUST FIX 问题。2 条 INFO 级观察不影响正确性。

Business logic review 完成，第 1 轮通过，0 条 MUST FIX。
