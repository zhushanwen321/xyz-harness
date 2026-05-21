---
description: "需求沟通阶段追踪（Claude Code 兼容）。8 步固定流程：讨论→Spec→Spec评审→Plan→Plan评审→E2E测试计划→E2E评审→确认。"
allowed-tools: ["read", "edit", "write", "bash", "subagent", "todolist"]
---

# 需求沟通阶段 — Track 模式

你正在执行固定的 8 步需求沟通流程。你的产出将交付给另一个 agent（Phase 2）执行开发。

**核心原则：所有文档必须自包含、详细。另一个 agent 不会继承你的会话上下文。你的文档就是对方的「完整指令集」——不是补充参考，而是唯一的信息源。**

## 固定步骤（按序执行，不可跳步）

使用 todolist 管理以下步骤（start 初始化 → complete_step 逐步标记）：

---

### Stage 1：需求讨论

**类型：交互（主 agent 直接执行）**
**加载 Skill：xyz-harness-brainstorming**

与用户讨论需求，澄清目标、范围、约束。逐一提问确认。执行 brainstorming skill 的讨论流程。

**完成标志**：用户需求已澄清，没有未解决的疑问。

**完成后引导**：
```
Stage 1 需求讨论完成。接下来进入 Stage 2：Spec 编写。
我将基于讨论结果编写 spec.md，包含完整的六要素和必填章节。
```
→ `todolist complete_step(1)`

---

### Stage 2：Spec 编写 + 六要素检查 + 引用扫描

**类型：交互（主 agent 直接执行）**
**加载 Skill：xyz-harness-brainstorming（spec completeness check 部分）**

编写 spec.md，执行以下子步骤（使用 `todolist expand_step` 管理）：

1. **编写 spec.md** — 包含：目标、架构决策、验收标准(AC)、数据流(如涉及)、受影响文件列表、已做决策、行为约束、已有基础设施。**每个文件路径必须从项目根开始写完整，每个函数/接口必须写明签名和位置。你的文档是给另一个 agent 的完整指令——不要假设对方知道你在说什么。**
2. **六要素完整性检查** — 逐一检查 Outcomes/Scope/Constraints/Decisions/Verification/已有基础设施是否覆盖。
3. **歧义扫描** — 扫描全文，将模糊描述标记为 `[AMBIGUOUS]`，逐一与用户确认解决。
4. **引用扫描** — 运行 `spec-ref-scan.sh` 验证引用完整性。脚本位置：Pi 环境为 `~/.pi/agent/skills/xyz-harness-dev-flow/scripts/spec-ref-scan.sh`，项目内为 `skills/xyz-harness-dev-flow/scripts/spec-ref-scan.sh`（优先项目内，不存在时用全局路径）。命令：`bash {脚本路径} <project_root> <spec_path>`。有问题则修复 spec 后重新扫描。

**完成标志**：spec.md 已写入产出目录，六要素检查通过，引用扫描通过，无未解决的 [AMBIGUOUS]。

**同时**：初始化 `changes/summary.md`，记录流程开始时间和当前步骤状态。

**完成后引导**：
```
Stage 2 Spec 编写完成。产出物：{spec.md 路径}

接下来进入 Stage 3：Spec 独立评审。
正在派遣 harness-spec-reviewer subagent 对 spec.md 进行独立评审...
```
→ `todolist complete_step(2)`

---

### Stage 3：Spec 评审

**类型：自动（派遣 subagent）**
**Agent：harness-spec-reviewer**

派遣 `harness-spec-reviewer` subagent 独立评审 spec.md。

| 项目 | 值 |
|------|---|
| Agent | harness-spec-reviewer |
| 模型 | llm-simple-router/glm-5.1 |
| 输入 | spec.md 路径 + 项目根目录 + 产出目录 + review_round=1 |

评审重点：六要素完整性、自包含性、必填章节覆盖、引用完整性、歧义标记、验收标准可量化性。

**通过标准**：评审报告中无未解决的 MUST FIX。

**不通过处理**：
- MUST FIX 列表 → 主 agent 修复 spec.md → 重新运行引用扫描 → 重新派遣 reviewer（最多 2 轮）
- 2 轮后仍不通过 → 向用户展示问题，请求决策

**完成标志**：评审通过（无 MUST FIX），评审报告已写入 `changes/reviews/spec_review_v{N}.md`。

**完成后引导**：
```
Stage 3 Spec 评审通过。评审报告：{报告路径}

接下来进入 Stage 4：Plan 编写。
我将基于已通过的 spec.md 编写实现计划。
```
→ `todolist complete_step(3)`

---

### Stage 4：Plan 编写

**类型：交互（主 agent 直接执行，L2 时并行派遣 planner subagent）**
**加载 Skill：xyz-harness-writing-plans**

编写 plan.md。执行以下子步骤：

1. **评估复杂度等级（L1/L2）** — 5 个维度（领域/存储/数据流/API/非功能性），任一命中 L2 则整体 L2
2. **编写 plan.md 总纲** — Task 拆分（每个 Task 标注 type: frontend/backend）、**Execution Groups 分组**（BG*/FG*，每组含 subagent 配置：agent、model、上下文、读写文件）、**Wave Schedule 编排**（组间依赖和执行顺序）。涉及文件。**每个 Task 必须有足够的上文——要改什么、怎么改、为什么改。对方没有你的对话历史。每个 Task 必须包含：描述、验收标准、文件变更表、风险点。**
3. **L2 额外步骤**（如适用）：
   - 并行派遣 `harness-backend-planner` 和 `harness-frontend-planner`
   - 完成后派遣 `harness-api-alignment` 进行前后端对齐
   - 汇总更新 plan.md 总纲

**完成标志**：plan.md 已写入产出目录，包含 Execution Groups 和 Wave Schedule。L2 时所有子文档就绪，Groups 引用子文档章节。

**完成后引导**：
```
Stage 4 Plan 编写完成。产出物：{plan.md 路径}[L2 时：+ plan-backend.md + plan-frontend.md + plan-api-contract.md]

接下来进入 Stage 5：Plan 评审。
正在派遣 reviewer subagent 对 plan 进行独立评审...
```
→ `todolist complete_step(4)`

---

### Stage 5：Plan 评审

**类型：自动（派遣 subagent）**

根据复杂度等级选择评审策略：

**L1 复杂度（单文件 plan.md）：**

| 项目 | 值 |
|------|---|
| Agent | harness-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer（计划评审模式） |
| 输入 | spec.md + plan.md + 项目根目录 |

> **注意**：spec 完整性已在 Stage 3（Spec 评审）由 harness-spec-reviewer 独立检查。Stage 5 的 harness-reviewer 应跳过 spec 完整性检查，只关注：plan 可行性（任务拆分/依赖/工作量）和 spec-plan 一致性（plan 是否覆盖 spec 所有需求）。派遣时在 task 中明确说明"跳过 spec 完整性检查，只检查 plan 可行性和一致性"。

**L2 复杂度（并行评审）：**

同时派遣三个评审 subagent：

| 角色 | Agent | 输入 |
|------|-------|------|
| 后端设计评审 | harness-backend-plan-reviewer | spec.md + plan-backend.md + plan-api-contract.md + 项目根目录 |
| 前端设计评审 | harness-frontend-plan-reviewer | spec.md + plan-frontend.md + plan.md 总纲 + 项目根目录 |
| 整体评审 | harness-reviewer（加载 xyz-harness-expert-reviewer 计划评审模式） | spec.md + plan.md + 项目根目录 |

三个评审并行执行。主 agent 收集结果后汇总所有 MUST FIX。

**通过标准**：所有评审报告中无未解决的 MUST FIX。评审轮次 ≤ 3。

**不通过处理**：
- MUST FIX 列表 → 主 agent 修复 plan/子文档 → 重新派遣 reviewer（最多 3 轮）
- 3 轮后仍不通过 → 向用户展示问题，请求决策

**完成标志**：所有评审通过，评审报告已写入 `changes/reviews/plan_review_v{N}.md`。

**完成后引导**：
```
Stage 5 Plan 评审通过。评审报告：{报告路径}

接下来进入 Stage 6：E2E 测试计划编写。
我将基于 spec.md + plan.md 编写端到端测试计划。
```
→ `todolist complete_step(5)`

---

### Stage 6：E2E 测试计划编写

**类型：主 agent 编写框架 + subagent 分组生成用例**
**加载 Skill：xyz-harness-e2e-test-plan**

基于 spec.md + plan.md 编写 e2e-test-plan.md。执行以下子步骤：

1. **主 agent 编写整体方案** — 测试概览、环境配置、分组策略、依赖关系图
2. **为每个测试组配置 Subagent** — 每组包含 agent（harness-e2e-tester）、model、注入上下文、读写文件
3. **编排串行执行调度** — 测试组严格串行执行，定义执行顺序和依赖
4. **subagent 分组生成具体用例** — 每组用例由一个 subagent 生成（并行度 ≤ 3）
5. **汇总** — 合并所有分组用例到 e2e-test-plan.md

**完成标志**：e2e-test-plan.md 已写入产出目录，包含完整的环境配置、分组（含 Subagent 配置）、串行执行调度、用例和验证方法。

**完成后引导**：
```
Stage 6 E2E 测试计划编写完成。产出物：{e2e-test-plan.md 路径}

接下来进入 Stage 7：E2E 测试计划评审。
正在派遣 harness-e2e-test-plan-reviewer subagent 进行独立评审...
```
→ `todolist complete_step(6)`

---

### Stage 7：E2E 测试计划评审

**类型：自动（派遣 subagent）**
**Agent：harness-e2e-test-plan-reviewer**

派遣 `harness-e2e-test-plan-reviewer` subagent 独立评审 e2e-test-plan.md。

| 项目 | 值 |
|------|---|
| Agent | harness-e2e-test-plan-reviewer |
| 模型 | llm-simple-router/glm-5.1 |
| 输入 | spec.md + e2e-test-plan.md + plan.md + 项目根目录 + 产出目录 + review_round=1 |

评审重点：spec AC 覆盖矩阵、四层验证策略合理性、步骤可执行性、依赖关系正确性、测试环境配置、前端元素定位策略。

**通过标准**：评审报告中无未解决的 MUST FIX。

**不通过处理**：
- MUST FIX 列表 → 主 agent 修复 e2e-test-plan.md → 重新派遣 reviewer（最多 2 轮）
- 2 轮后仍不通过 → 向用户展示问题，请求决策

**完成标志**：评审通过，评审报告已写入 `changes/reviews/e2e_test_plan_review_v{N}.md`。

**完成后引导**：
```
Stage 7 E2E 测试计划评审通过。评审报告：{报告路径}

接下来进入 Stage 8：用户最终确认。
```
→ `todolist complete_step(7)`

---

### Stage 8：用户确认

**类型：交互（强制暂停）**

向用户展示最终 spec、plan 和 e2e-test-plan。

**确认前自包含检查**：另一个 agent 能否单凭 spec.md + plan.md + e2e-test-plan.md + 代码库完成实现？如果某个文件/函数被引用但路径不完整，补充完整后再提交确认。

**确认展示**：
```
Phase 1 全部完成。产出物：
- spec.md: {路径}
- plan.md: {路径}
- e2e-test-plan.md: {路径}
- 评审记录：{reviews 目录路径}

请确认：
1. 确认 — 输出 Phase 2 启动提示词
2. 有修改意见 — 告诉我改什么
3. 方向不对 — 重新讨论
```

**确认后**：按 `references/phase2-launch-template.md` 模板生成 Phase 2 启动提示词（见下方）。

**流转规则**：
- 确认 → 输出 Phase 2 启动提示词
- 有修改意见 → 修复对应文档 → 按修改范围决定回退点：
  - **spec 改动**（任何修改）→ 回退到 Stage 3（Spec 评审），重新走 3→4→5→6→7
  - **plan 改动**（任何修改）→ 回退到 Stage 5（Plan 评审），重新走 5→6→7
  - **e2e-test-plan 改动**（任何修改）→ 回退到 Stage 7（E2E 测试计划评审），重新走 7
  - 仅格式/拼写修正（不影响语义）→ 无需重新评审，直接重新确认
- 方向不对 → 回到 Stage 1

→ `todolist complete_step(8)`

---

## 产出目录

所有文档写入 `.xyz-harness/{yyyy-MM-dd}-{主题}/`，包含：
- `spec.md` — 需求设计文档
- `plan.md` — 实现计划
- `[plan-backend.md]` — 后端设计文档（L2 时）
- `[plan-frontend.md]` — 前端设计文档（L2 时）
- `[plan-api-contract.md]` — API 合约（L2 时）
- `e2e-test-plan.md` — 端到端测试计划
- `changes/summary.md` — 初始化的追溯文件
- `changes/reviews/spec_review_v{N}.md` — Spec 评审记录
- `changes/reviews/plan_review_v{N}.md` — Plan 评审记录
- `changes/reviews/e2e_test_plan_review_v{N}.md` — E2E 测试计划评审记录

## Phase 2 启动指令

Stage 8 用户确认通过后，**必须读取** `skills/xyz-harness-dev-flow/references/phase2-launch-template.md` 模板文件（绝对路径：`~/.pi/agent/skills/xyz-harness-dev-flow/references/phase2-launch-template.md`），按模板中的变量填充说明逐项替换 `{{变量}}`，然后将完整提示词输出给用户。

**输出格式：**

```
Phase 1 完成。产出物：
- spec.md: {路径}
- plan.md: {路径}
- e2e-test-plan.md: {路径}

请在新的 agent session 中执行以下提示词启动 Phase 2（开发交付）：

{按 phase2-launch-template.md 模板填充后的完整提示词}
```

**禁止：**
- 禁止自行精简或修改模板中的固定文本
- 禁止遗漏任何章节（包括看起来"理所当然"的章节）
- 禁止在模板之外添加额外内容

$ARGUMENTS
