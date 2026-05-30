---
verdict: pass
---

# P0 改进：Spec 代码验证 + Subagent Task Prompt 标准化

## Background

基于 15+ 个 harness topic 的复盘分析（详见 `docs/improvement/2026-05-31-retrospect-analysis-spec-execution-quality.md`），发现两个系统性问题：

1. **Spec 阶段基于文档假设写 FR**，未验证接口/RPC/类型是否真实存在 → 导致 40% 的 spec 返工
2. **Subagent task prompt 信息不足** → 方法语义错误、placeholder、no-op 等问题占 dev 返工的 50%

本需求实现两条 P0 改进，通过增强现有 skill 机制（而非另起炉灶）来消除这两类问题。

## Functional Requirements

### FR-1：Spec Assumption Audit（嵌入 brainstorming skill Step 5）

在用户确认设计后、写 spec 前，强制执行 Assumption Audit：

1. **假设提取**：从用户确认的设计中，自动提取所有对现有代码的假设：
   - 引用的接口/API/RPC 是否存在
   - 引用的类型定义/枚举值是否与代码一致
   - 引用的 DB 字段/API 响应体是否真实
   - 前端组件的现有职责分工是否如设计所述

2. **代码验证**：对每个提取的假设，执行代码验证（grep/read），记录验证结果

3. **结果处理**：
   - 验证通过的假设 → 写入 spec 时标注 `[VERIFIED]`
   - 验证失败的假设 → 修正设计或与用户确认后写入 spec
   - 无法验证的假设 → 标记 `[UNVERIFIED]`，在 spec 完成后与用户确认

4. **嵌入位置**：作为 Step 5（Write spec）的前置子步骤（Step 5a），不增加独立的 Step

### FR-2：增强 brainstorming skill 的 Self-Check Checklist

在现有 Self-Check Checklist 中增加代码验证相关的检查项：

1. 新增"代码假设验证"检查区块，包含具体的 grep 命令模板
2. 对前端 FR，增加"现有组件分工验证"检查项
3. 对后端 FR，增加"接口签名验证"检查项

### FR-3：Pre-Dispatch Checklist（嵌入 subagent-driven-development skill）

在主 agent 每次派遣 subagent 前，强制确认以下信息已在 task prompt 中：

| 必填项 | 说明 | 来源 |
|--------|------|------|
| 完整方法签名 | 从代码 grep 提取，不从文档推断 | `grep -n "function\|interface\|type\|export" {file}` |
| 实际枚举值/import 路径 | 从代码提取实际值 | `grep -n "enum\|const.*=" {file}` |
| 已知约束 | null guard 策略、错误处理方式、并发模型 | spec + plan |
| 禁止事项 | 标准禁止清单（见 FR-4） | 固定模板 |
| 必须产出的文件列表 | subagent 完成后校验 | plan task 描述 |

**不满足任一项 → 禁止派遣，必须先补充信息。**

### FR-4：Prohibition Block（标准禁止事项注入）

每个 task prompt 末尾必须附加以下标准禁止事项块：

```
## 禁止事项（Prohibitions）
1. 禁止使用 `as unknown as X` 等 unsafe cast 绕过类型检查
2. 禁止擅自变更接口签名（包括返回类型、参数类型、参数顺序）
3. 禁止留 TODO/FIXME/placeholder/no-op 实现
4. 禁止虚构测试结果或文件列表
5. 禁止引入 plan 未列出的新依赖
6. 如遇到信息不足，返回 NEEDS_CONTEXT 而非自行假设
```

### FR-5：Post-Dispatch Verification（嵌入 subagent-driven-development skill）

subagent 返回后，主 agent 必须执行轻量验证：

1. **文件存在性检查**：验证 task prompt 中列出的文件是否实际创建/修改
2. **编译检查**：`npx tsc --noEmit` 或等效命令（如适用）
3. **测试检查**：`npx vitest run` 或等效命令（如适用，仅验证 subagent 产出的测试文件）

验证失败 → subagent 产出不可信，必须修复或重新派遣。

### FR-6：并行 Task 依赖安全检查（嵌入 subagent-driven-development skill）

在 Wave 模式派遣前，增加依赖安全检查：

1. 同一 Wave 内并行 Task 不允许存在接口依赖（一个 Task 引用另一个 Task 产出的函数/类型）
2. 如存在依赖 → 必须拆到不同 Wave（被依赖方在前）
3. 主 agent 在 Wave 派遣前执行依赖扫描

## Acceptance Criteria

### AC-1：Assumption Audit 可执行
- Given 用户确认设计，When 进入 Step 5 写 spec 前，Then 自动提取代码假设并逐一验证
- 假设验证的 grep/read 命令模板嵌入 skill 文档，主 agent 可直接执行

### AC-2：Self-Check Checklist 增强可用
- Given spec 写完，When 执行 Self-Check，Then "代码假设验证"区块包含具体 grep 命令模板
- 对前端/后端 FR 分别有对应的验证命令

### AC-3：Pre-Dispatch Checklist 强制执行
- Given 主 agent 准备派遣 subagent，When 5 项必填信息任一缺失，Then 禁止派遣
- Checklist 嵌入 skill 文档的 The Process 章节

### AC-4：Prohibition Block 自动注入
- Given 每个 task prompt，When 构造完成，Then 末尾包含标准 6 条禁止事项
- 禁止事项文本固定，不需要主 agent 每次手写

### AC-5：Post-Dispatch Verification 可执行
- Given subagent 返回 DONE，When 主 agent 收到结果，Then 执行文件存在性+编译+测试验证
- 验证失败触发修复流程

### AC-6：并行依赖安全
- Given Wave 模式派遣，When 同 Wave 内 Task 存在接口依赖，Then 拒绝并行，拆到不同 Wave

## Constraints

- **不增加独立 Step**：Assumption Audit 嵌入 Step 5 作为子步骤，不增加流程长度
- **不改 gate-check.py**：本需求不涉及 gate 机制修改
- **不改 coding-workflow 扩展代码**：只改 skill 文档（SKILL.md）
- **向后兼容**：改进不破坏现有 harness 流程（老 spec、老 plan 仍可执行）
- **最小改动**：只增加必要的章节，不重构已有内容

## Complexity Assessment

| 维度 | 评估 |
|------|------|
| 新领域概念 | 无 — 只在现有流程中增加检查点 |
| 新表/新 API | 无 |
| 数据流复杂度 | 简单同步 — 主 agent 直接执行 |
| 跨模块集成 | 无跨模块交互 |
| 评估结果 | **L1** — 两个 markdown 文件的局部增强 |

## 业务用例

> 纯技术性流程改进，无外部用户。

### UC-1：Spec 阶段消除接口假设错误
- **Actor**: 主 agent（Phase 1 spec）
- **场景**: 设计中引用了 `setModel` RPC，实际代码中不存在
- **预期结果**: Assumption Audit 发现假设不成立，在写 spec 前修正设计

### UC-2：Subagent 产出质量保障
- **Actor**: 主 agent（Phase 3 dev）
- **场景**: 派遣 subagent 实现 togglePlugin 功能
- **预期结果**: Pre-Dispatch Checklist 确认方法签名已从代码提取；Prohibition Block 禁止 unsafe cast；Post-Dispatch Verification 确认文件存在

### UC-3：并行 Task placeholder 预防
- **Actor**: 主 agent（Phase 3 dev，Wave 模式）
- **场景**: Task 5 引用 Task 6 产出的函数
- **预期结果**: 依赖安全检查发现接口依赖，将 Task 6 拆到前一个 Wave
