---
verdict: pass
complexity: L1
---

# Plan Phase Interface Contract Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use xyz-harness-subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 xyz-harness plan 阶段新增接口契约层（Interface Contract），包含 interface_chain.json 交付物、plan.md 接口签名章节、AC 覆盖矩阵，并更新 gate-check.py、phase-dev、phase-test、expert-reviewer 四个下游文件。

**Architecture:** 纯文档/脚本修改。核心是 writing-plans SKILL.md 新增 Interface Contracts 章节（指导 plan 阶段产出接口契约），下游 4 个文件做消费端适配。gate-check.py 新增 Phase 2 的 L2 interface_chain.json schema 校验。所有改动都是增量追加，不破坏现有功能。

**Tech Stack:** Markdown (skill 文档), Python (gate-check.py), JSON (interface_chain.json schema)

---

## File Structure

| File | Type | Group | Description |
|------|------|-------|-------------|
| `skills/xyz-harness-writing-plans/SKILL.md` | modify | BG1 | 新增 Interface Contracts 章节 + complexity frontmatter 说明 |
| `skills/xyz-harness-phase-dev/SKILL.md` | modify | BG1 | 更新 TDD/executor subagent 上下文注入，增加接口签名传递 |
| `skills/xyz-harness-phase-test/SKILL.md` | modify | BG1 | 更新 Phase 4 集成测试执行，增加 data_flows 消费说明 |
| `skills/xyz-harness-expert-reviewer/SKILL.md` | modify | BG1 | 新增接口契约审查维度（模式一 plan review） |
| `skills/xyz-harness-gate/scripts/check_gate.py` | modify | BG2 | Phase 2 新增 interface_chain.json schema 校验 + complexity frontmatter 检查 |

---

## Spec Metrics Traceability

| Spec AC | 采纳状态 | 对应 Task |
|---------|---------|----------|
| AC-1: interface_chain.json schema 校验通过 | adopted | Task 2 (gate-check.py L2 校验) |
| AC-2: L1 plan 不强制 interface_chain.json | adopted | Task 2 (gate-check.py 条件分支) |
| AC-3: plan.md 接口签名表存在 | adopted | Task 1 (writing-plans skill 新增章节) |
| AC-4: AC 覆盖矩阵无 GAP | adopted | Task 1 (writing-plans skill 新增矩阵模板) |
| AC-5: cross-reference 校验通过 | adopted | Task 4 (expert-reviewer 新增检查) |
| AC-6: plan.md 与 JSON 一致 | adopted | Task 4 (expert-reviewer 新增一致性检查) |
| AC-7: TDD subagent 消费接口签名 | adopted | Task 3 (phase-dev 更新) |
| AC-8: complexity frontmatter 存在 | adopted | Task 1 + Task 2 |

---

## Task List

| # | Task | Type | Depends on | Group |
|---|------|------|-----------|-------|
| 1 | writing-plans skill: 新增 Interface Contracts 章节 | backend | — | BG1 |
| 2 | gate-check.py: Phase 2 新增 interface_chain.json 校验 | backend | — | BG2 |
| 3 | phase-dev skill: TDD/executor subagent 消费接口签名 | backend | 1 | BG1 |
| 4 | expert-reviewer skill: 新增接口契约审查维度 | backend | 1 | BG1 |
| 5 | phase-test skill: 集成测试消费 data_flows | backend | 1 | BG1 |

---

## Interface Contracts

### Module: harness-gate

#### Class: check_gate.py (Phase 2 新增检查函数)

| Method | Signature | Returns | Edge Cases | Spec Ref |
|--------|-----------|---------|------------|----------|
| check_interface_chain | (topic_dir: str, plan_data: dict) -> list[tuple] | list of (name, status, detail) | L1 plan 无 JSON 文件、JSON 字段缺失、methods/data_flows 为空 | AC-1, AC-2, AC-8 |

### Module: writing-plans-skill

#### 新增章节: Interface Contracts

| Section | Content | Spec Ref |
|---------|---------|----------|
| Interface Contract Design | 方法签名表模板 + 数据模型表模板 + AC 覆盖矩阵模板 + interface_chain.json 产出指引 | AC-3, AC-4 |
| L1/L2 Rules | complexity frontmatter 说明 + 分级要求表 | AC-8 |
| "禁止实现代码"豁免 | 接口签名是设计契约，不受"禁止实现代码"规则限制 | FR-4 |

### Module: phase-dev-skill

#### 新增上下文注入规则

| Rule | Content | Spec Ref |
|------|---------|----------|
| L2 path | 从 interface_chain.json 提取当前 Task methods 片段 | AC-7 |
| L1 path | 从 plan.md markdown 接口签名表提取方法签名 | AC-7 |
| 最低传递标准 | 方法名 + 参数类型列表 + 返回类型 | AC-7 |

### Module: phase-test-skill

#### 新增 Phase 4 消费规则

| Rule | Content | Spec Ref |
|------|---------|----------|
| L2 data_flows 消费 | 集成测试覆盖 data_flows 中所有调用链 | FR-7 |

### Module: expert-reviewer-skill

#### 新增审查维度（模式一）

| Check | Content | Spec Ref |
|--------|---------|----------|
| plan.md ↔ JSON 一致性 | 方法签名、参数类型、返回值 | AC-6 |
| data_flows cross-reference | chain 中方法名存在于 methods 表 | AC-5 |
| AC 覆盖矩阵完整性 | adopted AC 全部覆盖 | AC-4 |

---

## Spec Coverage Matrix

| Spec AC | Interface Method / Section | Data Flow | Task |
|---------|---------------------------|-----------|------|
| AC-1 | check_interface_chain (L2 schema 校验) | gate-check → plan.md frontmatter | Task 2 |
| AC-2 | check_interface_chain (L1 skip 分支) | gate-check → plan.md frontmatter | Task 2 |
| AC-3 | Interface Contracts chapter (writing-plans) | — | Task 1 |
| AC-4 | Spec Coverage Matrix section (writing-plans) | — | Task 1 |
| AC-5 | cross-reference check (expert-reviewer) | — | Task 4 |
| AC-6 | consistency check (expert-reviewer) | — | Task 4 |
| AC-7 | L1/L2 context injection (phase-dev) | — | Task 3 |
| AC-8 | complexity frontmatter (writing-plans + gate-check) | — | Task 1, Task 2 |

---

## Execution Groups

#### BG1: Skill 文档更新（writing-plans + phase-dev + phase-test + expert-reviewer）

**Description:** 四个 skill 文档的增量更新，都是纯 Markdown 追加/修改，无代码逻辑依赖。

**Tasks:** Task 1, Task 3, Task 4, Task 5

**Files (预估):** 4 个文件（4 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose → general-purpose |
| Model | 按 taskComplexity 自动选择（medium） |
| 注入上下文 | spec.md FR-1~FR-8、AC-1~AC-8、Decisions Made；current SKILL.md 内容 |
| 读取文件 | 4 个待修改 skill 文件 |
| 修改/创建文件 | 4 个 skill SKILL.md 文件 |

**Execution Flow (BG1 内部):** 串行派遣，每个 Task 走完整 subagent 链后再开始下一个 Task。

  Task 1 (writing-plans skill):
    1. general-purpose (read spec.md + current writing-plans SKILL.md) → 在合适位置插入 Interface Contracts 章节
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

  Task 3 (phase-dev skill, depends on Task 1):
    1. general-purpose (read spec.md FR-6 + current phase-dev SKILL.md) → 新增接口签名消费规则
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

  Task 4 (expert-reviewer skill, depends on Task 1):
    1. general-purpose (read spec.md FR-5 GL2 + current expert-reviewer SKILL.md) → 新增接口契约审查维度
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

  Task 5 (phase-test skill, depends on Task 1):
    1. general-purpose (read spec.md FR-7 + current phase-test SKILL.md) → 新增 data_flows 消费规则
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

**Dependencies:** 无

#### BG2: Gate 脚本更新（check_gate.py）

**Description:** gate-check.py 的 Phase 2 检查函数新增 interface_chain.json schema 校验和 complexity frontmatter 检查。

**Tasks:** Task 2

**Files (预估):** 1 个文件（1 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose → general-purpose |
| Model | 按 taskComplexity 自动选择（high — Python 代码修改需要精确性） |
| 注入上下文 | spec.md FR-1 (JSON schema) + FR-3 (L1/L2 分级) + FR-5 (GL1 检查项) + AC-1 + AC-2 + AC-8 + Constraints (向后兼容) |
| 读取文件 | skills/xyz-harness-gate/scripts/check_gate.py |
| 修改/创建文件 | skills/xyz-harness-gate/scripts/check_gate.py |

**Execution Flow (BG2 内部):** 单 Task，走 subagent 链。

  Task 2:
    1. general-purpose (read spec.md FR-5 + current check_gate.py) → 新增 check_interface_chain 函数 + 修改 check_phase_2
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

**Dependencies:** 无（与 BG1 独立）

---

## Dependency Graph & Wave Schedule

```
  BG1 (skill docs) ──────┐
                         ├──→ [完成]
  BG2 (gate-check.py) ───┘
```

| Wave | Groups | 说明 |
|------|--------|------|
| Wave 1 | BG1, BG2 | 两个 Group 无依赖，可并行执行 |

---

### Task 1: writing-plans skill — 新增 Interface Contracts 章节

**Type:** backend

**Files:**
- Modify: `skills/xyz-harness-writing-plans/SKILL.md`

**What to change:**

1. **在 "禁止实现代码" 规则附近新增豁免说明**（如果存在该规则的话）：接口签名是设计契约（方法名 + 参数类型 + 返回类型），不是实现代码。接口签名表中的方法签名、数据模型字段定义不受"禁止实现代码"规则限制。

2. **在 File Structure 章节之后、Task Structure 之前，新增 "Interface Contracts" 章节**：

   内容包含：
   - **目的说明**：接口契约填补 plan 和 code 之间的设计空白，防止 AC 遗漏和逻辑断裂
   - **L1/L2 分级规则表**（直接引用 spec FR-3 的分级表）
   - **plan.md frontmatter 更新**：新增 `complexity: "L1"` 或 `"L2"` 字段
   - **方法签名表模板**（markdown 表格，按模块分组）
   - **数据模型字段表模板**（自定义类型的字段定义）
   - **AC 覆盖矩阵模板**（强制章节，任何 GAP 必须解决或标记 POSTPONED）
   - **interface_chain.json 产出指引**（L2 强制，引用 spec FR-1 的 JSON schema）
   - **粒度边界**（引用 spec FR-4：公有方法 + 数据模型字段，不含私有方法/工具类/框架代码）

3. **在 Spec Metrics Traceability 章节中补充说明**：AC 覆盖矩阵与 Spec Metrics Traceability 的关系——前者追踪 AC→Method→Task 映射，后者追踪 AC→Task 采纳状态。两者互补，不重复。

- [ ] **Step 1: Read current writing-plans SKILL.md**
- [ ] **Step 2: 确定插入位置**（File Structure 之后）
- [ ] **Step 3: 编写 Interface Contracts 章节内容**
- [ ] **Step 4: 添加 complexity frontmatter 说明**
- [ ] **Step 5: 验证 YAML frontmatter 格式正确**
- [ ] **Step 6: Commit**

---

### Task 2: gate-check.py — Phase 2 新增 interface_chain.json 校验

**Type:** backend

**Files:**
- Modify: `skills/xyz-harness-gate/scripts/check_gate.py`

**What to change:**

1. **在 `check_phase_2` 函数中新增检查项**：

   a. **检查 plan.md 的 complexity frontmatter**：
      - `complexity` 字段必须存在，值为 `"L1"` 或 `"L2"`
      - 如果 `complexity` 不存在（向后兼容），不报错，跳过 interface_chain.json 检查

   b. **当 `complexity: "L2"` 时，检查 interface_chain.json**：
      - 文件存在于 topic 目录下
      - JSON 合法（`json.load()` 不抛异常）
      - `version` 字段存在且为 string
      - `methods` 数组存在且非空
      - `data_flows` 数组存在且非空
      - 每个 method 至少包含 `name`、`class`、`params`、`returns` 字段
      - 每个 data_flow 至少包含 `id`、`chain` 字段，`chain` 非空

   c. **当 `complexity: "L1"` 时**：不检查 interface_chain.json

2. **实现方式**：新增独立函数 `check_interface_chain_schema(topic_dir)` 返回 checks 列表，在 `check_phase_2` 中调用。

- [ ] **Step 1: Read current check_gate.py**
- [ ] **Step 2: 实现 check_interface_chain_schema 函数**
- [ ] **Step 3: 修改 check_phase_2 函数，新增 complexity 和 interface_chain 检查**
- [ ] **Step 4: 测试向后兼容（plan.md 无 complexity 字段时不报错）**
- [ ] **Step 5: 测试 L2 场景（有 interface_chain.json 时通过）**
- [ ] **Step 6: 测试 L2 场景（interface_chain.json 缺失时 FAIL）**
- [ ] **Step 7: Commit**

---

### Task 3: phase-dev skill — TDD/executor subagent 消费接口签名

**Type:** backend

**Files:**
- Modify: `skills/xyz-harness-phase-dev/SKILL.md`

**What to change:**

1. **在 subagent dispatch 相关章节中新增接口签名传递规则**：

   a. **L2 plan 路径**：主 agent 从 `interface_chain.json` 中提取当前 Task 涉及的方法。提取方式：根据 Task 描述中涉及的 class 名，从 JSON methods 数组中过滤匹配的 method，将 (name, params, returns, edge_cases) 整理为结构化文本，注入 task prompt。

   b. **L1 plan 路径**：主 agent read plan.md 的 Interface Contracts 章节，解析当前 Task 涉及的模块对应的 markdown 表格，提取方法签名。

   c. **最低传递标准**：task prompt 至少包含方法名、参数类型列表、返回类型。edge_cases 为可选附加信息。

2. **在 executor subagent 的上下文注入说明中增加**：实现代码的方法签名应与接口契约对齐。如有偏差，需记录 interface_deviations。

- [ ] **Step 1: Read current phase-dev SKILL.md**
- [ ] **Step 2: 找到 subagent dispatch 相关章节**
- [ ] **Step 3: 新增 L2/L1 双路径接口签名传递规则**
- [ ] **Step 4: 新增最低传递标准说明**
- [ ] **Step 5: 新增 interface_deviations 记录说明**
- [ ] **Step 6: Commit**

---

### Task 4: expert-reviewer skill — 新增接口契约审查维度

**Type:** backend

**Files:**
- Modify: `skills/xyz-harness-expert-reviewer/SKILL.md`

**What to change:**

1. **在「模式一：计划评审」章节中新增接口契约检查项**（仅在 L2 plan 时启用）：

   a. **plan.md ↔ interface_chain.json 一致性**：方法名、参数类型、返回值在两处是否一致。如不一致，标记 must_fix。

   b. **data_flows cross-reference**：data_flows[].chain 中的每个方法名是否存在于 methods[] 表中。如有悬空引用，标记 must_fix。

   c. **AC 覆盖矩阵完整性**：spec 中所有 adopted AC 是否在矩阵中有对应行。如有遗漏，标记 must_fix。

   d. **类型传递一致性**（可选，建议检查）：data_flows chain 中相邻方法的输出/输入类型是否兼容。

- [ ] **Step 1: Read current expert-reviewer SKILL.md**
- [ ] **Step 2: 找到模式一章节**
- [ ] **Step 3: 新增接口契约检查项（plan.md 接口表存在性、JSON一致性、cross-reference、AC覆盖）**
- [ ] **Step 4: 标注 L2 条件判断（L1 plan 不触发这些检查）**
- [ ] **Step 5: Commit**

---

### Task 5: phase-test skill — 集成测试消费 data_flows

**Type:** backend

**Files:**
- Modify: `skills/xyz-harness-phase-test/SKILL.md`

**What to change:**

1. **在 Phase 4 执行步骤中新增 data_flows 消费规则**（仅 L2 plan）：

   a. 当 interface_chain.json 存在时，读取 data_flows 数组。
   b. 集成测试验证应覆盖每条 data_flow 的完整调用链。
   c. 验证方式：相邻方法之间的数据传递正确性（输出类型匹配输入类型）。
   d. 不改 test_cases_template.json schema。

- [ ] **Step 1: Read current phase-test SKILL.md**
- [ ] **Step 2: 找到集成测试执行相关章节**
- [ ] **Step 3: 新增 data_flows 消费规则**
- [ ] **Step 4: 标注 L2 条件**
- [ ] **Step 5: Commit**
