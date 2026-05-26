---
verdict: pass
---

# Plan Phase Interface Contract Enhancement

## Background

xyz-harness V5 的 plan 阶段（Phase 2）当前在 Task 粒度级别进行任务拆分，例如"创建 UserService"。这种粒度存在两个问题：

1. **遗漏检测弱**：spec 有 10 个 AC，plan 有 5 个 task，缺乏机制确认每个 AC 都有对应实现
2. **逻辑串联验证空白**：Task 3 的输出是否是 Task 5 的输入？类型对得上吗？plan 阶段不验证这一点

本需求在 plan 阶段新增 **接口契约层（Interface Contract）**，填补 plan 和 code 之间的设计空白。接口契约包含方法签名表、数据流链和 AC 覆盖矩阵，能在 plan 阶段就检测遗漏和逻辑断裂。

## Functional Requirements

### FR-1: interface_chain.json 新交付物

Phase 2 (plan) 新增一个结构化 JSON 交付物 `interface_chain.json`，与 plan.md 并列存放在 topic 目录下。

JSON schema（以方法签名表为主体，数据流为附属）：

```json
{
  "version": "1.0",
  "methods": [
    {
      "name": "ClassName.methodName",
      "class": "ClassName",
      "params": { "paramName": "TypeName" },
      "returns": "TypeName",
      "spec_refs": ["AC-1"],
      "edge_cases": ["duplicate name", "null config"]
    }
  ],
  "data_flows": [
    {
      "id": "flow-id",
      "description": "Flow description",
      "chain": ["ClassA.method1", "ClassB.method2", "ClassC.method3"],
      "spec_refs": ["AC-1"]
    }
  ]
}
```

**字段说明：**
- `version`: string，必填，当前值 `"1.0"`
- `methods`: array，必填，方法签名表
- `methods[].name`: string，必填，格式为 `ClassName.methodName`
- `methods[].class`: string，必填
- `methods[].params`: object，必填，参数名到类型的映射（空对象 `{}` 表示无参数）
- `methods[].returns`: string，必填，返回类型（`"void"` 表示无返回值）
- `methods[].spec_refs`: array of string，必填，关联的 spec AC 编号（空数组表示无直接关联）
- `methods[].edge_cases`: array of string，可选，关键边界条件
- `data_flows`: array，必填，数据流链
- `data_flows[].id`: string，必填，唯一标识
- `data_flows[].description`: string，必填
- `data_flows[].chain`: array of string，必填，有序方法引用列表，表示 A → B → C 调用链
- `data_flows[].spec_refs`: array of string，必填，关联的 spec AC 编号

### FR-2: plan.md 接口契约章节

plan.md 中新增 Interface Contracts 章节，包含人类可读的 markdown 表格：

**按模块分组的接口签名表：**

```markdown
## Interface Contracts

### Module: user-management

#### Class: UserService

| Method | Signature | Returns | Edge Cases | Spec Ref |
|--------|-----------|---------|------------|----------|
| create | (name: str, config: UserConfig) -> User | User | name 重复、config 为 null | AC-1 |
| validate | (id: str) -> ValidationResult | ValidationResult | id 不存在 | AC-2 |

#### Data: ValidationResult

| Field | Type | Description |
|-------|------|-------------|
| valid | bool | 验证结果 |
| errors | list[str] | 错误列表 |
```

**AC 覆盖矩阵（强制）：**

```markdown
## Spec Coverage Matrix

| Spec AC | Interface Method | Data Flow | Task |
|---------|-----------------|-----------|------|
| AC-1 | UserService.create | user-create-flow | Task 1 |
| AC-2 | UserService.validate | user-create-flow | Task 2 |
| AC-3 | [GAP] | [GAP] | [GAP] |
```

矩阵中任何 `[GAP]` 条目表示 plan 遗漏，必须在完成 plan 前解决或显式声明为 postponed。

### FR-3: L1/L2 复杂度分级

接口契约的强制程度根据 plan 复杂度分级：

| 维度 | L1（简化版） | L2（完整版） |
|------|-------------|-------------|
| interface_chain.json | 可选（不产出也能过 gate） | 强制（缺失则 gate FAIL） |
| methods 表 | 强制（plan.md markdown 表） | 强制（plan.md + JSON） |
| data_flows | 可选 | 强制 |
| AC 覆盖矩阵 | 强制 | 强制 |
| plan.md frontmatter | `complexity: L1` | `complexity: L2` |

plan.md 的 YAML frontmatter 新增 `complexity` 字段（`"L1"` 或 `"L2"`），供 gate-check.py 做条件判断。

### FR-4: 接口粒度边界

**纳入接口契约的范围：**
- 公开接口类的公有方法（含实现类的框架性方法，不要求所有 helper/private 方法）
- 数据类 / DTO / Model 的字段定义

**不纳入接口契约的范围：**
- 私有方法 / 内部 helper 方法
- 工具类（除非被多个模块共享，作为共享契约）
- 框架 / 平台生成的代码（prisma、ORM 生成的方法等）

### FR-5: Gate 检查更新

**GL1（check_gate.py）Phase 2 新增检查：**

1. plan.md frontmatter 检查 `complexity` 字段存在且值为 `"L1"` 或 `"L2"`
2. 当 `complexity: "L2"` 时：
   - `interface_chain.json` 文件必须存在
   - JSON 合法（可被 `json.load()` 解析）
   - `version` 字段存在
   - `methods` 数组存在且非空
   - `data_flows` 数组存在且非空
   - 每个 method 至少包含 `name`、`class`、`params`、`returns` 字段
   - 每个 data_flow 至少包含 `id`、`chain` 字段，`chain` 非空
3. 当 `complexity: "L1"` 时：不检查 interface_chain.json

**GL2（plan review subagent）新增检查维度：**
- plan.md 接口签名表与 interface_chain.json 的 methods 一致性
- data_flows 中引用的方法名是否都存在于 methods 表中
- AC 覆盖矩阵是否完整覆盖 spec 中所有 adopted AC
- 数据流链条中的类型传递是否一致（前一个方法的返回类型是否与下一个方法的参数类型兼容）

### FR-6: Phase 3 (dev) 消费接口契约

TDD coder subagent 的上下文传递中增加接口签名信息：

**L2 plan（有 interface_chain.json）：**
- 主 agent 从 interface_chain.json 中提取当前 Task 涉及的 methods 片段
- 作为 TDD coder subagent task prompt 的一部分传入
- edge_cases 字段指导 TDD subagent 编写边界条件测试

**L1 plan（无 interface_chain.json）：**
- 主 agent 从 plan.md 的 Interface Contracts markdown 表格中提取当前 Task 涉及的方法签名
- 提取方式：read plan.md 对应模块的接口签名表，将方法名、参数、返回值整理为结构化文本传入 task prompt

executor subagent 的上下文传递中同样增加接口签名信息，确保实现代码与 plan 中的契约对齐。

**最低传递标准（L1/L2 统一）：** task prompt 至少包含方法名、参数类型列表、返回类型。edge_cases 为可选附加信息。

### FR-7: Phase 4 (test) 消费数据流

Phase 4 集成测试执行时，消费 interface_chain.json 中的 data_flows（仅 L2 plan 有此文件，L1 plan 不涉及）：
- 集成测试用例的验证应覆盖 data_flows 中定义的所有完整调用链
- 验证方式：每个 data_flow 的 chain 中相邻方法之间的数据传递是否正确（前一个方法的输出能作为后一个方法的输入）
- 不改 test_cases_template.json schema，data_flow 覆盖验证在执行层面（Phase 4 的执行步骤描述）中体现

### FR-8: plan.md 与 interface_chain.json 一致性

plan.md 中的 markdown 接口签名表和 interface_chain.json 是同一设计的两种表示（人读 + 机读）。
plan review subagent 在内容审查时检查两者的一致性。如存在漂移（方法签名、参数类型、返回值不一致），标记为 must_fix。

## Acceptance Criteria

### AC-1: interface_chain.json schema 校验通过
**Given** 一个 L2 复杂度的 plan
**When** gate-check.py 执行 Phase 2 检查
**Then** interface_chain.json 存在，JSON 合法，methods 和 data_flows 数组非空，每个元素包含必填字段

### AC-2: L1 plan 不强制 interface_chain.json
**Given** 一个 L1 复杂度的 plan
**When** gate-check.py 执行 Phase 2 检查
**Then** 不检查 interface_chain.json 是否存在，plan.md 中包含接口签名 markdown 表和 AC 覆盖矩阵即可通过

### AC-3: plan.md 接口签名表存在
**Given** 任意复杂度的 plan
**When** plan review subagent 审查 plan.md
**Then** plan.md 包含 Interface Contracts 章节，按模块分组的类/方法签名表格

### AC-4: AC 覆盖矩阵无 GAP
**Given** 一个已完成的 plan
**When** plan review subagent 审查
**Then** Spec Coverage Matrix 中无 `[GAP]` 条目。所有 adopted AC（本轮计划要实现的 AC）都有对应 method + task 映射。postponed AC（不在本轮 scope 内的 AC）用 `[POSTPONED]` 标记并注明原因，不算 GAP。

### AC-5: cross-reference 校验通过
**Given** 一个 L2 plan 的 interface_chain.json
**When** plan review subagent 做 GL2 审查
**Then** data_flows 中的方法名全部存在于 methods 表中，无悬空引用

### AC-6: plan.md 与 JSON 一致
**Given** 一个 L2 plan 的 interface_chain.json 和 plan.md
**When** plan review subagent 审查
**Then** 两者中的方法签名（名称、参数、返回值）一致，无漂移

### AC-7: TDD subagent 消费接口签名
**Given** Phase 3 的 TDD coder subagent 被派遣
**When** 主 agent 构造 task prompt
**Then** task prompt 包含当前 Task 涉及的方法签名（至少：方法名、参数类型列表、返回类型），来源为 interface_chain.json（L2）或 plan.md 接口签名表（L1）

### AC-8: complexity frontmatter 存在
**Given** 任意 plan.md
**When** gate-check.py 执行 Phase 2 检查
**Then** plan.md frontmatter 包含 `complexity` 字段，值为 `"L1"` 或 `"L2"`

## Constraints

- **不改 e2e-test-plan.md 结构**：E2E test plan 不因本需求修改结构，仅在场景描述中可选加 traceability 标注
- **不改 test_cases_template.json schema**：test_cases_template.json 不新增 `interface_chain` 字段。接口链路验证通过独立的 `interface_chain.json` 完成
- **不建独立 unit test plan**：unit test 不新建独立文件，接口签名表中的方法名 + edge_cases 隐含指导 TDD subagent
- **GL1 保持简单**：gate-check.py 只做 JSON schema 校验，不做语义/跨文件校验
- **向后兼容**：现有 plan（无 interface_chain.json、无 complexity 字段）不应因 gate-check.py 更新而 FAIL。对于缺少 complexity 字段的旧 plan，gate 按默认行为处理（不检查 interface_chain.json）

## Decisions Made

| 决策 | 选项 | 理由 |
|------|------|------|
| L1/L2 分级 | L2 强制完整契约，L1 简化版 | 简单需求不需要完整数据流图，但 AC 覆盖矩阵对所有需求都有价值 |
| 接口粒度 | 公有方法 + 数据模型字段，不含私有方法和工具类 | 减少噪音，TDD subagent 测公开行为 |
| JSON 格式 | 方法签名表为主体，data_flows 为附属 | methods 表可直接被 TDD subagent 消费 |
| 双表示 | plan.md markdown + interface_chain.json | plan.md 供人/subagent 阅读，JSON 供 gate 校验 |
| Cross-reference | GL1 schema only，GL2 plan review 做跨文件检查 | 保持 GL1 简单，语义校验交给 AI |
| Gate 强制度 | L2 强制，L1 可选 | 与 L1/L2 分级一致 |

## Complexity Assessment

**L2**（复杂）

本需求涉及跨 6 个文件的修改，涉及 gate-check.py（Python）、4 个 skill 文档（Markdown）和新的 JSON schema 定义。接口契约层是横切关注点，影响 plan→dev→test 三个 Phase 的数据流。
