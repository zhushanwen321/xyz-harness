# Spec: Harness Workflow Controller Extension

## 目标

构建一个 Pi extension，作为 harness dev-flow 的流程控制器。Extension 替代 AI agent 自行管理流程推进的职责，确保多阶段流程不会跳步、不会遗漏。

## 核心原则

1. **Extension 是流程的唯一决策者** — AI agent 只负责每个 stage 内的具体工作，不控制阶段流转
2. **最小依赖** — 不依赖 `/loop`、`loop_task_tracker`、`harness-state.sh`、`todolist`。AI 只需标准工具 + extension 提供的 3-4 个工具
3. **状态持久化到文件** — 不存在 session 中，不受 clear/compact/new 影响
4. **每个 stage 内是自由对话** — 用户可以在 stage 内与 AI 自由交互，AI 使用 subagent 执行 task

## 已做决策

| 决策项 | 选择 | 理由 | 是否可推翻 |
|--------|------|------|------------|
| 状态存储 | 项目目录下 JSON 文件 | 不依赖 session，clear/new 不丢失 | 否 |
| 流程驱动 | Extension 通过 sendMessage(triggerTurn) 自动推进 | 替代 /loop | 否 |
| L1 门禁 | Extension 内部调用 gate-script.sh | 复用现有检查逻辑 | 是，后续可 TypeScript 重写 |
| L2 门禁 | 由 AI agent 派遣 subagent | 需要判断力，extension 不做 | 否 |
| Task 追踪 | AI 调用 harness_register_tasks 注册，extension 追踪 | 灵活，不绑定 plan.md 格式 | 否 |
| 阶段定义 | Extension 内置 workflow config 对象 | 流程固定，不需要外部配置文件 | 是，后续可改为可配置 |
| 确认点 | Extension 通过 ctx.ui.confirm() 拦截 | 用户必须确认才能推进 | 否 |

## 行为约束

### Always
- 状态变更时立即写入文件
- stage 完成前必须检查所有 registered task 已完成
- 有 L1 gate 的 stage 完成前必须运行 gate-script.sh
- 有确认点的 stage 完成前必须弹出 ctx.ui.confirm()
- 每次 session_start 从文件恢复状态并更新 Widget

### Ask First
- 自动 compact 前（context > 75%）
- Phase 过渡（Phase 1 → Phase 2）是否新建 session

### Never
- 不允许 AI 跳过 stage（harness_stage_complete 必须通过门禁）
- 状态不存 appendEntry（文件是唯一 truth）
- 不使用 loop_task_tracker（extension 自己管）
- 不使用 harness-state.sh 的 advance/pass/rollback（extension 自己管）
- 不使用 /loop 模式（extension 自己驱动循环）

## 范围

### 包含

- Pi extension（TypeScript，单文件或 index.ts 目录结构）
- Workflow state machine（15 个 stage 的定义和流转）
- Extension 注册的工具：harness_stage_complete, harness_register_tasks, harness_task_complete
- Extension 注册的命令：/track, /dev（替代现有 slash commands）
- 状态文件读写（.xyz-harness/workflow-state.json）
- Widget 显示（当前 stage + task 进度）
- Footer status 显示
- 确认点拦截（ctx.ui.confirm）
- L1 gate 调用（gate-script.sh）
- 自动 compact 触发
- session_start 状态恢复
- before_agent_start system prompt 注入

### 不包含

- L2 门禁逻辑（AI agent 负责派遣 subagent）
- subagent 管理（AI agent 负责）
- spec/plan 编写逻辑（SKILL.md 指导）
- gate-script.sh 的修改（只调用，不改）

## Workflow 阶段定义

### Phase 1: 需求沟通（8 steps）

| # | Stage 名称 | 类型 | L1 Gate | 确认点 | 允许的工具 |
|---|-----------|------|---------|--------|-----------|
| 1 | 需求讨论 | interactive | 无 | 无 | 全部 |
| 2 | Spec 编写+六要素+引用扫描 | interactive | 01 | **确认点1** | 全部 |
| 3 | Spec 评审 | automated | 无 | 无 | read, bash, subagent |
| 4 | Plan 编写 | interactive | 无 | 无 | 全部 |
| 5 | Plan 评审 | automated | 无 | 无 | read, bash, subagent |
| 6 | E2E 测试计划 | automated | 无 | 无 | read, write, bash, subagent |
| 7 | E2E 测试计划评审 | automated | 无 | 无 | read, bash, subagent |
| 8 | 用户确认 | interactive | 无 | **确认点2** | 全部 |

### Phase 2: 开发交付（7 stages）

| # | Stage 名称 | 类型 | L1 Gate | 确认点 | 允许的工具 |
|---|-----------|------|---------|--------|-----------|
| 9 | 编码实现 | automated | 03 | 无 | 全部 |
| 10 | 编码评审 | automated | 02 | **确认点3** | read, bash, subagent |
| 11 | 单元测试 | automated | 05 | 无 | 全部 |
| 12 | E2E 测试 | automated | 无 | 无 | 全部 |
| 13 | 测试评审 | automated | 无 | 无 | read, bash, subagent |
| 14 | 推送+CI+部署 | automated | 07→08→09 | **确认点4** | 全部 |
| 15 | 自动复盘 | automated | 无 | 无 | read, bash, subagent |

## Extension 注册的 API

### 工具

| 工具名 | 参数 | 触发行为 |
|--------|------|---------|
| `harness_stage_complete` | `{ summary: string }` | Extension 拦截 → L1 gate → 确认点 → 推进/阻止 |
| `harness_register_tasks` | `{ tasks: [{id, name}] }` | 记录 task 列表到 state |
| `harness_task_complete` | `{ taskId: string, summary: string }` | 标记 task 完成，更新 Widget |
| `harness_rollback` | `{ targetStage: number, reason: string }` | 回退到指定 stage |

### 命令

| 命令 | 触发行为 |
|------|---------|
| `/track <需求描述>` | 初始化 workflow state，从 Phase 1 Stage 1 开始 |
| `/dev <topicDir>` | 从已有 spec/plan 恢复，从 Phase 2 Stage 1 开始 |
| `/harness-status` | 显示当前 workflow 状态 |

### 事件处理

| Pi 事件 | Extension 行为 |
|---------|---------------|
| `session_start` | 从 workflow-state.json 恢复状态，更新 Widget |
| `before_agent_start` | 注入当前 stage 的 system prompt |
| `tool_call` (harness_*) | 拦截并执行门禁/确认逻辑 |
| `turn_end` | 检查 context 使用率，>75% 触发 compact |
| `context` | 注入 workflow 状态信息 |

## 状态文件格式

文件路径：`.xyz-harness/workflow-state.json`

```json
{
  "version": 1,
  "requirement": "用户管理模块",
  "topicDir": "2026-05-14-workflow-controller",
  "projectRoot": "/path/to/project",
  "currentPhase": 1,
  "currentStage": 2,
  "startedAt": "2026-05-14T10:00:00+08:00",
  "stages": [
  {
    "number": 1,
    "name": "需求讨论",
    "status": "pass",
    "startedAt": "...",
    "completedAt": "...",
    "gateResult": null,
    "tasks": []
  },
  {
    "number": 2,
    "name": "Spec 编写",
    "status": "active",
    "startedAt": "...",
    "completedAt": null,
    "gateResult": null,
    "tasks": []
  }
  ],
  "rollbackHistory": []
}
```

## stage 完成拦截流程

```
AI 调用 harness_stage_complete({ summary })
  │
  ├─ 1. 检查 task 完成度
  │     有未完成 task → block: "还有 N 个 task 未完成"
  │
  ├─ 2. L1 Gate（如适用）
  │     运行 gate-script.sh NN project_root
  │     失败 → block: "L1 gate 失败: ..."
  │
  ├─ 3. 确认点（如适用）
  │     ctx.ui.confirm() → 用户拒绝 → block
  │
  ├─ 4. 推进
  │     更新 state → 写文件 → 更新 Widget
  │
  └─ 5. 自动触发下一 stage
    sendMessage(stage prompt, { triggerTurn: true })
```

## 与 SKILL.md 的职责划分

| 职责 | 当前 SKILL.md | Extension 接管后 |
|------|-------------|----------------|
| 阶段流转顺序 | SKILL.md 定义 | **Extension 内置** |
| advance/pass/rollback 调用 | AI 通过 bash 调用 | **Extension 内部** |
| gate-script.sh 调用 | AI 通过 bash 调用 | **Extension 内部** |
| 用户确认点展示 | AI 生成文本 | **Extension ctx.ui.confirm()** |
| loop_task_tracker | AI 调用 create/complete | **Extension 替代** |
| todolist | AI 调用 create_tasks | **Extension 替代（task 层）** |
| /loop 自动继续 | force-loop 扩展 | **Extension sendMessage 替代** |
| brainstorming 怎么做 | SKILL.md | **SKILL.md（不变）** |
| spec/plan 怎么写 | SKILL.md | **SKILL.md（不变）** |
| subagent 怎么派遣 | SKILL.md | **SKILL.md（不变）** |
| 评审标准 | SKILL.md | **SKILL.md（不变）** |

SKILL.md 简化为纯领域指导文档，删除所有 `harness-state.sh`、`gate-script.sh`、`loop_task_tracker`、`todolist` 的调度逻辑。

## Widget 设计

```
┌─ Harness Workflow ──────────────────────┐
│ Phase 1 ▸ Stage 2/8: Spec 编写          │
│ ☑ 1 需求讨论                            │
│ ☐ 2 Spec 编写 ← 当前                    │
│ ☐ 3 Spec 评审                           │
│ ☐ 4 Plan 编写                           │
│ ...                                     │
└─────────────────────────────────────────┘
```

stage 内有 task 时展开显示：

```
┌─ Harness Workflow ──────────────────────┐
│ Phase 2 ▸ Stage 1/7: 编码实现           │
│ Tasks: 2/5 完成                         │
│ ☑ Task 1: 用户模型                      │
│ ☑ Task 2: API 接口                      │
│ ☐ Task 3: 前端页面 ← 当前               │
│ ☐ Task 4: 表单校验                      │
│ ☐ Task 5: 集成测试                      │
└─────────────────────────────────────────┘
```

## 回退路由表

与 SKILL.md 定义一致，由 Extension 内置：

| 失败场景 | 回退到 Stage# |
|---------|-------------|
| Plan 评审不通过 | 2 → 1 |
| 编码评审不通过 | 10 → 9 |
| 代码不可测试 | 11 → 9 |
| 测试评审不通过 | 13 → 11 |
| CI 编译错误 | 14 → 9 |
| CI 测试失败 | 14 → 9 或 11 |
| 部署失败 | 14 → 9 |
| Phase 2 E2E 阻塞 | 12 → 9 |
| 用户最终确认不符 | 15 → 2 或 9 |

## 已有基础设施

### 可复用
- `gate-script.sh` — L1 门禁检查逻辑，extension 内部调用
- `scripts/cdp.js` — Chrome CDP 工具（E2E 测试 stage 用）
- 各种 agent 定义（harness-executor, harness-reviewer 等）
- 各种 skill（xyz-harness-brainstorming, xyz-harness-writing-plans 等）

### Extension 位置
- 源码：`/Users/zhushanwen/Code/xyz-harness-engineering-workspace/xyz-harness-engineering/extensions/workflow-controller/`
- 运行时 symlink：`~/.pi/agent/extensions/workflow-controller` → 源码
- 或项目级：`.pi/extensions/workflow-controller/`

## 验收标准

- [ ] Extension 加载后注册 4 个工具 + 3 个命令
- [ ] `/track 需求` 启动 workflow，从 Phase 1 Stage 1 开始
- [ ] 每个 stage 的 before_agent_start 注入正确的 system prompt
- [ ] AI 调用 harness_stage_complete 后 Extension 执行门禁检查
- [ ] L1 gate 失败时 block，AI 留在当前 stage
- [ ] 确认点弹出 ctx.ui.confirm()，用户拒绝时 AI 留在当前 stage
- [ ] stage 通过后自动 sendMessage 触发下一 stage
- [ ] Widget 实时显示当前阶段和 task 进度
- [ ] Footer status 显示当前 stage 名称
- [ ] workflow-state.json 每次状态变更时写入
- [ ] session_start 从文件恢复状态（clear/new 后不丢进度）
- [ ] context > 75% 时自动触发 compact
- [ ] harness_register_tasks 注册的 task 未全部完成时，不允许 stage_complete
- [ ] harness_rollback 正确回退到目标 stage 并清除后续状态
- [ ] `/dev topicDir` 从已有产出物启动 Phase 2
- [ ] `/harness-status` 显示完整 workflow 状态
