---
description: "Phase 2 开发交付 — 基于 spec+plan 的 7 阶段 TDD+编码+审查+单元测试+E2E测试+推送+复盘流程。触发条件：用户说「Phase 2」「开发交付」「7 阶段流程」「开始开发」「继续开发需求」「基于 spec 和 plan」或 /loop 中包含这些关键词。此 skill 是旧 dev-flow 的精简版，仅描述 Phase 2 流程，不包含 Phase 1 的需求沟通。"
---

# Phase 2: 开发交付流程

你正处于 Phase 2（开发交付阶段）。Phase 1（需求沟通）已完成，你继承其产出文档。

**你不会继承 Phase 1 的会话上下文**。所有你需要的信息都在 spec.md 和 plan.md 中。
如果某份文档不完整，不要猜测——停止并报告给用户，要求补充文档。

## 核心原则

1. **spec + plan 是你的唯一指令集** — 按 plan.md 的 Task 顺序逐个实现
2. **TDD 优先** — 每个 Task 先写测试再实现，确保可验证
3. **门禁脚本强制执行** — 每个阶段完成后运行 `harness-state.sh advance → gate-script.sh → harness-state.sh pass`
4. **Phase 2 产出写回 Phase 1 目录** — 复盘和指标写入 Phase 1 的 `.xyz-harness/{topicDir}/` 下

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

### 阶段 1: 编码实现

**两层追踪体系：**
- **粗粒度（loop_task_tracker）**：主 agent 管理 7 个 Stage 的流转
- **细粒度（todolist）**：Stage 1 内部管理 plan Task，以及 subagent 内部的多步骤流程

**关键规则：**
- `loop_task_tracker` 只由主 agent 使用，subagent 不能调用（否则会覆盖主 agent 的 Stage 列表）
- subagent 内部使用 `todolist`（自由任务模式）管理自己的多步骤流程
- 两者的 UI 展示：loop_task_tracker 在上方 widget，todolist 在下方 widget（belowEditor），形成上下分栏

1. 调用 `loop_task_tracker create_tasks` 创建以下 7 个 Stage 粒度的 task：
   ```
   1. 编码实现 (TDD + 按 plan Task 逐个完成)
   2. 编码评审 (reviewer ≤2轮)
   3. 单元测试编写 (Change-driven Testing)
   4. E2E 测试执行 (按 e2e-test-plan.md 端到端验证)
   5. 测试评审 (单元测试 + E2E 测试结果，reviewer ≤2轮)
   6. 推送 + CI + 部署
   7. 自动复盘 (写回 Phase 1 目录)
   ```
2. **在 Stage 1 内部，使用 `todolist` 管理 plan.md 的 Task**：
   - 调用 `todolist create_tasks`（tasks=[plan.md 的所有 Task 描述]，memoryDir="$TOPIC_DIR/changes"）注册所有 plan Task
   - 每个 Task 执行流程根据类型不同：
     - **后端 task**：TDD 流程（TDD coder → executor → spec 合规检查）
     - **前端 task**：跳过 TDD，直接派遣 `harness-frontend-developer`（骨架→功能→美化三阶段）
     - 判断方式：task 涉及 UI 组件/页面/布局/样式 → 前端 task；其余 → 后端 task
   - 每完成一个 plan Task → git commit
   - 完成后调用 `todolist complete_task(taskId, summary="关键决策和提醒")` 标记完成
   - summary 会自动写入 `$TOPIC_DIR/changes/memory.md`，供后续 Stage 和 /loop 轮次恢复上下文
   - 每完成一个 plan Task，如果涉及关键决策或发现了潜在陷阱，也调用 `todolist update_memory(content="...")` 追加到 memory.md，不等 task 完成
   - 如需回退，调用 `todolist rollback(taskId)` 重置该 task 及后续 task
   - 所有 plan Task 完成后，调用 `loop_task_tracker complete_task 1` 标记 Stage 1 完成
3. 运行门禁：
   ```bash
   bash scripts/harness-state.sh advance 1 $PROJECT_ROOT
   bash scripts/gate-script.sh 01 $PROJECT_ROOT
   bash scripts/harness-state.sh pass 1 $PROJECT_ROOT
   ```

### 阶段 2: 编码评审

1. 运行 `bash scripts/spec-completeness.sh $SPEC_PATH $PROJECT_ROOT` 检查 spec 自包含性
2. 派遣 reviewer subagent 对 git diff 执行独立评审
3. 评审报告写入 `.xyz-harness/{topicDir}/changes/reviews/code_review_v1.md`
4. 最多 2 轮评审，MUST FIX 必须修复
5. 完成后 `loop_task_tracker complete_task 2`

### 阶段 3: 单元测试编写

1. 分析代码变更，对每个变更接口编写接口级测试（Change-driven Testing）
2. 运行门禁：
   ```bash
   bash scripts/harness-state.sh advance 3 $PROJECT_ROOT
   bash scripts/gate-script.sh 03 $PROJECT_ROOT
   bash scripts/harness-state.sh pass 3 $PROJECT_ROOT
   ```
3. 完成后 `loop_task_tracker complete_task 3`

### 阶段 4: E2E 测试执行

1. 读取 e2e-test-plan.md，按依赖关系图的拓扑顺序执行测试组
2. 按测试环境配置章节启动前后端服务，初始化测试数据
3. 逐组、逐用例执行：
   - 前置条件检查（依赖的 TC 是否已通过）
   - 按测试步骤执行操作（curl/CDP/SQL 等）
   - 按验证方法检查结果
   - 记录通过/失败/跳过状态
4. 失败处理：
   - 阻塞级失败 → 记录并继续执行无依赖的用例
   - 依赖链传播 → 跳过所有依赖失败用例的后置用例
5. 生成 e2e-test-report.md 写入 evidence/ 目录
6. 回退判定：
   - 存在阻塞级失败 → 回退到 Stage 1 编码修复
   - 全部通过或仅有一般级失败 → 通过
7. 完成后 `loop_task_tracker complete_task 4`

### 阶段 5: 测试评审

1. 派遣 reviewer subagent 评审单元测试覆盖度、质量以及 E2E 测试结果
2. 评审报告写入 `.xyz-harness/{topicDir}/changes/reviews/test_review_v1.md`
3. 最多 2 轮评审
4. 完成后 `loop_task_tracker complete_task 5`

### 阶段 6: 推送 + CI + 部署

1. `git push` 推送代码
2. 等待 CI 通过，验证结果写入 `changes/evidence/verification_output.md`
3. 部署验证，结果写入 `changes/evidence/deploy_result.md`
4. 运行门禁：
   ```bash
   bash scripts/harness-state.sh advance 6 $PROJECT_ROOT
   bash scripts/harness-state.sh pass 6 $PROJECT_ROOT
   ```
5. 完成后 `loop_task_tracker complete_task 6`

### 阶段 7: 自动复盘

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
| `gate-script.sh` | L1 门禁检查：文件完整性、格式、指定阶段的合规 |
| `pre-stage-check.sh` | 前置阶段检查（由 gate-script.sh 自动调用）|
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
