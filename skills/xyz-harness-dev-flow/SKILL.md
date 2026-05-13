---
name: xyz-harness-dev-flow
description: >
  需求开发全流程编排器(11 阶段)。主 agent 是纯调度器,不直接执行任何业务逻辑。
  每个阶段派遣 subagent 执行,L1 脚本强制门禁 + L2 subagent 门禁 + L3 人工确认。
  5 个人工确认点,完整的变更追溯。当用户说"开发需求"、"做一个需求"、"实现这个功能"、"dev-flow"、"跑需求"、"开发这个需求"、"帮我做这个需求"时触发。
  前提:项目已有 CLAUDE.md 和 CI 配置。如果没有,先引导用户完成项目初始化。
---

## Reference 文件

本 skill 引用以下参考文件,在需要时读取:

| 文件 | 用途 | 何时读取 |
|------|------|----------|
| `references/claude-md-template.md` | CLAUDE.md 填空模板 | 前置检查发现项目没有 CLAUDE.md 时 |
| `references/wiki-structure.md` | 项目 Wiki 目录结构模板 | 阶段 11 发现 Agent 因领域知识缺失而犯错时 |

---

# 第一部分:角色声明

你是全自动的开发流水线调度器。你不直接执行任何业务逻辑,不读交付物内容,不修改任何文件。

你只做三件事:

1. **调度 subagent**(通过 `loop_task_tracker` 管理阶段状态)
2. **检查门禁结果**(L1 脚本 + L2 subagent)
3. **在确认点暂停等待用户决策**

**绝对禁止:**
- 直接编辑代码、写 spec、写 plan
- 直接读取交付物内容后做判断(透传 subagent.summary 即可)
- 跳过任何门禁检查

---

# 第二部分:通用调度模式

每个阶段遵循相同的 4 步调度流程。**主 agent 不关心具体执行内容**,只关心:投入(输入)、产出(交付物)、执行状态(pass/fail)。

```
主 agent(纯调度器)
  │
  ├─ Step 0:状态机推进(所有阶段)
  │   运行:harness-state.sh advance {NN} {project_root}
  │   验证前置阶段全部 pass → 更新 state.json
  │   前置不通过 → 直接 fail(不允许跳阶段)
  │
  ├─ Step 1:派遣 执行/评审 subagent
  │   输入:阶段号 + 必要的文件路径(不传文件内容)
  │   subagent 返回:{status, deliverables, summary, reason, rollback_target}
  │
  │
  ├─ Step 2:L1 脚本强制检查(仅 135789)
  │   运行:gate-script.sh {NN} {project_root} [additional_args...]
  │   通过 → 生成 .xyz-harness/gate/stage-{NN}.pass
  │   不通过 → 直接 fail,不进入 Step 3
  │
  ├─ Step 3:L2 门禁 subagent 检查(所有阶段)
  │   派遣 gate-checker subagent 独立验证
  │   pass → 进入 Step 4
  │   fail → 按回退路由表处理
  │
  ├─ Step 4:状态机标记通过
  │   运行:harness-state.sh pass {NN} {project_root}
  │   L1 阶段:验证 .pass 文件由 gate-script.sh 生成
  │   非 L1 阶段:直接生成 .pass 文件
  │
  │
  └─ Step 5:complete_task(N) + 人工确认判断
        无确认点 → 进入下一阶段
        有确认点 → 暂停,透传 summary,等待用户决策
```

## Subagent 配置表

| 角色 | 复用 Agent | 工具权限 | 模型 |
|------|-----------|---------|------|
| 执行 subagent | harness-executor | read, edit, write, bash | 简单任务 glm-5-turbo,复杂 glm-5.1 |
| TDD coder subagent | harness-tdd-coder | read, edit, write, bash | glm-5.1 |
| E2E 测试 subagent | harness-e2e-tester | read, edit, write, bash | glm-5.1 |
| 评审 subagent | harness-reviewer | read, bash | glm-5.1 |
| 门禁 subagent | harness-gate-checker | read, bash | glm-5.1 |

## Subagent 返回值格式

所有 subagent(执行/评审/门禁)统一返回:

```json
{
  "status": "done | fail | blocked | pass",
  "deliverables": ["path/to/file1.md", "path/to/file2"],
  "summary": "一句话摘要,供主 agent 在确认点透传给用户",
  "reason": "失败原因(status=fail 时必填)",
  "rollback_target": 3
}
```

## L1/L2 门禁说明

- **L1 脚本检查**:可程序化验证的项(文件存在性、编译、测试、lint 等),由 `scripts/gate-script.sh` 执行
- **L2 subagent 检查**:需要判断力的项(内容质量、架构合规、spec 覆盖度等),由门禁 subagent 执行

**L1 适用于**:135789(可程序化验证的阶段)
**L1 不适用于**:2461011(只有 L2 subagent 检查)

**执行顺序**:主 agent 先执行 L1(如果适用),L1 通过后再执行 L2。

### L1 Gate 强制验证规则

1. **pass 文件只能由 gate-script.sh 生成** — 禁止 subagent 或主 agent 手动创建 `.pass` 文件。主 agent 在运行 gate-script.sh 后必须验证 pass 文件存在
2. **pass 文件格式验证** — 主 agent 必须读取生成的 pass 文件,验证内容以 `pass at` 开头。不符合格式视为 L1 失败
3. **回退时清除 pass 标记** — 发生回退时,主 agent 必须运行 `harness-state.sh rollback {stage} {project_root}`,自动清除被回退阶段的 pass 文件
4. **subagent 禁止操作 gate 目录** — 所有 subagent 的工具权限中不包含对 `.xyz-harness/gate/` 目录的写操作
5. **状态机强制** — 每个阶段开始前必须运行 `harness-state.sh advance {stage} {project_root}`,前置阶段未通过则不可推进

## Harness 脚本集

所有脚本位于 `skills/xyz-harness-dev-flow/scripts/` 目录下:

| 脚本 | 用途 | 调用时机 |
|------|------|----------|
| `harness-state.sh` | 状态机管理(advance/pass/rollback/status/check) | 每个阶段开始/结束时 |
| `gate-script.sh` | L1 门禁检查(编译/测试/lint) | 阶段 1,3,5,7,8,9 |
| `pre-stage-check.sh` | 前置阶段检查 | gate-script.sh 自动调用 |
| `spec-ref-scan.sh` | Spec 引用完整性扫描 | 阶段 ① 完成后 |

### Hook 安装

`scripts/hooks/` 目录提供了兼容 Pi 和 Claude Code 的门禁拦截 hook:

**Claude Code** — 在项目的 `.claude/hooks/hooks.json` 中引用:
```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "bash /path/to/scripts/hooks/harness-gate-hook.sh",
        "timeout": 10
      }]
    }]
  }
}
```

**Pi** — 将 `harness-gate-hook.ts` 复制到 `~/.pi/agent/extensions/` 或 `.pi/extensions/`:
```bash
cp scripts/hooks/harness-gate-hook.ts ~/.pi/agent/extensions/
```

### 二阶段命令

**Pi** — 将 `extensions/track/index.ts` 复制到 `~/.pi/agent/extensions/track/`:
```bash
mkdir -p ~/.pi/agent/extensions/track
cp extensions/track/index.ts ~/.pi/agent/extensions/track/
```

- `/track <需求描述>` — 启动 Phase 1（需求沟通，7 步固定流程）
- Phase 2 使用 `/loop --max 20 继续开发需求` 启动

**Claude Code** — 使用 slash commands:
```bash
# 复制 commands/ 目录到项目
mkdir -p .claude/commands
cp commands/track.md .claude/commands/track.md
cp commands/dev.md .claude/commands/dev.md
```

- `/track <需求描述>` — 启动 Phase 1
- `/dev <spec路径> <plan路径>` — 启动 Phase 2

---

# 第三部分:前置检查

开始之前,按顺序执行以下检查:

## 1. 是否在 worktree 中?

运行 `git rev-parse --git-common-dir` 和 `git rev-parse --git-dir`,如果两者不同则已在 worktree 中。如果相同,询问用户是否需要创建 worktree(使用 create-worktree skill)。

## 2. CLAUDE.md 是否存在且完整?

检查项目根目录是否有 CLAUDE.md。

**如果不存在**，告诉用户:

> 这个项目还没有 CLAUDE.md（项目级规则文档）。建议先运行 xyz-harness-init skill 完成初始化，否则后续所有环节的质量都会打折。
>
> 是否现在初始化？（说"初始化项目"或"init harness"）

**如果存在但不完整**（缺少必需章节），告诉用户:

> CLAUDE.md 缺少以下必需章节：[列出缺失项]。建议运行 xyz-harness-init 补全。
>
> 是否现在补全？（说"初始化项目"或"init harness"）

必需章节检查清单:
- 项目背景（非空）
- 架构约束（至少有分层规则）
- 编码规范（至少有测试目录路径）
- 质量门禁（至少有编译和测试命令，格式为 `- 标签: \`命令\``）

如果用户选择跳过初始化，允许继续但明确告知风险。

## 3. 是否有 CI 配置?

检查是否有 `.github/workflows/` 或 `.gitlab-ci.yml` 等。如果没有,提醒用户后续验证环节需要手动运行。

## 4. /loop 模式是否已激活?

检查当前会话是否在 `/loop` 模式下运行。如果 loop_task_tracker 工具不可用或 `/loop` 命令未注册,说明 force-loop 扩展未安装或 `/loop` 未激活。

**如果未激活：** 告诉用户:

> 后续自动执行阶段（③-⑪）需要 `/loop` 模式支持。请先输入以下命令激活循环模式：
> ` /loop --max 20 开发需求：{需求简述}`
>
> 激活后我会自动继续。

**为什么需要 /loop 模式：**
- **自动继续：** 自动化阶段③-⑪可能在长时间执行后上下文耗尽。`/loop` 模式会在每轮结束后自动重试，确保不中断
- **防卡死检测：** 连续 3 轮无进展时自动停止，防止无限循环
- **任务追踪：** loop_task_tracker 管理阶段进度，中断后可恢复
- **预算保护：** 上下文使用超过 80% 时触发收尾流程，防止丢失工作

> **注意：** 阶段①和②可以不在 `/loop` 模式下执行（需要用户交互），但**必须在进入阶段③前激活 `/loop`**。阶段②完成后会再次确认。

## 前置检查通过后

1. **`create_tasks`** 注册 11 个阶段:

```
1 需求分析
2 需求评审
3 编码实现
4 编码评审
5 测试编写
6 测试评审
7 代码推送
8 CI 验证
9 部署验证
10 用户确认
11 自动复盘
```

2. 清空 `.xyz-harness/gate/` 目录下旧标记文件(新需求开始时)

3. 向用户宣布:

> 启动需求开发流水线。我会在 5 个关键点暂停等待你的确认:
> 1. 确认点1:需求设计确认(阶段 1 后)
> 2. 确认点2:计划评审确认(阶段 2 后)
> 3. 确认点3:编码评审确认(阶段 4 后)
> 4. 确认点4:部署目标确认(阶段 9 前)
> 5. 确认点5:最终交付确认(阶段 10)
>
> 其他环节全自动执行。开始!

---

# 第四部分:loop_task_tracker 与 /loop 模式使用说明

## 关系说明

`loop_task_tracker` 由 force-loop 扩展提供，是 `/loop` 模式的组成部分。两者关系：

| 概念 | 角色 |
|------|------|
| `/loop` 命令 | 由 force-loop 扩展注册，激活循环模式（`/loop --max N <prompt>`） |
| `loop_task_tracker` tool | 在 `/loop` 模式下可用，管理任务清单（create/complete/list） |
| 自动继续 | `/loop` 模式在每轮 agent 结束后检查剩余任务，自动发送下一轮 prompt |
| 防卡死 | `/loop` 模式检测连续 3 轮无进展时自动停止 |
| 预算保护 | `/loop` 模式在上下文使用超过 80% 时触发收尾流程 |

> 必须先在 Pi 中运行 `/loop --max <N> 开发需求：xxx` 激活循环模式，
> 然后 `loop_task_tracker` 工具才能用于阶段任务管理。

## 使用方式

| tracker 操作 | 时机 | 说明 |
|-------------|------|------|
| `create_tasks(11个阶段)` | 前置检查通过后 | 注册全部阶段名称 |
| `list_tasks` | 每个阶段开始前 | 查看当前进度和剩余阶段 |
| `complete_task(N)` | gate-checker 返回 pass 后 | 标记阶段完成，`/loop` 自动进入下一轮 |
| 重置为未完成 | 回退发生时 | 回退目标阶段及后续所有阶段重置 |

## 进入阶段③时的建议

如果当前尚未在 `/loop` 模式下运行，阶段②用户确认后应提示用户激活 `/loop`：

> 接下来进入自动执行阶段（③-⑪）。建议现在输入 `/loop --max 20 继续开发需求` 激活循环模式，
> 确保后续执行不中断。

## 回退时的 tracker 处理

回退发生时,主 agent 需要:

1. 识别回退目标阶段 N
2. 将 tracker 中阶段 N 及之后的所有阶段重置为未完成
3. 重新派遣执行 subagent 从阶段 N 开始

```
例:阶段 4 编码评审不通过 → 回退到 3
  → 阶段 3 重置为未完成
  → 阶段 4 重置为未完成(如果已标记)
  → 重新派遣执行 subagent 从 3 开始
```

---

# 第五部分:变更管理目录和 summary.md 格式

每个需求的所有产出物保存在 `.xyz-harness/{yyyy-MM-dd}-{主题}/` 下,形成完整的 Audit Trail。

## 目录结构

```
.xyz-harness/
├── gate/                             # gitignore，运行时临时状态
│   ├── stage-01.pass                  # 阶段 1 脚本检查通过
│   ├── stage-03.pass                  # 阶段 3 脚本检查通过
│   └── ...                            # 每个阶段一个
└── {yyyy-MM-dd}-{主题}/
    ├── spec.md                        # 需求设计文档
    ├── plan.md                        # 实现计划
    ├── ... (其他设计文档，如拆分的子 spec)
    ├── metrics.json                   # 运行指标(token 消耗、耗时、回退)
    └── changes/                       # dev-flow 运行时输出
        ├── summary.md                 # 全流程追溯(每阶段实时更新)
        ├── reviews/                   # 评审记录(版本递增,永不删除)
        │   ├── plan_review_v1.md      # 阶段 2
        │   ├── code_review_v1.md      # 阶段 4(可能有 v2, v3)
        │   └── test_review_v1.md      # 阶段 6
        ├── evidence/                  # 验证证据
        │   ├── verification_output.md # 本地验证
        │   ├── ci_result.md           # CI 结果
        │   └── deploy_result.md       # 部署结果
        └── retrospective.md           # 复盘记录(阶段 11 产出)
```

### 说明

- `gate/` 目录:gitignore,不入库。每个新需求开始时清空旧标记。gate-script.sh 通过后生成 `{stage-N}.pass`
- `metrics.json`:每个需求的运行指标,与需求产出物自包含在同一目录下。记录总 token 消耗、总耗时、各阶段 subagent 的 token/耗时、回退次数
- `changes/` 目录:区分设计文档(spec/plan)和执行记录(summary/reviews/evidence/retrospective),避免文件平铺
- 轻量需求(只做设计不跑 dev-flow)可以只有 spec.md + plan.md,不需要 changes/ 子目录

## summary.md 格式

每个 summary.md 必须包含以下章节,阶段推进时持续更新(由执行 subagent 负责,不是主 agent):

```markdown
# {需求名称} - 全流程追溯

## 基本信息
- 需求描述:[一句话]
- 开始时间:[日期]
- 当前阶段:[阶段编号 + 名称]

## 阶段状态

| 阶段 | 状态 | 评审轮次 | 备注 |
|------|------|---------|------|
| 1 需求分析 | ✅ 通过 | 1轮 | [日期] |
| 2 需求评审 | ✅ 通过 | 1轮 | [日期] |
| 3 编码实现 | 🔄 进行中 | - | 当前 task: [N] |
| 4 编码评审 | ⬜ 未开始 | - | - |
| 5 测试编写 | ⬜ 未开始 | - | - |
| 6 测试评审 | ⬜ 未开始 | - | - |
| 7 代码推送 | ⬜ 未开始 | - | - |
| 8 CI 验证 | ⬜ 未开始 | - | - |
| 9 部署验证 | ⬜ 未开始 | - | - |
| 10 用户确认 | ⬜ 未开始 | - | - |
| 11 自动复盘 | ⬜ 未开始 | - | - |

## 评审摘要
[记录每次评审的结论和关键发现]

## 异常记录
[记录过程中遇到的异常、回退、阻塞及处理方式]
```

## 评审记录格式

评审文件采用版本递增(v1, v2, v3...),旧版本永远不删。每条评审意见必须包含:

```markdown
## 评审记录 v{N}
- 评审时间:[日期]
- 评审类型:[计划评审 / 编码评审 / 测试评审]
- 评审对象:[文件/范围]

### 发现的问题

| # | 优先级 | 文件 | 描述 | 建议 |
|---|--------|------|------|------|
| 1 | MUST FIX | path | 问题描述 | 修复建议 |
| 2 | LOW | path | 问题描述 | 修复建议 |
| 3 | INFO | path | 问题描述 | 修复建议 |

### 结论
[通过 / 需修改后重审]
```

## 追溯维护规则

- **summary.md 在每个阶段完成时立即更新**,不能积压到最后
- 评审记录在评审 subagent 返回结果后立即写入
- 验证证据在验证阶段直接保存命令输出
- 所有文件提交到 git,确保可追溯

---

# 第六部分:11 个阶段的详细调度指令

---

## 阶段 ①：需求分析（交互阶段 — 主 agent 直接执行）

**本阶段由主 agent 直接执行，不派遣 subagent。**

原因：brainstorming 需要逐一向用户提问澄清需求，subagent 是非交互子进程，无法与用户对话。主 agent 直接执行可以保持原生交互体验。

### 1. 主 agent 直接执行 brainstorming + writing-plans

**执行流程：**
1. 读取项目 CLAUDE.md，理解项目背景和技术栈
2. 浏览项目文件结构
3. 执行 brainstorming skill：
   - 逐一向用户提问（每次一个问题，优先多选）
   - 提出 2-3 个方案及 trade-off
   - 逐节呈现设计，每节确认
   - 产出 spec.md
   - **spec.md 必须包含已有基础设施章节**（格式见下方）
   - 当存在设计稿/原型时，spec.md 必须在开头引用设计稿链接
   - **当需求涉及数据存储/传递时，spec.md 必须包含数据流章节**（格式见下方）
4. 执行 writing-plans skill：
   - 基于 spec.md 规划文件结构
   - 拆分为 bite-sized task
   - 每个 task 必须包含验收标准、风险点、文件变更分类（格式见下方）
   - 产出 plan.md
5. 将 spec.md 和 plan.md 写入 `.xyz-harness/{主题}/`
6. 初始化 `changes/summary.md`，阶段 ① 标记为进行中
7. 创建 `.xyz-harness/gate/` 目录

**交付物：**
- `.xyz-harness/{主题}/spec.md` — 需求设计文档
- `.xyz-harness/{主题}/plan.md` — 实现计划
- `.xyz-harness/{主题}/changes/summary.md` — 初始化的追溯文件

#### plan.md task 格式（始终必填）

plan.md 中每个 task 必须包含以下 4 个要素。缺少验收标准或文件变更表的 task 在需求评审（阶段②）时标记为 MUST FIX。

```markdown
## Task N：{标题}

### 描述
{做什么，核心逻辑，关键约束}

### 验收标准
- [ ] {具体的可检查条件}
- [ ] {如：getFilteredCommands('/') 返回包含 clear/compact/help 的数组}
- [ ] {如：skill 标签在 send 后消失，不是 select 后}

### 文件变更
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/composables/useSlashCommands.ts` | 重写 | 命令类型化注册 |
| `src/components/chat/SlashMenu.vue` | 重写 | 保留已有 Teleport + 键盘导航 |
| `src/components/chat/ChatInput.vue` | 修改 | 新增 skill 标签 UI |
| `shared/src/message.ts` | 修改 | 新增 skillName 可选字段 |

### 风险点
- {可能踩的坑，如：skill 标签消失时机容易写错}
- {如：Message 接口改了要同步 shared 类型，前端和 sidecar 共享}
```

#### spec.md 数据流章节（当需求涉及数据存储/传递时必填）

当需求涉及新增数据字段、数据传递、数据存储时，spec.md 必须包含以下格式的数据流章节：

```markdown
## 数据流

### 新增数据字段
| 字段 | 类型 | 生产者 | 存储位置 | 消费者 | 读取时机 |
|------|------|--------|---------|--------|----------|
| cache_read_tokens_estimated | INTEGER | CacheEstimator hook | request_metrics DB | Dashboard SSE / Admin API / 日志详情 | 实时推送 + 查询时 |

### 数据流图
```
生产者 → [存储/传输] → 消费者1
                         → 消费者2
                         → 消费者N
```

### 时序要求
- 生产者写入时机：[描述何时写入]
- 消费者读取时机：[描述何时读取，必须在写入之后]
```

该章节在编码评审（阶段④）时作为数据流合规检查的依据。

#### spec.md 已有基础设施章节（始终必填）

spec.md 必须包含「已有基础设施」章节，让 Phase 2 编码 agent 能复用现有代码、避开已知问题。缺少该章节的 spec 在需求评审（阶段②）时标记为 MUST FIX。

```markdown
## 已有基础设施

### 可复用的现有 API

| 位置 | 方法/组件 | 用途 |
|------|----------|------|
| `src/composables/useSession.ts` | `compactSession()` | 发送 session.compact 协议消息 |
| `src/composables/useSession.ts` | `clearSession()` | 发送 session.clear 协议消息 |
| `src/stores/chat.ts` | `clearMessages(sid)` | 清空指定 session 聊天记录 |

### 接口/类型定义位置

| 位置 | 接口名 | 用途 |
|------|--------|------|
| `shared/src/message.ts` | `Message` | 消息体，新增字段在此扩展 |
| `shared/src/provider.ts` | `SkillInfo` | Skill 元数据，含 id/name/description/enabled |

### 技术调研结论

- **协议约束**：说明外部系统的实际行为限制（不是文档说的，是验证过的）
- **平台限制**：CORS、单线程、无独立通道等
- **已有协议类型清单**：不需要新增的协议消息类型

### 已知技术债务（编码 agent 不修）

| 文件 | 问题 | 原因 |
|------|------|------|
| `path/to/file.ts` | 具体错误描述 | 预存，非本次引入 |
```

该章节在编码评审（阶段④）时作为基础设施复用检查的依据。

### 2. Spec 引用完整性扫描

- 运行：`spec-ref-scan.sh {project_root} .xyz-harness/{主题}/spec.md`
- 检查项：
  - spec 中提到的代码标识符是否在代码库中有遗漏的引用文件
  - spec 中提到的文件路径是否存在
  - spec 中标记“移除”的标识符是否仍有残留引用
- 失败 → 主 agent 直接修复 spec/plan,重新扫描

### 3. L1 脚本检查

- 运行：`gate-script.sh 01 {project_root} .xyz-harness/{主题}/spec.md .xyz-harness/{主题}/plan.md`
- 检查项：
  - spec.md 存在且非空
  - plan.md 存在且非空
  - plan.md 包含至少 1 个 "Task" 标题
- 失败 → 回退到 ①，主 agent 直接修复

### 4. 人工确认点 1：需求待决议确认

**⚠️ 强制暂停。必须在此处等待用户回复后才能继续。绝对禁止跳过此确认点直接进入阶段 ②。**

**确认点展示（主 agent 基于交互结果）：**

```
阶段 ① 需求分析完成。

设计文档：.xyz-harness/{主题}/spec.md
实现计划：.xyz-harness/{主题}/plan.md

摘要：
- 目标：[spec.md 中的一句话目标]
- 方案：[选定的方案]
- 影响范围：[涉及的文件/模块]
- 任务数量：[plan.md 中的 task 数]
- 待决议项：[列出 spec 中的待决议项，如有]

请确认：
1. 确认 — 进入需求评审
2. 有修改意见 — 告诉我改什么
3. 方向不对 — 重新讨论
```

**流转规则：**
- 确认 → 执行 compaction（步骤 4），然后进入阶段 ②（自动阶段，开始 subagent 模式）
- 有修改意见 → 直接修改 spec/plan → 重新展示
- 方向不对 → 回到提问环节

### 4. 执行 compaction

**确认通过后，必须执行 compaction。** 清理交互阶段的对话历史（用户需求讨论），保持后续调度阶段的上下文干净。

**注意：compaction 必须在确认点 1 通过之后执行，不能在确认之前执行。** 否则主 agent 会丢失交互上下文，导致确认点被跳过。

### 5. complete_task(1)

---

## 阶段 2:需求评审

**调度流程:**

### 1. 派遣评审 subagent

| 项目 | 值 |
|------|---|
| Agent | harness-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer(计划评审模式) |
| 模型 | glm-5.1 |
| 输入 | spec.md 路径 + plan.md 路径 + 项目根目录 |

**subagent 入口条件:**
- spec.md 存在
- plan.md 存在
- 阶段 1 已确认(用户已回复确认)

**subagent 执行逻辑(概述):**
1. 读取 spec.md 和 plan.md(不继承阶段 1 的执行上下文)
2. 读取项目 CLAUDE.md 中的架构约束和编码规范
3. 执行 expert-reviewer 计划评审模式:
   - spec 完整性检查(目标明确?范围合理?验收标准可量化?)
   - plan 可行性检查(任务拆分合理?依赖关系正确?工作量估算现实?)
   - spec 与 plan 一致性检查(plan 是否覆盖 spec 所有需求?)
4. 产出评审报告,每条意见标注优先级(MUST FIX / LOW / INFO)
5. 写入 `changes/reviews/plan_review_v1.md`(版本递增,旧版不删)

**交付物:**
- `.xyz-harness/{主题}/changes/reviews/plan_review_v{N}.md` - 评审报告

### 2. L1 脚本检查

不适用(阶段 2 无 L1 检查)。

### 3. L2 门禁 subagent

- 检查项:
  1. `plan_review_v{N}.md` 存在且非空
  2. 评审报告中无未解决的 MUST FIX 项(或有修复确认记录)
  3. 评审轮次 ≤ 3
- 失败 → 回退到 1,将 fail.reason(MUST FIX 未解决)传给执行 subagent,重新派遣修改 spec/plan

### 4. complete_task(2)

### 5. 人工确认点 2:计划评审后确认

**确认点展示(透传 subagent.summary):**

```
阶段 2 需求评审完成。

评审报告:{deliverables[0]}

{subagent.summary}

请确认:
1. 确认 - 进入编码实现
2. 有修改意见 - 告诉我改什么
3. 计划不合理 - 回到需求分析
```

**流转规则:**
- 确认 → 进入阶段 3
- 有修改意见 → 将用户意见作为输入,重新派遣执行 subagent 修改 spec/plan,修改后再派遣评审 subagent,重新走 L2 + 确认点
- 计划不合理 → 回退到阶段 1

> **进入阶段③前的重要步骤：** 如果当前尚未激活 `/loop` 模式（阶段①-②可以不在 loop 下执行），
> 建议输入 `/loop --max 20 继续开发需求` 激活循环模式，确保后续自动化阶段在上下文耗尽后能自动继续。
>
> **二阶段模式：** 如果采用二阶段模式（Phase 1 + Phase 2 分离），则不需要激活 /loop。
> 阶段②确认后，直接生成 Phase 2 启动提示词，让用户在新 session 中执行。

---

## 阶段 3:编码实现

**调度流程:**

### 1. 主 agent 按 task 迭代调度

**重要限制：** subagent 内部不能嵌套调用 subagent。阶段 ③ 的编码实现由**主 agent 直接按 plan.md 的 task 逐个派遣 subagent**，而非通过一个执行 subagent 内部调度。

**主 agent 执行流程：**

1. 读取 plan.md，提取所有 task（含完整描述和上下文）
2. 使用 `loop_task_tracker` 创建 task 级 tracker（将每个 task 作为一个独立步骤）
3. 逐一派遣 subagent 执行每个 task，遵循以下模式：

**每个 task 的三步调度模式：**

```
  ┌─ Step 1: 派遣 TDD coder (harness-tdd-coder, glm-5.1)
  │   task = "实现 Task N：{task 描述}
  │           spec 相关章节：{spec 章节}
  │           要测试的接口/函数：{提取自 task 描述}"
  │   职责：编写失败测试 → 确认测试 FAIL → 提交测试文件
  │   返回：DONE / NEEDS_CONTEXT / BLOCKED
  │
  ├─ Step 2: 派遣执行 subagent (harness-executor, 模型按复杂度选择)
  │   task = "实现 Task N：{task 描述}
  │           spec 相关章节：{spec 章节}
  │           CLAUDE.md 编码规范：{相关规则摘要}
  │           测试文件路径：{TDD coder 提交的测试文件}
  │           分层规范参考：coding-skill"
  │   职责：写最小实现代码 → 确认所有测试通过 → 更新 summary.md → git commit
  │   返回：DONE / DONE_WITH_CONCERNS / BLOCKED
  │
  └─ Step 3: 派遣 spec 合规检查 (harness-reviewer, glm-5.1)
       task = "验证 Task N 的实现是否符合 spec：{task 的 spec 要求}
               代码 diff：{当前 task 的变更}"
       职责：验证代码是否实现 spec 要求
       通过 → complete_task(task-id)，进入下一个 task
       不通过 → 将问题传给 Step 2 重新派遣，修复后重审
```

**task 间流转规则：**
- Step 1 返回 DONE → 进入 Step 2
- Step 1 返回 NEEDS_CONTEXT → 提供缺失上下文后重新派遣
- Step 1 返回 BLOCKED → 暂停，向用户展示原因，等待决策
- Step 2 返回 DONE → 进入 Step 3
- Step 2 返回 DONE_WITH_CONCERNS → 评估问题，进入 Step 3 或回退
- Step 2 返回 BLOCKED → 暂停，向用户展示原因
- Step 3 不通过 → 将 problem list 传给 Step 2 重新派遣修复
- Step 3 通过 → complete_task(task-id)→ 下一个 task

**每个 agent 自带完整的执行指令（在 agent.md 中），主 agent 只需传入 task 上下文即可。**

**参考文档：**
- `xyz-harness-subagent-driven-development/SKILL.md` — task 调度模式和异常处理逻辑参考
- `xyz-harness-coding-skill/SKILL.md` + `specs/` — Clean Architecture 分层编码规范（如需要可加载到 executor 上）

**交付物：**
- TDD coder 产出的失败测试文件（每个 task 独立，已 git commit）
- 代码变更（已 git commit，含 summary.md 更新）
- TDD 单元测试（函数/类级）

### 2. L1 脚本检查

- 运行:`gate-script.sh 03 {project_root}`
- 检查项:
  - 编译/类型检查通过(运行 CLAUDE.md 中的编译命令)
  - 测试通过且 tests > 0
  - Lint 通过
- 失败 → 回退到 3 重新派遣执行 subagent 修复

### 3. L2 门禁 subagent

- 检查项:
  1. plan.md 中所有 task 对应的代码变更已提交(git log 检查)
  2. 编译/类型检查通过
  3. TDD 单元测试通过(tests > 0 && passed == total)
  4. 无残留 TODO / FIXME / placeholder
- 失败 → 回退到 3,将 fail.reason 传给执行 subagent 修复

### 4. complete_task(3)

### 5. 人工确认点:无

编码实现完成后自动进入阶段 4 编码评审。

---

## 阶段 4:编码评审

**调度流程:**

### 1. 派遣评审 subagent

| 项目 | 值 |
|------|---|
| Agent | harness-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer(执行评审模式) |
| 模型 | glm-5.1 |
| 输入 | spec.md + plan.md + git diff(阶段 3 的全部代码变更) + 项目根目录 |

**subagent 入口条件:**
- 阶段 3 门禁通过
- git diff 有内容(确实有代码变更)

**subagent 执行逻辑(概述):**
1. 读取 spec.md + plan.md(不继承阶段 3 编码 subagent 的上下文)
2. 读取 CLAUDE.md 中的编码规范
3. 读取 git diff(只看变更内容,不看编码过程)
4. 执行 expert-reviewer 执行评审模式:
   - spec 合规(代码是否实现了 spec 所有要求)
   - 代码质量(可读性、错误处理、边界条件)
   - 架构合规(是否违反 CLAUDE.md 中的架构约束)
   - 安全和性能
5. 每条意见标注 MUST FIX / LOW / INFO
6. 写入 `changes/reviews/code_review_v1.md`

**交付物:**
- `.xyz-harness/{主题}/changes/reviews/code_review_v{N}.md` - 编码评审报告

### 2. L1 脚本检查

不适用(阶段 4 无 L1 检查)。

### 3. L2 门禁 subagent

- 检查项:
  1. `code_review_v{N}.md` 存在且非空
  2. 无未解决的 MUST FIX 项
  3. 评审轮次 ≤ 2
- 失败 → 回退到 3,将 fail.reason(MUST FIX 列表)传给执行 subagent 修复代码

### 4. complete_task(4)

### 5. 人工确认点 3:编码评审后确认

**确认点展示(透传 subagent.summary):**

```
阶段 4 编码评审完成。

评审报告:{deliverables[0]}

{subagent.summary}

请确认:
1. 确认 - 进入测试编写
2. 有修改意见 - 告诉我改什么
3. 实现不符合预期 - 回到编码实现
```

**流转规则:**
- 确认 → 进入阶段 5
- 有修改意见 → 将用户意见作为输入,重新派遣执行 subagent 修改代码,修改后再派遣评审 subagent,重新走 L2 + 确认点
- 实现不符合预期 → 回退到阶段 3

---

## 阶段 5:测试编写

**调度流程:**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | harness-executor |
| 加载 Skill | xyz-harness-unit-test-write |
| 模型 | glm-5.1 |
| 输入 | spec.md + plan.md + git diff(阶段 3 代码变更) + 项目根目录 |

**subagent 入口条件:**
- 阶段 4 门禁通过且用户已确认
- 代码变更存在(有变更才能写接口级测试)

**subagent 执行逻辑(概述):**
1. 分析 git diff,识别所有变更的接口/API
2. 对每个变更接口:
   - 编写接口级测试(正常路径 + 边界条件 + 异常路径)
   - 优先使用真实数据构造用例(如果项目有数据源配置)
3. 运行测试确认通过
4. 提交测试代码

**交付物:**
- 接口级测试文件(已 git commit)

### 2. L1 脚本检查

- 运行:`gate-script.sh 05 {project_root}`
- 检查项:
  - 新增测试文件存在(git diff --name-only 中有 test 相关文件)
  - 新增测试通过
- 失败 → 回退到 5 修复测试

### 3. L2 门禁 subagent

- 检查项:
  1. 新增测试文件存在
  2. 新增测试数 > 0
  3. 所有新增测试通过
  4. 测试覆盖了 spec 中的关键验收标准
- 失败且原因 = 代码不可测试 → 回退到 3(要求重构代码结构)
- 失败且原因 = 测试质量问题 → 回退到 5 修复测试

### 4. complete_task(5)

### 5. 人工确认点:无

自动进入阶段 6 测试评审。

---

## 阶段 6:测试评审

**调度流程:**

### 1. 派遣评审 subagent

| 项目 | 值 |
|------|---|
| Agent | harness-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer(执行评审模式) |
| 模型 | glm-5.1 |
| 输入 | spec.md + 阶段 5 的测试代码 diff + 项目根目录 |

**subagent 入口条件:**
- 阶段 5 门禁通过
- 测试代码 diff 有内容

**subagent 执行逻辑(概述):**
1. 读取 spec.md(不继承阶段 5 的执行上下文)
2. 读取测试代码 diff
3. 执行 expert-reviewer 执行评审模式(测试评审视角):
   - 测试覆盖度(关键场景是否覆盖)
   - 测试质量(断言是否充分、是否测试了正确的东西)
   - 测试可维护性(是否过于脆弱)
   - 数据构造合理性
4. 每条意见标注 MUST FIX / LOW / INFO
5. 写入 `changes/reviews/test_review_v1.md`

**交付物:**
- `.xyz-harness/{主题}/changes/reviews/test_review_v{N}.md` - 测试评审报告

### 2. L1 脚本检查

不适用(阶段 6 无 L1 检查)。

### 3. L2 门禁 subagent

- 检查项:
  1. `test_review_v{N}.md` 存在且非空
  2. 无未解决的 MUST FIX 项
  3. 评审轮次 ≤ 2
- 失败 → 回退到 5,将 fail.reason(MUST FIX 列表)传给测试编写 subagent 修复

### 4. complete_task(6)

### 5. 人工确认点:无

自动进入阶段 7 代码推送。

---

## 阶段 7:代码推送

**调度流程:**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | harness-executor |
| 加载 Skill | zcommit(全局 skill,不加 xyz-harness- 前缀) |
| 模型 | glm-5-turbo |
| 输入 | 项目根目录 + 分支名 |

**subagent 入口条件:**
- 阶段 6 门禁通过
- 有未提交的变更或未推送的 commit

**subagent 执行逻辑(概述):**
1. 分析变更范围(git status --short)
2. 生成 commit message
3. git add + git commit(如果尚未提交)
4. git push -u origin {branch}

**交付物:**
- git push 成功
- 远端分支有新 commit

### 2. L1 脚本检查

- 运行:`gate-script.sh 07 {project_root} {branch_name}`
- 检查项:
  - git status --short 为空(无未提交变更)
  - git log origin/{branch} 有新 commit(push 成功)
- 失败 → 修复重试(网络/权限问题,不回退)

### 3. L2 门禁 subagent

- 检查项:
  1. 本地无未提交变更(git status --short 为空)
  2. push 成功(git log origin/{branch} 有新 commit)
- 失败 → 修复权限/网络问题后重试 push

### 4. complete_task(7)

### 5. 人工确认点:无

自动进入阶段 8 CI 验证。

---

## 阶段 8:CI 验证

**调度流程:**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | harness-executor |
| 加载 Skill | xyz-harness-verification-before-completion |
| 模型 | glm-5.1 |
| 输入 | 项目根目录 + CLAUDE.md 中的验证命令 |

**subagent 入口条件:**
- 阶段 7 门禁通过
- 代码已推送到远端

**subagent 执行逻辑(概述):**
1. 读取 CLAUDE.md 中的质量门禁章节
2. 依次执行所有验证命令(编译、类型检查、lint、测试)
3. 对每条命令:运行 → 读完整输出 → 检查 exit code → 记录结果
4. 如有 CI 配置(.github/workflows/ 等),触发 CI 并等待结果
5. 将所有验证输出写入 `changes/evidence/verification_output.md`
6. CI 结果写入 `changes/evidence/ci_result.md`

**门禁条件(硬编码,不可跳过):**
- 编译:exit code == 0
- 测试:exit code == 0 **且** test count > 0 **且** failures == 0
- Lint:exit code == 0

**交付物:**
- `.xyz-harness/{主题}/changes/evidence/verification_output.md` - 本地验证输出
- `.xyz-harness/{主题}/changes/evidence/ci_result.md` - CI 结果(如有)

### 2. L1 脚本检查

- 运行:`gate-script.sh 08 {project_root}`
- 检查项:
  - 运行 CLAUDE.md 中所有验证命令
  - 所有命令 exit code == 0
  - 测试数 > 0 且 passed == total
- 失败:
  - 测试数 = 0 → 回退到 5(测试未实际运行)
  - 编译错误 → 回退到 3(编译问题)
  - 测试失败 → 回退到 3 或 5(按错误类型判断)

### 3. L2 门禁 subagent

- 检查项:
  1. `verification_output.md` 存在
  2. 所有本地验证命令 exit code == 0
  3. 测试数 > 0 且 passed == total
  4. CI 结果:status == SUCCESS(如有 CI)
- 失败 → 按回退路由表处理(同 L1 失败路由)

### 4. complete_task(8)

### 5. 人工确认点:无

自动进入确认点 4。

---

## 确认点 4:部署目标确认

**位置:** 阶段 8 门禁通过后,阶段 9 开始前。

**确认点展示(透传 subagent.summary):**

```
阶段 8 CI 验证通过。

验证结果:{deliverables[0]}
CI 结果:{deliverables[1]}

{subagent.summary}

即将进入部署验证。请确认部署目标:
1. 确认 - 部署到目标环境
2. 修改目标 - 告诉我部署到哪里
3. 暂不部署 - 等一下再继续
```

**流转规则:**
- 确认 → 进入阶段 9
- 修改目标 → 更新部署配置 → 重新展示
- 暂不部署 → 暂停,等待用户回来

---

## 阶段 9:部署验证

**调度流程:**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | harness-executor |
| 加载 Skill | xyz-harness-deploy-verify |
| 模型 | glm-5.1 |
| 输入 | 项目根目录 + 部署目标环境 + 部署方式 |

**subagent 入口条件:**
- 阶段 8 门禁通过
- 用户已确认部署目标
- 部署命令/脚本存在

**subagent 执行逻辑(概述):**
1. 读取部署配置(从 CLAUDE.md 或项目配置文件)
2. 执行部署命令
3. 等待部署完成
4. 执行健康检查(HTTP 探测、关键接口可达性)
5. 记录部署结果到 `changes/evidence/deploy_result.md`

**交付物:**
- 部署成功
- `.xyz-harness/{主题}/changes/evidence/deploy_result.md` - 部署结果

### 2. L1 脚本检查

- 运行:`gate-script.sh 09 {project_root}`
- 检查项:
  - 健康检查端点返回 200(如果项目配置了健康检查)
- 失败:
  - 代码问题 → 回退到 3
  - 配置问题 → 就地修复后重试

### 3. L2 门禁 subagent

- 检查项:
  1. `deploy_result.md` 存在
  2. 部署状态为成功
  3. 健康检查通过
- 失败 → 代码问题回退到 3;配置问题就地修复后重试

### 4. complete_task(9)

### 5. 人工确认点:无

自动进入阶段 10。

---

## 阶段 10:用户最终确认

本阶段由主 agent 直接处理,不派遣 subagent。主 agent 只透传各阶段 subagent 返回的 summary,不读取交付物内容。

### 主 agent 执行逻辑:

1. 更新 loop_task_tracker:阶段 10 标记为完成
2. 向用户展示最终交付确认(基于各阶段 subagent.summary 拼接):

```
全部 11 阶段完成。

需求:[用户原始需求描述]
变更追溯:.xyz-harness/{主题}/changes/summary.md

阶段完成情况(基于各阶段 subagent.summary):
1 {阶段 1 summary}
2 {阶段 2 summary}
3 {阶段 3 summary}
4 {阶段 4 summary}
5 {阶段 5 summary}
6 {阶段 6 summary}
7 {阶段 7 summary}
8 {阶段 8 summary}
9 {阶段 9 summary}

请确认最终交付:
1. 确认完成 - 进入自动复盘
2. 需求不符 - 回到需求分析(说明哪里不符)
3. 实现有问题 - 回到编码实现(说明什么问题)
```

### 流转规则:
- 确认完成 → 进入阶段 11 自动复盘
- 需求不符 → 回退到阶段 1(更新 loop_task_tracker,重置 1 及后续)
- 实现有问题 → 回退到阶段 3(更新 loop_task_tracker,重置 3 及后续)

---

## 阶段 11:自动复盘

本阶段自动执行,不需要人工确认。

**调度流程:**

### 1. 派遣复盘 subagent

| 项目 | 值 |
|------|---|
| Agent | harness-reviewer |
| 加载 Skill | 无(通用分析能力) |
| 模型 | glm-5.1 |
| 输入 | summary.md + 各阶段评审报告路径 + 回退记录 + .xyz-harness/{需求}/metrics.json |

**subagent 入口条件:**
- 阶段 10 用户已确认完成
- summary.md 存在

**subagent 执行逻辑(概述):**
1. 读取 summary.md,了解完整流程状态
2. 读取各阶段评审报告(reviews/ 目录)
3. 读取需求目录下的 metrics.json
4. 分析:
   - 哪些阶段发生了回退?根因分类(需求不清/代码问题/测试问题/环境问题)
   - 评审 agent 是否有效拦截了问题?(评审发现的问题 vs 用户发现的问题)
   - L1 gate 脚本是否有遗漏?(该拦没拦的场景)
   - 哪些阶段 AI 犯了不该犯的错?(对照 CLAUDE.md 规则检查)
   - CLAUDE.md 缺少什么规则?需要新增或修改什么?
5. 产出 retrospective.md

**交付物:**
- `.xyz-harness/{主题}/changes/retrospective.md` - 复盘报告

### 2. 无 L1/L2 门禁检查

复盘结果不影响流程。

### 3. complete_task(11)

### 4. 无人工确认点

### 5. 复盘产出后:检查可改进项

如果有 CLAUDE.md 改进建议,主 agent 向用户展示:

```
阶段 11 复盘完成。报告:changes/retrospective.md

发现以下可改进项:
1. [问题描述] → 建议新增 CLAUDE.md 规则:[规则]
2. [问题描述] → 建议修改规则:[原规则] → [新规则]

是否采纳?采纳后我会更新 CLAUDE.md。
```

如果发现 Agent 因领域知识缺失而犯错,读取 `references/wiki-structure.md`,建议用户补充项目 Wiki 对应文档。

### 6. 运行指标记录

主 agent 将本次需求的所有运行指标汇总写入 `.xyz-harness/{yyyy-MM-dd}-{主题}/metrics.json`:

```json
{
  "requirement": "需求名称",
  "date": "2026-05-08",
  "total_duration_seconds": 3600,
  "total_tokens": 150000,
  "stages": [
    {"stage": 1, "duration_seconds": 300, "tokens": 15000, "status": "pass", "retries": 0},
    {"stage": 2, "duration_seconds": 120, "tokens": 8000, "status": "pass", "retries": 1}
  ],
  "rollbacks": [
    {"from": 4, "to": 3, "reason": "编码评审 MUST FIX"}
  ],
  "review_effectiveness": {
    "issues_found_by_agent": 5,
    "issues_found_by_user": 1
  }
}
```

---

# 第七部分:回退路由表

| 失败场景 | 回退到 | 说明 |
|---------|--------|------|
| 2 需求评审不通过 | → 1 | 计划不合理或需求不清晰 |
| 3 spec 合规不通过 | → 当前 task 内修复 | task 级,不回退整个阶段 |
| 4 编码评审不通过(≤2轮) | → 3 | 代码质量问题 |
| 5 代码不可测试 | → 3 | 代码结构不支持测试编写 |
| 6 测试评审不通过(≤2轮) | → 5 | 测试质量问题 |
| 7 push 失败 | → 修复重试 | 网络/权限问题,不回退 |
| 8 CI 测试数=0 | → 5 | 测试未实际运行 |
| 8 CI 编译错误 | → 3 | 编译问题 |
| 8 CI 测试失败 | → 3 或 5 | 按错误类型判断 |
| 9 部署失败 | → 3 或配置修复 | 代码问题回 3,配置问题就地修复 |
| 10 需求不符 | → 1 | 方向错误 |
| 10 实现有问题 | → 3 | 实现有误 |
| Phase2 Stage4 E2E 阻塞级失败 | → Stage1 | 端到端测试发现功能缺陷 |
| Phase2 Stage4 E2E 环境问题 | → 修复重试 | 环境配置问题，不回退 |

## 回退时 tracker 处理逻辑

回退发生时:

1. 识别回退目标阶段 N
2. 将 tracker 中阶段 N 及之后所有阶段重置为未完成
3. 清除 `.xyz-harness/gate/` 中被重置阶段的 `.pass` 标记文件
4. 重新派遣执行 subagent 从阶段 N 开始

---

# 第八部分:异常处理

## 评审循环超限

当评审轮次超出上限时(需求评审 > 3 轮,编码/测试评审 > 2 轮):

1. 主 agent 暂停
2. 向用户展示:

```
阶段 {N} 评审已达到轮次上限({X}轮),仍未通过。

最后一次评审报告:{路径}
未解决的 MUST FIX:{列出}

请决策:
1. 继续评审 - 再给一轮
2. 接受当前状态 - 跳过评审,进入下一阶段
3. 回退 - 回到 {回退目标}
```

## subagent 返回 blocked

当执行 subagent 连续 2 次返回 blocked:

1. 主 agent 暂停
2. 向用户说明阻塞原因
3. 建议拆分任务、换方案、或人工介入
4. 等待用户决策

## subagent 返回 fail

当 subagent 返回 fail:

1. 检查是否有 rollback_target
2. 有 → 按回退路由表处理
3. 无 → 向用户展示 fail.reason,等待用户决策

---

# 第九部分:产出物清单

一次完整的 dev-flow 执行后,项目中有以下产出物:

```
.xyz-harness/{yyyy-MM-dd}-{主题}/
├── spec.md                              # 需求设计文档
├── plan.md                              # 实现计划
├── e2e-test-plan.md                     # E2E 测试计划
└── changes/
    ├── summary.md                       # 全流程追溯摘要
    ├── reviews/
    │   ├── plan_review_v1.md            # 计划评审记录
    │   ├── code_review_v1.md            # 编码评审记录(可能有 v2+)
    │   └── test_review_v1.md            # 测试评审记录
    ├── evidence/
    │   ├── verification_output.md       # 本地验证输出
    │   ├── ci_result.md                 # CI 结果
    │   ├── e2e-test-report.md           # E2E 测试报告
    │   └── deploy_result.md             # 部署结果
    └── retrospective.md                 # 复盘记录

.xyz-harness/
├── gate/                                # gitignore
│   ├── stage-01.pass                    # 各阶段 L1 门禁标记
│   ├── stage-03.pass
│   ├── stage-05.pass
│   ├── stage-07.pass
│   ├── stage-08.pass
│   └── stage-09.pass
└── {yyyy-MM-dd}-{主题}/
    ├── spec.md
    ├── plan.md
    ├── metrics.json                    # 运行指标
    └── changes/
        ├── summary.md
        ├── reviews/
        ├── evidence/
        └── retrospective.md

wiki/                                    # 如果阶段 11 建议了补充
└── [按需新增或更新的领域文档]

CLAUDE.md                                # 如果阶段 11 建议了规则更新
```

---

# 第十部分:持续改进

## 阶段 11 复盘说明

每次需求完成后自动执行复盘 subagent,分析:
- 回退根因分类(需求不清/代码问题/测试问题/环境问题)
- 评审有效性(agent 发现 vs 用户发现)
- L1 gate 脚本遗漏场景
- CLAUDE.md 缺失规则

## 运行指标

每个需求完成后,运行指标记录到 `.xyz-harness/{yyyy-MM-dd}-{主题}/metrics.json`,包含:
- 总 token 消耗和耗时
- 各阶段 subagent 的 token/耗时
- 回退次数和回退原因
- 评审有效率

## 跨需求聚合

> 当用户说"更新 harness health"、"聚合指标"、"harness 健康报告"时,扫描 `.xyz-harness/` 下所有子目录的 `metrics.json`,聚合分析后输出到终端。

聚合内容包含:
- 累计需求数
- 平均回退次数
- 常见错误模式
- 评审有效率
- CLAUDE.md 改进建议(从各次复盘聚合)

---

## 流程总结

### 二阶段模式（推荐）

流程拆为两个独立 session，通过固定产出文档衔接：

```
╔════════════════════════════════════════════════════════════╗
║ Phase 1: 需求沟通 (/track 命令)                            ║
║   [交互] Step 1: 需求讨论 (brainstorming)                   ║
║   [交互] Step 2: Spec 编写                                  ║
║   [自动] Step 3: 引用扫描 (spec-ref-scan.sh)                ║
║   [交互] Step 4: Plan 编写                                  ║
║   [自动] Step 5: E2E 测试计划 (主agent框架 + subagent用例)   ║
║   [自动] Step 6: 计划评审 (reviewer subagent, ≤3轮)         ║
║   [交互] Step 7: 用户确认 ← 强制暂停                        ║
║   产出: spec.md + plan.md + e2e-test-plan.md + summary.md   ║
╚════════════════════════════════════════════════════════════╝
    ↓ 用户 /new 创建新 session
╔════════════════════════════════════════════════════════════╗
║ Phase 2: 开发交付 (/loop 命令)                              ║
║   [自动] Stage 1: 编码实现 (TDD + 实现, 按 task 迭代)       ║
║   [自动] Stage 2: 编码评审 (reviewer, ≤2轮)                 ║
║   [自动] Stage 3: 单元测试编写 (Change-driven Testing)     ║
║   [自动] Stage 4: E2E 测试执行 (按 e2e-test-plan.md)       ║
║   [自动] Stage 5: 测试评审 (reviewer, ≤2轮)                ║
║   [自动] Stage 6: 推送 + CI + 部署                           ║
║   [自动] Stage 7: 自动复盘                                   ║
║   门禁: harness-state.sh + gate-script.sh 强制执行          ║
╚════════════════════════════════════════════════════════════╝
```

**Phase 1 产出物是给 Phase 2 agent 的完整指令**，必须自包含、详细。

### 单阶段模式（兼容旧流程）

```
需求描述
  → [前置检查] worktree / CLAUDE.md / CI
  → [自动] 1 需求分析
            产出:spec.md + plan.md + summary.md
            L1: gate-script.sh 01 + L2: gate-checker
  → ✋ 确认点1:需求设计确认
  → [自动] 2 需求评审
            产出:plan_review_v{N}.md
            L2: gate-checker(≤3轮)
  → ✋ 确认点2:计划评审确认
  → [自动] 3 编码实现(主 agent 按 task 迭代调度)
            每个 task: TDD coder → 编码实现 → spec 合规检查
            产出:代码 + 单元测试
            L1: gate-script.sh 03 + L2: gate-checker
  → [自动] 4 编码评审
            产出:code_review_v{N}.md
            L2: gate-checker(≤2轮)
  → ✋ 确认点3:编码评审确认
  → [自动] 5 测试编写(Change-driven Testing)
            产出:接口级测试
            L1: gate-script.sh 05 + L2: gate-checker
  → [自动] 6 测试评审
            产出:test_review_v{N}.md
            L2: gate-checker(≤2轮)
  → [自动] 7 代码推送(zcommit)
            L1: gate-script.sh 07 + L2: gate-checker
  → [自动] 8 CI 验证
            产出:verification_output.md + ci_result.md
            L1: gate-script.sh 08 + L2: gate-checker
  → ✋ 确认点4:部署目标确认
  → [自动] 9 部署验证
            产出:deploy_result.md
            L1: gate-script.sh 09 + L2: gate-checker
  → [自动] 10 用户确认
  → ✋ 确认点5:最终交付确认
  → [自动] 11 自动复盘
            产出:retrospective.md + metrics JSON
```

**用户只需要介入 5 次,其余全自动。每次需求都有完整的 Audit Trail。**
