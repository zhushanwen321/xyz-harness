---
description: "Phase 2 开发交付 — 基于 spec+plan 的 7 阶段 TDD+编码+审查+单元测试+E2E测试+推送+复盘流程。触发条件：用户说「Phase 2」「开发交付」「7 阶段流程」「开始开发」「继续开发需求」「基于 spec 和 plan」或 /loop 中包含这些关键词。此 skill 是旧 dev-flow 的精简版，仅描述 Phase 2 流程，不包含 Phase 1 的需求沟通。"
---

# Phase 2: 开发交付流程

你正处于 Phase 2（开发交付阶段）。Phase 1（需求沟通）已完成，你继承其产出文档。

**你不会继承 Phase 1 的会话上下文**。所有你需要的信息都在 spec.md 和 plan.md 中。
如果某份文档不完整，不要猜测——停止并报告给用户，要求补充文档。

**启动时先读取术语表**：`xyz-harness-dev-flow/references/glossary.md`，确保后续所有 subagent 派遣和用户交互使用统一术语。

## 核心原则

1. **spec + plan 是你的唯一指令集** — 按 plan.md 的 Task 顺序逐个实现
2. **TDD 优先** — 每个 Task 先写测试再实现，确保可验证
3. **门禁脚本强制执行** — 每个阶段完成后运行 `harness-state.sh advance → gate-script.sh → harness-state.sh pass`
4. **Phase 2 产出写回 Phase 1 目录** — 复盘和指标写入 Phase 1 的 `.xyz-harness/{topicDir}/` 下
5. **主 agent 禁码** — 主 agent 是调度器，不允许直接编写实现代码（禁止使用 edit/write 编写实现代码）。所有编码通过 subagent 完成。主 agent 只负责：派遣 subagent、追踪进度、运行门禁、git commit

## Phase 2 启动前置检查

在开始 7 阶段流程之前，必须验证 Phase 1 的产出物是否足够完整。如果 Phase 1 由另一个 agent/session 完成，这一步尤其关键。

### 必须检查（缺失则停止）

| 检查项 | 验证方式 | 缺失时 |
|--------|---------|--------|
| spec.md 存在且非空 | `wc -l` ≥ 50 行 | 停止，要求补充 |
| plan.md 存在且非空 | `wc -l` ≥ 30 行 | 停止，要求补充 |
| spec.md 有验收标准 | 搜索 "验收标准" 或 "AC" 或 "验收" | 停止，要求补充 |
| plan.md 有 Task 拆分 | 搜索 "## Task" | 停止，要求补充 |
| 每个 Task 有验收标准 | 每个 Task 下有 "验收标准" 段落 | 警告，建议补充 |

### 建议检查（缺失可继续但警告）

| 检查项 | 验证方式 | 缺失时 |
|--------|---------|--------|
| spec.md 有"已有基础设施"章节 | 搜索 "已有基础设施" 或 "可复用" | 警告：编码 agent 可能浪费时间重新发现已有代码 |
| spec.md 有"数据流"章节（涉及数据存储时） | 搜索 "数据流" | 警告：数据流可能不一致 |
| e2e-test-plan.md 存在 | 文件存在 | 跳过 Stage 4 E2E 测试 |
| plan.md 每个 Task 有"文件变更"表 | 搜索 "文件变更" | 警告：task 粒度可能不够 |
| plan.md 每个 Task 有"风险点" | 搜索 "风险点" | 警告：可能踩坑 |

### 执行方式

在读取 spec.md 和 plan.md 时，顺手做以上检查。如果必须检查项有缺失，向用户报告具体缺失项并停止。如果是建议检查项缺失，向用户报告警告但允许继续。

## 每轮恢复（/loop 模式）

Phase 2 使用 `/loop` 模式执行 7 个阶段。每轮开始时，**必须先读取 memory.md 恢复上下文**。

```
1. 读取 $TOPIC_DIR/changes/memory.md
2. 从中恢复：
   - 当前在哪个 Stage（如果 loop_task_tracker 还未创建，从 memory 推断）
   - 当前 plan Task 进度（todolist 管理的 task）
   - 已完成的关键决策和陷阱提醒
3. 继续从上次中断的位置执行
```

如果 memory.md 不存在或为空（第一轮），跳过此步骤正常启动。

## 7 阶段流程

### Stage 1: 编码实现

**两层追踪体系：**
- **粗粒度（loop_task_tracker）**：主 agent 管理 7 个 Stage 的流转
- **细粒度（todolist）**：Stage 1 内部管理 plan Task + subtask，以及 subagent 内部的多步骤流程

**关键规则：**
- `loop_task_tracker` 只由主 agent 使用，subagent 不能调用（否则会覆盖主 agent 的 Stage 列表）
- subagent 内部使用 `todolist`（自由任务模式）管理自己的多步骤流程
- 两者的 UI 展示：loop_task_tracker 在上方 widget，todolist 在下方 widget（belowEditor），形成上下分栏

> ⚠️ **硬约束：主 agent 禁止直接使用 edit/write 编写实现代码。**
> 主 agent 是纯调度器，只负责：派遣 subagent、追踪进度、运行门禁、git commit。
> 任何实现代码必须通过 subagent 完成。

---

#### Step 1: 创建 Stage 粒度追踪

调用 `loop_task_tracker create_tasks` 创建以下 7 个 Stage 粒度的 task：
```
1. 编码实现 (按 Execution Group 按波次完成)
2. 编码评审 (reviewer ≤2轮)
3. 单元测试编写 (Change-driven Testing)
4. E2E 测试执行 (按 e2e-test-plan.md 端到端验证)
5. 测试评审 (单元测试 + E2E 测试结果，reviewer ≤2轮)
6. 推送 + CI + 部署
7. 自动复盘 (写回 Phase 1 目录)
```

#### Step 2: 创建 plan Task 细粒度追踪

调用 `todolist create_tasks` 注册 plan.md 的所有 Task：
```
todolist create_tasks(tasks=[plan.md 的所有 Task 描述], memoryDir="$TOPIC_DIR/changes")
```

#### Step 3: 按 Execution Group 按波次执行（核心循环）

plan.md 中已定义 Execution Groups（BG1/FG1/...）和 Wave Schedule。主 agent 按 Wave 顺序派遣 subagent，同一 Wave 内的 Group 可并行（Semaphore ≤ 3）。

**每个 Group 的执行流程：**

1. 从 plan.md 的 Execution Groups 章节读取当前 Group 的配置（Agent、Model、上下文、文件列表）
2. 读取 Group 内所有 Task 的完整描述和 spec 引用
3. 按 Group 类型展开为不同的 subtask 链：

**后端 Group（BG*）：**

```
todolist expand_step(stepId=currentGroupId, subtasks=[
  "Task {N1}: TDD 测试编写（harness-tdd-coder）",
  "Task {N1}: 代码实现（harness-backend-developer）",
  "Task {N1}: Spec 合规检查（harness-reviewer）",
  "Task {N2}: TDD 测试编写（harness-tdd-coder）",
  "Task {N2}: 代码实现（harness-backend-developer）",
  "Task {N2}: Spec 合规检查（harness-reviewer）",
  ...
])
```

每个 Task 的 subtask 链：TDD coder → executor → reviewer，与之前相同。
区别是同一 Group 内的 Task 串行派遣多个 subagent（TDD → executor → reviewer 循环重复），但共享同一份上下文。Group 间则按 Wave 编排决定并行或串行。

**前端 Group（FG*）：**

```
todolist expand_step(stepId=currentGroupId, subtasks=[
  "Task {N1}: 前端实现（harness-frontend-developer）",
  "Task {N1}: Spec 合规检查（harness-reviewer）",
  "Task {N2}: 前端实现（harness-frontend-developer）",
  "Task {N2}: Spec 合规检查（harness-reviewer）",
  ...
])
```

前端 Task 跳过 TDD，直接走 frontend-developer → reviewer。

**Group 类型和 Agent 路由已在 plan.md 的 Execution Groups 中定义。** 主 agent 读取 Group 配置直接派遣，无需自行判断 task 类型。

**Group 间流转（Wave 编排）：**

```
for each Wave in plan.md 的 Wave Schedule:
  parallel_groups = Wave 中的所有 Groups
  if parallel_groups.length == 1:
  执行该 Group（串行）
  else:
  并行派遣所有 Groups 的 subagent（Semaphore ≤ 3）
  wait for all Groups in Wave to complete
  检查结果：
  所有 Group 通过 → 进入下一个 Wave
  有 Group 失败 → 记录，评估是否影响后续 Wave
```

> ⚠️ **subtask 执行顺序是强制的：**
> - 每个 subtask 必须在 `todolist complete_subtask` 之后才能开始下一个 subtask
> - **没有 harness-tdd-coder 的产出（失败测试文件），禁止派遣 harness-backend-developer**
> - 前端 task 虽然跳过 TDD，但 spec 合规检查不可跳过

**Group 调度 vs Task 调度的区别：**

| 维度 | 旧模式（逐 Task） | 新模式（按 Group） |
|------|-----------------|------------------|
| 派遣粒度 | 每个 Task 一个 subagent | 每个 Group 一个 subagent（处理组内所有 Task） |
| 上下文 | 每个 Task 独立上下文 | Group 内所有 Task 共享上下文 |
| 并行性 | 无并行（串行逐 Task） | 同 Wave 的 Group 可并行 |
| Git commit | 每个 Task 完成后 commit | 每个 Task 完成后 commit（不变） |

**按 Group 执行的伪代码：**
```
for each Wave in plan.md 的 Wave Schedule:
  for each Group in Wave:
  # 按 Group 配置派遣 subagent
  group_config = plan.md Execution Groups 中该 Group 的配置
  is_frontend = group_config.type == 'frontend'

  # 展开该 Group 的所有 Task subtask
  if is_frontend:
    subtasks = [每个 Task: "前端实现 + Spec 合规检查"]
  else:
    subtasks = [每个 Task: "TDD + 实现 + Spec 合规检查"]

  todolist expand_step(stepId=group.id, subtasks=subtasks)

  # 派遣 subagent（按 Group 配置中的 Agent 和 Model）
  dispatch_subagent(
    agent=group_config.agent,
    model=group_config.model,
    context={group 内所有 Task 描述 + spec 引用 + 编码规范}
  )

  # 处理返回结果
  for each subtask in group.subtasks:
    todolist complete_subtask(stepId=group.id, subtaskId=subtask.id)

  # 如果 Group 内有 git 变更，commit
  git commit
  todolist complete_task(taskId=group.id, summary="Group {id} 完成")
```

注意：上面是单 Wave 串行的伪代码。如果 Wave 内有多个 Group 且 Semaphore 允许，可以并行派遣。

#### Step 3a: Agent 调用失败处理（强制规则）

主 agent 派遣 subagent 时，必须检查返回的 status 字段。以下情况必须**立即停止当前 Wave** 并向用户报告：

| 错误类型 | 触发条件 | 处理方式 |
|---------|---------|----------|
| Agent 不存在 | subagent tool 返回 "agent not found" 或类似错误 | 停止，报告："Agent {name} 不存在。请检查是否已安装（运行 install.py）。" |
| Model 不可用 | subagent tool 返回 model 相关错误 | 停止，报告："Model {model} 不可用。请在 plan.md 中更换为可用 model 或检查 provider 配置。" |
| Agent 返回 blocked | subagent.status == "blocked" | 停止，向用户展示 subagent.reason，请求决策 |
| Agent 连续失败 | 同一 Group 内 2 次派遣均失败 | 停止，向用户报告失败详情和已完成的 subagent summary |

**禁止的行为：**
- 禁止忽略 agent 调用错误继续执行
- 禁止自动降级到其他 agent（如 harness-backend-developer 失败后改为 general-purpose）
- 禁止自动跳过失败的 Group 继续执行依赖它的后续 Group

**恢复方式：** 用户确认问题修复后，从失败的 Group 重新开始当前 Wave。

#### Step 4: Stage 1 完成

所有 plan Task 完成后：
- 调用 `loop_task_tracker complete_task 1` 标记 Stage 1 完成
- summary 会自动写入 `$TOPIC_DIR/changes/memory.md`，供后续 Stage 和 /loop 轮次恢复上下文
- 如涉及关键决策或发现了潜在陷阱，也调用 `todolist update_memory(content="...")` 追加到 memory.md
- 如需回退，调用 `todolist rollback(taskId)` 重置该 task 及后续 task

#### Step 5: 运行门禁

```bash
# 编码完成后检查：编译 + 测试 + lint 通过
bash scripts/harness-state.sh advance 1 $PROJECT_ROOT
bash scripts/gate-script.sh 03 $PROJECT_ROOT
bash scripts/harness-state.sh pass 1 $PROJECT_ROOT
```

> **注意**：gate-script.sh 的编号基于 dev-flow 15 stage 设计，与 Phase 2 的 7 阶段编号不同。
> 此处 `gate-script.sh 03` 表示"编译+测试+lint"检查（不是 Phase 2 Stage 3）。
> 完整映射见下表：
>
> | Phase 2 Stage | gate-script.sh 编号 | 检查内容 |
> |---------------|---------------------|----------|
> | Stage 1 编码实现 | 03 | 编译+测试+lint |
> | Stage 2 编码评审 | 02 | TDD 提交顺序检测 |
> | Stage 3 单元测试 | 05 | 新增测试文件+测试通过 |
> | Stage 6 推送+CI+部署 | 07 → 08 → 09 | 推送→CI→部署 三重门禁 |

### Stage 2: 编码评审

1. 运行 TDD 提交顺序门禁（检测测试是否先于实现提交）：
   ```bash
   bash scripts/harness-state.sh advance 2 $PROJECT_ROOT
   bash scripts/gate-script.sh 02 $PROJECT_ROOT $BRANCH_BASE
   bash scripts/harness-state.sh pass 2 $PROJECT_ROOT
   ```
2. 运行 `bash scripts/spec-completeness.sh $SPEC_PATH $PROJECT_ROOT` 检查 spec 自包含性
3. 派遣 reviewer subagent 对 git diff 执行独立评审
4. 评审报告写入 `.xyz-harness/{topicDir}/changes/reviews/code_review_v1.md`
5. 最多 2 轮评审，MUST FIX 必须修复
6. 完成后 `loop_task_tracker complete_task 2`

### Stage 3: 单元测试编写

1. 分析代码变更，对每个变更接口编写接口级测试（Change-driven Testing）
2. 运行门禁（gate 05 = 新增测试文件 + 测试通过）：
   ```bash
   bash scripts/harness-state.sh advance 3 $PROJECT_ROOT
   bash scripts/gate-script.sh 05 $PROJECT_ROOT
   bash scripts/harness-state.sh pass 3 $PROJECT_ROOT
   ```
3. 完成后 `loop_task_tracker complete_task 3`

### Stage 4: E2E 测试执行

> ⚠️ **硬约束：E2E 测试必须通过 `harness-e2e-tester` subagent 执行，禁止主 agent 内联执行。**
> 主 agent 是纯调度器，只负责：派遣 subagent、检查结果、运行门禁、处理回退。

#### Step 1: 前置检查

1. 确认 `e2e-test-plan.md` 存在（Phase 1 产出），不存在则跳过 Stage 4
2. 确认 Stage 1-3 已通过

#### Step 2: 派遣 E2E 测试 subagent

| 项目 | 值 |
|------|---|
| Agent | `harness-e2e-tester` |
| 模型 | `llm-simple-router/glm-5.1` |
| 输入 | `$E2E_TEST_PLAN` 路径 + `$SPEC_PATH` 路径 + `$PROJECT_ROOT` + `$TOPIC_DIR` |

**subagent 执行逻辑（在 agent.md 中完整定义）：**
1. 使用 `todolist` 管理内部步骤（读取测试计划 → 启动 Chrome → 执行测试 → 生成报告）
2. 按 e2e-test-plan.md 的依赖关系图，拓扑顺序执行测试组
3. 四层验证策略：API → DOM/A11y → 视觉对比 → 数据库
4. 逐组、逐用例执行并记录通过/失败/跳过
5. 生成 `$TOPIC_DIR/evidence/e2e-test-report.md`

**主 agent 传入的 task 内容：**
```
执行 E2E 测试。
- e2e-test-plan.md: $E2E_TEST_PLAN
- spec.md（验收标准参考）: $SPEC_PATH
- 项目根目录: $PROJECT_ROOT
- 产出目录: $TOPIC_DIR

按 e2e-test-plan.md 的依赖关系图执行所有测试组。
使用四层验证策略（API → DOM/A11y → 视觉对比 → 数据库）。
测试报告写入 $TOPIC_DIR/evidence/e2e-test-report.md。

如果环境配置不足以执行测试，返回 blocked 并说明缺少什么。
```

#### Step 3: 处理返回结果

**subagent 返回值：** `{status, deliverables, summary, reason}`

| status | 处理 |
|--------|------|
| `done`（全部通过或仅有一般级失败） | → Step 4 标记通过 |
| `done`（存在阻塞级失败） | → 回退到 Stage 1 编码修复 |
| `fail`（环境问题） | → 修复环境配置后重新派遣 |
| `blocked`（信息不足） | → 向用户展示阻塞原因，等待决策 |

> 阻塞级失败判定：e2e-test-plan.md 中标记为 blocking 的用例失败，或功能完全不可用。
> 回退时调用 `loop_task_tracker complete_task 4`（标记为 fail），然后 `harness-state.sh rollback 1`。

#### Step 4: 标记状态通过

E2E 阶段无 L1 门禁脚本，直接标记 pass：
```bash
bash scripts/harness-state.sh advance 4 $PROJECT_ROOT
bash scripts/harness-state.sh pass 4 $PROJECT_ROOT
```

#### Step 5: 完成

调用 `loop_task_tracker complete_task 4`

### Stage 5: 测试评审

1. 派遣 reviewer subagent 评审单元测试覆盖度、质量以及 E2E 测试结果
2. 评审报告写入 `.xyz-harness/{topicDir}/changes/reviews/test_review_v1.md`
3. 最多 2 轮评审
4. 标记状态通过（测试评审阶段无 L1 门禁脚本，直接标记 pass）：
   ```bash
   bash scripts/harness-state.sh advance 5 $PROJECT_ROOT
   bash scripts/harness-state.sh pass 5 $PROJECT_ROOT
   ```
5. 完成后 `loop_task_tracker complete_task 5`

### Stage 6: 推送 + CI + 部署

1. `git push` 推送代码
2. 运行推送门禁（gate 07 = 工作区干净 + push 成功）：
   ```bash
   bash scripts/gate-script.sh 07 $PROJECT_ROOT $BRANCH_NAME
   ```
3. 等待 CI 通过，验证结果写入 `changes/evidence/verification_output.md`
4. 运行 CI 门禁（gate 08 = 编译+测试+lint 全通过 + tests > 0）：
   ```bash
   bash scripts/gate-script.sh 08 $PROJECT_ROOT
   ```
5. 部署验证，结果写入 `changes/evidence/deploy_result.md`
6. 运行部署门禁（gate 09 = 健康检查或 deploy_result.md 包含成功标识）：
   ```bash
   bash scripts/gate-script.sh 09 $PROJECT_ROOT
   ```
7. 标记状态通过：
   ```bash
   bash scripts/harness-state.sh advance 6 $PROJECT_ROOT
   bash scripts/harness-state.sh pass 6 $PROJECT_ROOT
   ```
8. 完成后 `loop_task_tracker complete_task 6`

### Stage 7: 自动复盘

1. 派遣 reviewer subagent 分析整个流程，产出 `retrospective.md`。**复盘 agent 必须读取以下全部材料**：
   - `$TOPIC_DIR/changes/memory.md` — 全流程工作记忆（关键决策、陷阱、task 完成记录）
   - `$TOPIC_DIR/changes/summary.md` — 阶段状态追踪
   - `$TOPIC_DIR/changes/reviews/` — 所有评审报告（plan_review、code_review、test_review）
   - `$TOPIC_DIR/evidence/e2e-test-report.md` — E2E 测试结果（如有）
   - `$TOPIC_DIR/evidence/` — 验证证据（CI 结果、部署结果）
   - `git log --oneline --since="{开始日期}"` — 实际提交粒度和频率
   - `git diff --stat main` — 总变更量和变更文件分布
2. **写回 Phase 1 目录**（路径由 Phase 1 提供）：
   - 复制 `retrospective.md` 到 `.xyz-harness/{topicDir}/changes/retrospective.md`
   - 计算指标（token 消耗、耗时、各阶段耗时），写入 `.xyz-harness/{topicDir}/metrics.json`
   - 更新 `.xyz-harness/{topicDir}/changes/summary.md`，标记 Phase 2 交付物完成
   - 复盘报告必须包含以下维度：
     - **回退根因分析**：每次回退发生的原因分类（需求不清/代码问题/测试问题/环境问题）
     - **评审有效率**：评审发现的 MUST FIX 数 vs 用户事后发现的问题数
     - **提交质量**：git log 中每个 task 的提交粒度是否合理（过大/过碎）
     - **E2E 测试分布**：通过率、失败分布（按层级：API/DOM/Visual/DB）
     - **上下文使用效率**：memory.md 中的记录是否覆盖了关键决策（覆盖率自查）
     - **CLAUDE.md 改进建议**：哪些错误是因为 CLAUDE.md 规则缺失导致的
3. **更新系统架构文档**（实现校准）：
   - 读取 `docs/architecture.md`（如果存在）
   - 对比 plan 阶段的设计方案与实际代码实现，找出偏差
   - 更新 `docs/architecture.md` 中受影响的章节（反映实际实现而非设计目标）
   - 在文档变更历史中追加 Phase 2 校准记录
   - 如果实现与设计有重大偏差，在 retrospective.md 中单独记录
4. 完成后 `loop_task_tracker complete_task 7`

## 门禁脚本

所有脚本位于项目 `scripts/` 目录（或 `skills/xyz-harness-dev-flow/scripts/`）：

| 脚本 | 用途 |
|------|------|
| `harness-state.sh` | 状态机：advance（验证前置）→ pass（标记通过）→ rollback（回退）|
| `gate-script.sh` | L1 门禁检查：文件完整性、TDD 顺序、格式、指定阶段的合规 |
| `tdd-order-check.sh` | TDD 提交顺序检测（被 gate-script.sh stage 02 调用） |
| `spec-ref-scan.sh` | spec 引用完整性扫描 |
| `spec-completeness.sh` | spec/plan 自包含检查 |

每个阶段调用顺序：
```bash
bash scripts/harness-state.sh advance <stage> $PROJECT_ROOT  # 验证前置已通过
bash scripts/gate-script.sh <stage> $PROJECT_ROOT             # L1 门禁检查
bash scripts/harness-state.sh pass <stage> $PROJECT_ROOT      # 标记通过
```

**跳过门禁 = 流程违规。** 主 agent 和 subagent 都不允许跳过。

## 环境变量

```
PROJECT_ROOT=<项目根目录>          # 从 launch 命令获取
TOPIC_DIR=.xyz-harness/{topicDir}  # Phase 1 提供的主题目录
SPEC_PATH=$TOPIC_DIR/spec.md        # spec 文件路径
PLAN_PATH=$TOPIC_DIR/plan.md        # plan 文件路径
E2E_TEST_PLAN=$TOPIC_DIR/e2e-test-plan.md  # E2E 测试计划文件路径
```
