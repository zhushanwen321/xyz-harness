---
verdict: pass
complexity: L1
---

# P0 Spec Verification + Subagent Prompt Standardization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use xyz-harness-subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强 brainstorming 和 subagent-driven-development 两个 skill 文件，消除 spec 阶段代码假设错误和 subagent 产出质量问题。

**Architecture:** 在现有 skill 流程中嵌入 3 个轻量检查机制（Assumption Audit、Pre-Dispatch Checklist、Prohibition Block），不增加独立 Step，不改 gate 和 coding-workflow 扩展。

**Tech Stack:** Markdown (skill 文档)

---

## File Structure

| File | Type | Group | Description |
|------|------|-------|-------------|
| `skills/xyz-harness-brainstorming/SKILL.md` | modify | BG1 | 增加 Assumption Audit (Step 5a) + 增强 Self-Check Checklist |
| `skills/xyz-harness-subagent-driven-development/SKILL.md` | modify | BG2 | 增加 Pre-Dispatch Checklist + Prohibition Block + Post-Dispatch Verification + 并行依赖安全检查 |

## Task List

| # | Task | Type | Depends on | Group |
|---|------|------|-----------|-------|
| 1 | brainstorming skill: 增加Assumption Audit (Step 5a) | backend | — | BG1 |
| 2 | brainstorming skill: 增强 Self-Check Checklist | backend | 1 | BG1 |
| 3 | subagent skill: 增加 Pre-Dispatch Checklist | backend | — | BG2 |
| 4 | subagent skill: 增加 Prohibition Block | backend | 3 | BG2 |
| 5 | subagent skill: 增加 Post-Dispatch Verification | backend | 3 | BG2 |
| 6 | subagent skill: 增加并行 Task 依赖安全检查 | backend | 3 | BG2 |

## Execution Groups

#### BG1: brainstorming skill 增强

**Description:** 在 brainstorming skill 中嵌入 Assumption Audit 和增强 Self-Check，消除 spec 阶段的代码假设错误。

**Tasks:** Task 1, Task 2

**Files (预估):** 1 个文件（1 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose → general-purpose → general-purpose |
| Model | 按 taskComplexity 自动选择（executor: medium） |
| 注入上下文 | Task 描述 + spec FR-1/FR-2 + 当前 skill 内容 |
| 读取文件 | `skills/xyz-harness-brainstorming/SKILL.md` |
| 修改/创建文件 | `skills/xyz-harness-brainstorming/SKILL.md` |

**Execution Flow (BG1 内部):** 串行派遣。

  Task 1 (Assumption Audit):
    1. general-purpose (read xyz-harness-test-driven-development + xyz-harness-backend-dev) → 无需 TDD（修改 markdown 文档）
    2. general-purpose → 修改 SKILL.md
    3. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

  Task 2 (Self-Check 增强, depends on Task 1):
    1. general-purpose → 修改 SKILL.md Self-Check 部分
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

**Dependencies:** 无

**设计细节:**

Task 1 插入位置：在 `## After the Design` 章节（约第 211 行）**之前**，插入新的 `### Step 5a: Assumption Audit` 章节。

插入内容要点：
1. 章节标题：`### Step 5a: Assumption Audit（嵌入 Step 5）`
2. 触发时机：用户确认设计后、写 spec 前
3. 执行步骤：
   - 从用户确认的设计中提取所有对现有代码的假设
   - 对每个假设执行代码验证（grep/read）
   - 验证通过 → `[VERIFIED]`；失败 → 修正设计或与用户确认；无法验证 → `[UNVERIFIED]`
4. 假设类型清单：
   - 接口/API/RPC 存在性验证
   - 类型定义/枚举值一致性验证
   - DB 字段/API 响应体真实性验证
   - 前端组件现有职责分工验证
5. grep 命令模板：
   - `grep -rn "function\|export\|interface\|type" {file}` — 接口签名
   - `grep -rn "enum\|const.*=" {file}` — 枚举/常量值
   - `grep -rn "{field_name}" {model_file}` — DB 字段

同时需要在 Checklist（第 31 行附近）的 Step 5 描述中追加引用 Step 5a：
```
5. **Write design doc** — ...（先执行 Step 5a Assumption Audit）
```

以及 Process Flow dot 图中，在 `"Write design doc"` 之前插入 `"Assumption Audit"` 节点。

Task 2 插入位置：在 `## Self-Check Checklist` 章节（约第 521 行）的 `### 数据模型预检` 之后，追加新的 `### 代码假设验证` 区块。

插入内容要点：
```
### 代码假设验证
- [ ] spec 中引用的每个接口/RPC，是否 grep 确认存在？
  ```bash
  grep -rn "interface_name\|rpc_method" src/
  ```
- [ ] spec 中引用的枚举值/常量，是否从代码提取而非凭记忆？
  ```bash
  grep -rn "enum\s*\w*\s*{" src/ --include="*.ts"
  ```
- [ ] 前端 FR 涉及的组件职责分工，是否扫描现有代码确认？
  ```bash
  grep -rn "export.*component\|export.*defineComponent" src/components/
  ```
- [ ] 后端 FR 涉及的 DB/API 字段，是否 grep 确认字段名和类型？
- [ ] 是否存在 `[UNVERIFIED]` 标记未与用户确认？
```

#### BG2: subagent-driven-development skill 增强

**Description:** 在 subagent-driven-development skill 中嵌入 Pre-Dispatch Checklist、Prohibition Block、Post-Dispatch Verification 和并行依赖安全检查。

**Tasks:** Task 3, Task 4, Task 5, Task 6

**Files (预估):** 1 个文件（1 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose → general-purpose → general-purpose |
| Model | 按 taskComplexity 自动选择（executor: medium） |
| 注入上下文 | Task 描述 + spec FR-3/FR-4/FR-5/FR-6 + 当前 skill 内容 |
| 读取文件 | `skills/xyz-harness-subagent-driven-development/SKILL.md` |
| 修改/创建文件 | `skills/xyz-harness-subagent-driven-development/SKILL.md` |

**Execution Flow (BG2 内部):** 串行派遣。

  Task 3 (Pre-Dispatch Checklist):
    1. general-purpose → 修改 SKILL.md
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

  Task 4 (Prohibition Block, depends on Task 3):
    1. general-purpose → 修改 SKILL.md
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

  Task 5 (Post-Dispatch Verification, depends on Task 3):
    1. general-purpose → 修改 SKILL.md
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

  Task 6 (并行依赖安全, depends on Task 3):
    1. general-purpose → 修改 SKILL.md
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

**Dependencies:** 无

**设计细节:**

Task 3 插入位置：在 `## Task Prompt 验收标准规则` 章节（第 475 行）**之前**，插入 `## Pre-Dispatch Checklist` 章节。

插入内容要点：
1. 章节标题：`## Pre-Dispatch Checklist`
2. 强制性声明：主 agent 每次派遣 subagent 前必须确认以下 5 项信息已在 task prompt 中
3. 必填项表格：

| 必填项 | 说明 | 来源 |
|--------|------|------|
| 完整方法签名 | 从代码 grep 提取 | `grep -n "function\|interface\|type\|export" {file}` |
| 实际枚举值/import 路径 | 从代码提取 | `grep -n "enum\|const.*=" {file}` |
| 已知约束 | null guard、错误处理、并发模型 | spec + plan |
| 禁止事项 | 标准 6 条禁止清单（见 Prohibition Block） | 固定模板 |
| 必须产出的文件列表 | 完成后校验 | plan task 描述 |

4. 底线声明：`**不满足任一项 → 禁止派遣，必须先补充信息。**`

Task 4 插入位置：紧跟 `## Pre-Dispatch Checklist` 之后，插入 `## Prohibition Block（标准禁止事项）` 章节。

插入内容：固定 6 条禁止事项文本块（与 spec FR-4 一致），说明主 agent 每次构造 task prompt 时必须在末尾附加此块。

Task 5 插入位置：在 `## Red Flags` 章节（第 405 行）**之前**，插入 `## Post-Dispatch Verification` 章节。

插入内容要点：
1. subagent 返回后，主 agent 执行 3 步验证
2. 文件存在性检查：`ls` 验证 task prompt 中列出的文件
3. 编译检查：`npx tsc --noEmit`（如适用）
4. 测试检查：`npx vitest run`（如适用，仅验证 subagent 产出的测试）
5. 验证失败 → 产出不可信，修复或重新派遣

Task 6 插入位置：在 `### Wave 模式` 章节（第 140 行）的伪代码块之前，插入并行依赖安全检查逻辑。

插入内容要点：
1. 在 Wave 派遣前，主 agent 必须扫描同一 Wave 内 Group 间的接口依赖
2. 同 Wave 内不允许存在接口依赖（一个 Task 引用另一个 Task 产出的函数/类型）
3. 如存在依赖 → 拆到不同 Wave（被依赖方在前）
4. 在 Wave 伪代码块之前增加依赖扫描步骤

## Dependency Graph & Wave Schedule

BG1 (brainstorming skill) 和 BG2 (subagent skill) 无依赖，可并行。

```
BG1 ─┐
     ├──→ 完成
BG2 ─┘

| Wave | Groups | 说明 |
|------|--------|------|
| Wave 1 | BG1, BG2 | 两个 skill 文件修改互相独立，可并行 |
```

## Interface Contracts

### Module: brainstorming skill

无类/方法接口。修改是 markdown 文档层面的章节插入，接口契约不适用（纯文档修改）。

### Module: subagent skill

无类/方法接口。同上。

**L1 声明：** 本需求为纯 markdown 文档修改，不涉及代码接口。interface_chain.json 不产出。AC 覆盖通过 Task 列表直接追踪。

## Spec Coverage Matrix

| Spec AC | Interface Method | Data Flow | Task |
|---------|-----------------|-----------|------|
| AC-1: Assumption Audit 可执行 | N/A (文档修改) | Step 5a 章节嵌入 | Task 1 |
| AC-2: Self-Check Checklist 增强 | N/A (文档修改) | 代码假设验证区块追加 | Task 2 |
| AC-3: Pre-Dispatch Checklist 强制执行 | N/A (文档修改) | 新章节 + 5 项必填表 | Task 3 |
| AC-4: Prohibition Block 自动注入 | N/A (文档修改) | 固定 6 条禁止文本 | Task 4 |
| AC-5: Post-Dispatch Verification 可执行 | N/A (文档修改) | 3 步验证流程 | Task 5 |
| AC-6: 并行依赖安全 | N/A (文档修改) | Wave 前依赖扫描 | Task 6 |

无 GAP。

## Spec Metrics Traceability

| Spec 指标 | 采纳状态 | 对应 Task |
|-----------|---------|----------|
| AC-1 Assumption Audit 可执行 | adopted | Task 1 |
| AC-2 Self-Check Checklist 增强 | adopted | Task 2 |
| AC-3 Pre-Dispatch Checklist 强制 | adopted | Task 3 |
| AC-4 Prohibition Block 注入 | adopted | Task 4 |
| AC-5 Post-Dispatch Verification | adopted | Task 5 |
| AC-6 并行依赖安全 | adopted | Task 6 |
