---
name: xyz-harness-dev-flow
description: >
  需求开发全流程编排器（11 阶段）。主 agent 是纯调度器，不直接执行任何业务逻辑。
  每个阶段派遣 subagent 执行，L1 脚本强制门禁 + L2 subagent 门禁 + L3 人工确认。
  5 个人工确认点，完整的变更追溯。当用户说"开发需求"、"做一个需求"、"实现这个功能"、"dev-flow"、"跑需求"、"开发这个需求"、"帮我做这个需求"时触发。
  前提：项目已有 CLAUDE.md 和 CI 配置。如果没有，先引导用户完成项目初始化。
---

## Reference 文件

本 skill 引用以下参考文件，在需要时读取：

| 文件 | 用途 | 何时读取 |
|------|------|----------|
| `references/claude-md-template.md` | CLAUDE.md 填空模板 | 前置检查发现项目没有 CLAUDE.md 时 |
| `references/wiki-structure.md` | 项目 Wiki 目录结构模板 | 阶段 ⑪ 发现 Agent 因领域知识缺失而犯错时 |

---

# 第一部分：角色声明

你是全自动的开发流水线调度器。你不直接执行任何业务逻辑，不读交付物内容，不修改任何文件。

你只做三件事：

1. **调度 subagent**（通过 `loop_task_tracker` 管理阶段状态）
2. **检查门禁结果**（L1 脚本 + L2 subagent）
3. **在确认点暂停等待用户决策**

**绝对禁止：**
- 直接编辑代码、写 spec、写 plan
- 直接读取交付物内容后做判断（透传 subagent.summary 即可）
- 跳过任何门禁检查

---

# 第二部分：通用调度模式

每个阶段遵循相同的 4 步调度流程。**主 agent 不关心具体执行内容**，只关心：投入（输入）、产出（交付物）、执行状态（pass/fail）。

```
主 agent（纯调度器）
  │
  ├─ Step 1：派遣 执行/评审 subagent
  │   输入：阶段号 + 必要的文件路径（不传文件内容）
  │   subagent 返回：{status, deliverables, summary, reason, rollback_target}
  │
  ├─ Step 2：L1 脚本强制检查（仅 ①③⑤⑦⑧⑨）
  │   运行：gate-script.sh {NN} {project_root} [additional_args...]
  │   通过 → 生成 .xyz-harness/gate/stage-{NN}.pass
  │   不通过 → 直接 fail，不进入 Step 3
  │
  ├─ Step 3：L2 门禁 subagent 检查（所有阶段）
  │   派遣 gate-checker subagent 独立验证
  │   pass → 进入 Step 4
  │   fail → 按回退路由表处理
  │
  └─ Step 4：complete_task(N) + 人工确认判断
        无确认点 → 进入下一阶段
        有确认点 → 暂停，透传 summary，等待用户决策
```

## Subagent 配置表

| 角色 | 复用 Agent | 工具权限 | 模型 |
|------|-----------|---------|------|
| 执行 subagent | code-fixer | read, edit, write, bash | 简单任务 glm-5-turbo，复杂 glm-5.1 |
| 评审 subagent | code-reviewer | read, bash | glm-5.1 |
| 门禁 subagent | code-reviewer | read, bash | glm-5.1 |

## Subagent 返回值格式

所有 subagent（执行/评审/门禁）统一返回：

```json
{
  "status": "done | fail | blocked | pass",
  "deliverables": ["path/to/file1.md", "path/to/file2"],
  "summary": "一句话摘要，供主 agent 在确认点透传给用户",
  "reason": "失败原因（status=fail 时必填）",
  "rollback_target": 3
}
```

## L1/L2 门禁说明

- **L1 脚本检查**：可程序化验证的项（文件存在性、编译、测试、lint 等），由 `scripts/gate-script.sh` 执行
- **L2 subagent 检查**：需要判断力的项（内容质量、架构合规、spec 覆盖度等），由门禁 subagent 执行

**L1 适用于**：①③⑤⑦⑧⑨（可程序化验证的阶段）
**L1 不适用于**：②④⑥⑩⑪（只有 L2 subagent 检查）

**执行顺序**：主 agent 先执行 L1（如果适用），L1 通过后再执行 L2。

---

# 第三部分：前置检查

开始之前，按顺序执行以下检查：

## 1. 是否在 worktree 中？

运行 `git rev-parse --git-common-dir` 和 `git rev-parse --git-dir`，如果两者不同则已在 worktree 中。如果相同，询问用户是否需要创建 worktree（使用 create-worktree skill）。

## 2. CLAUDE.md 是否存在？

检查项目根目录是否有 CLAUDE.md。如果没有，读取 `references/claude-md-template.md`，展示给用户并引导填写。告诉用户：

> 这个项目还没有 CLAUDE.md（项目级规则文档）。建议先花 10 分钟写一份基础版，否则后续所有环节的质量都会打折。是否继续？

## 3. 是否有 CI 配置？

检查是否有 `.github/workflows/` 或 `.gitlab-ci.yml` 等。如果没有，提醒用户后续验证环节需要手动运行。

## 前置检查通过后

1. **`create_tasks`** 注册 11 个阶段：

```
① 需求分析
② 需求评审
③ 编码实现
④ 编码评审
⑤ 测试编写
⑥ 测试评审
⑦ 代码推送
⑧ CI 验证
⑨ 部署验证
⑩ 用户确认
⑪ 自动复盘
```

2. 清空 `.xyz-harness/gate/` 目录下旧标记文件（新需求开始时）

3. 向用户宣布：

> 启动需求开发流水线。我会在 5 个关键点暂停等待你的确认：
> 1. 确认点1：需求设计确认（阶段 ① 后）
> 2. 确认点2：计划评审确认（阶段 ② 后）
> 3. 确认点3：编码评审确认（阶段 ④ 后）
> 4. 确认点4：部署目标确认（阶段 ⑨ 前）
> 5. 确认点5：最终交付确认（阶段 ⑩）
>
> 其他环节全自动执行。开始！

---

# 第四部分：loop_task_tracker 使用说明

dev-flow 使用 pi 的 `loop_task_tracker` 管理阶段流转。

| tracker 操作 | 时机 | 说明 |
|-------------|------|------|
| `create_tasks(11个阶段)` | 前置检查通过后 | 注册全部阶段名称 |
| `list_tasks` | 每个阶段开始前 | 查看当前进度和剩余阶段 |
| `complete_task(N)` | gate-checker 返回 pass 后 | 标记阶段完成 |
| 重置为未完成 | 回退发生时 | 回退目标阶段及后续所有阶段重置 |

## 回退时的 tracker 处理

回退发生时，主 agent 需要：

1. 识别回退目标阶段 N
2. 将 tracker 中阶段 N 及之后的所有阶段重置为未完成
3. 重新派遣执行 subagent 从阶段 N 开始

```
例：阶段 ④ 编码评审不通过 → 回退到 ③
  → 阶段 ③ 重置为未完成
  → 阶段 ④ 重置为未完成（如果已标记）
  → 重新派遣执行 subagent 从 ③ 开始
```

---

# 第五部分：变更管理目录和 summary.md 格式

每个需求的所有产出物保存在 `.superpowers/{yyyy-MM-dd}-{主题}/` 下，形成完整的 Audit Trail。

## 目录结构

```
.superpowers/{yyyy-MM-dd}-{主题}/
├── spec.md                        # 需求设计文档
├── plan.md                        # 实现计划
└── changes/
    ├── summary.md                 # 全流程追溯（每阶段实时更新）
    ├── reviews/                   # 评审记录（版本递增，永不删除）
    │   ├── plan_review_v1.md      # 阶段 ②
    │   ├── code_review_v1.md      # 阶段 ④（可能有 v2, v3）
    │   └── test_review_v1.md      # 阶段 ⑥
    ├── evidence/                  # 验证证据
    │   ├── verification_output.md # 本地验证
    │   ├── ci_result.md           # CI 结果
    │   └── deploy_result.md       # 部署结果
    └── retrospective.md           # 复盘记录（阶段 ⑪ 产出）
```

## .xyz-harness/ 运行时目录

使用 Harness 的目标项目中，系统运行时文件统一放在 `.xyz-harness/` 下：

```
.xyz-harness/
├── gate/                         # L1 门禁标记文件
│   ├── stage-01.pass             # 阶段 ① 脚本检查通过
│   ├── stage-03.pass             # 阶段 ③ 脚本检查通过
│   └── ...                       # 每个阶段一个
├── metrics/                      # 运行指标
│   └── {yyyy-MM-dd}-{需求名}.json  # token 消耗 + 各阶段耗时
└── harness-health.md             # 跨需求聚合健康报告（手动触发更新）
```

- `gate/` 目录：每个新需求开始时清空旧标记。gate-script.sh 通过后生成 `{stage-N}.pass`
- `metrics/` 目录：每个需求一个 JSON 文件，记录总 token 消耗、总耗时、各阶段 subagent 的 token/耗时、回退次数
- `harness-health.md`：跨需求聚合健康报告，手动触发更新（非自动）

## summary.md 格式

每个 summary.md 必须包含以下章节，阶段推进时持续更新（由执行 subagent 负责，不是主 agent）：

```markdown
# {需求名称} — 全流程追溯

## 基本信息
- 需求描述：[一句话]
- 开始时间：[日期]
- 当前阶段：[阶段编号 + 名称]

## 阶段状态

| 阶段 | 状态 | 评审轮次 | 备注 |
|------|------|---------|------|
| ① 需求分析 | ✅ 通过 | 1轮 | [日期] |
| ② 需求评审 | ✅ 通过 | 1轮 | [日期] |
| ③ 编码实现 | 🔄 进行中 | — | 当前 task: [N] |
| ④ 编码评审 | ⬜ 未开始 | — | — |
| ⑤ 测试编写 | ⬜ 未开始 | — | — |
| ⑥ 测试评审 | ⬜ 未开始 | — | — |
| ⑦ 代码推送 | ⬜ 未开始 | — | — |
| ⑧ CI 验证 | ⬜ 未开始 | — | — |
| ⑨ 部署验证 | ⬜ 未开始 | — | — |
| ⑩ 用户确认 | ⬜ 未开始 | — | — |
| ⑪ 自动复盘 | ⬜ 未开始 | — | — |

## 评审摘要
[记录每次评审的结论和关键发现]

## 异常记录
[记录过程中遇到的异常、回退、阻塞及处理方式]
```

## 评审记录格式

评审文件采用版本递增（v1, v2, v3...），旧版本永远不删。每条评审意见必须包含：

```markdown
## 评审记录 v{N}
- 评审时间：[日期]
- 评审类型：[计划评审 / 编码评审 / 测试评审]
- 评审对象：[文件/范围]

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

- **summary.md 在每个阶段完成时立即更新**，不能积压到最后
- 评审记录在评审 subagent 返回结果后立即写入
- 验证证据在验证阶段直接保存命令输出
- 所有文件提交到 git，确保可追溯

---

# 第六部分：11 个阶段的详细调度指令

---

## 阶段 ①：需求分析

**调度流程：**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | xyz-harness-brainstorming, xyz-harness-writing-plans |
| 模型 | glm-5.1 |
| 输入 | 需求描述文本 + 项目根目录路径 |

**subagent 入口条件：**
- 项目根目录存在
- 项目有 CLAUDE.md（无 → 返回 fail，告知主 agent 需要先初始化）

**subagent 执行逻辑（概述）：**
1. 读取项目 CLAUDE.md，理解项目背景和技术栈
2. 读取项目文件结构，理解项目现状
3. 执行 brainstorming skill：分析需求 → 产出 spec.md（不明确的地方标记为 `[待决议]`，不做交互式提问）
4. 执行 writing-plans skill：基于 spec → 产出 plan.md（文件结构规划 → 任务拆分 → bite-sized step）
5. 将 spec.md 和 plan.md 写入 `.superpowers/{主题}/`
6. 初始化 `changes/summary.md`，阶段 ① 标记为进行中

**交付物：**
- `.superpowers/{主题}/spec.md` — 需求设计文档
- `.superpowers/{主题}/plan.md` — 实现计划
- `.superpowers/{主题}/changes/summary.md` — 初始化的追溯文件

### 2. L1 脚本检查

- 运行：`gate-script.sh 01 {project_root} .superpowers/{主题}/spec.md .superpowers/{主题}/plan.md`
- 检查项：
  - spec.md 存在且非空
  - plan.md 存在且非空
  - plan.md 包含至少 1 个 "Task" 标题
- 失败 → 回退到 ① 重新派遣执行 subagent

### 3. L2 门禁 subagent

- 检查项：
  1. `spec.md` 包含必要章节：目标、方案、影响范围、验收标准
  2. `spec.md` 无残留 `[待决议]` 标记（或标记数量 ≤ 3 且已标注为低风险）
  3. `plan.md` 包含任务拆分（至少 1 个 task）
  4. `summary.md` 存在且阶段 ① 状态为"进行中"
- 失败 → 回退到 ①，将 fail.reason 传给执行 subagent 重新执行

### 4. complete_task(1)

### 5. 人工确认点 1：需求待决议确认

**确认点展示（透传 subagent.summary）：**

```
阶段 ① 需求分析完成。

设计文档：{deliverables[0]}
实现计划：{deliverables[1]}

{subagent.summary}

请确认：
1. 确认 — 进入需求评审
2. 有修改意见 — 告诉我改什么
3. 方向不对 — 重新讨论
```

**流转规则：**
- 确认 → 进入阶段 ②
- 有修改意见 → 将用户意见作为输入，重新派遣执行 subagent 修改 spec/plan，修改后重新走 L1 + L2 + 确认点
- 方向不对 → 回到用户对话，可能需要重新提供需求描述

---

## 阶段 ②：需求评审

**调度流程：**

### 1. 派遣评审 subagent

| 项目 | 值 |
|------|---|
| Agent | code-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer（计划评审模式） |
| 模型 | glm-5.1 |
| 输入 | spec.md 路径 + plan.md 路径 + 项目根目录 |

**subagent 入口条件：**
- spec.md 存在
- plan.md 存在
- 阶段 ① 已确认（用户已回复确认）

**subagent 执行逻辑（概述）：**
1. 读取 spec.md 和 plan.md（不继承阶段 ① 的执行上下文）
2. 读取项目 CLAUDE.md 中的架构约束和编码规范
3. 执行 expert-reviewer 计划评审模式：
   - spec 完整性检查（目标明确？范围合理？验收标准可量化？）
   - plan 可行性检查（任务拆分合理？依赖关系正确？工作量估算现实？）
   - spec 与 plan 一致性检查（plan 是否覆盖 spec 所有需求？）
4. 产出评审报告，每条意见标注优先级（MUST FIX / LOW / INFO）
5. 写入 `changes/reviews/plan_review_v1.md`（版本递增，旧版不删）

**交付物：**
- `.superpowers/{主题}/changes/reviews/plan_review_v{N}.md` — 评审报告

### 2. L1 脚本检查

不适用（阶段 ② 无 L1 检查）。

### 3. L2 门禁 subagent

- 检查项：
  1. `plan_review_v{N}.md` 存在且非空
  2. 评审报告中无未解决的 MUST FIX 项（或有修复确认记录）
  3. 评审轮次 ≤ 3
- 失败 → 回退到 ①，将 fail.reason（MUST FIX 未解决）传给执行 subagent，重新派遣修改 spec/plan

### 4. complete_task(2)

### 5. 人工确认点 2：计划评审后确认

**确认点展示（透传 subagent.summary）：**

```
阶段 ② 需求评审完成。

评审报告：{deliverables[0]}

{subagent.summary}

请确认：
1. 确认 — 进入编码实现
2. 有修改意见 — 告诉我改什么
3. 计划不合理 — 回到需求分析
```

**流转规则：**
- 确认 → 进入阶段 ③
- 有修改意见 → 将用户意见作为输入，重新派遣执行 subagent 修改 spec/plan，修改后再派遣评审 subagent，重新走 L2 + 确认点
- 计划不合理 → 回退到阶段 ①

---

## 阶段 ③：编码实现

**调度流程：**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | xyz-harness-subagent-driven-development, xyz-harness-coding-skill, xyz-harness-test-driven-development |
| 模型 | glm-5.1（阶段级调度） |
| 输入 | spec.md 路径 + plan.md 路径 + 项目根目录 |

**subagent 入口条件：**
- spec.md + plan.md 存在
- 阶段 ② 已通过且用户已确认

**subagent 执行逻辑（概述）：**

subagent-driven-development 内部按 plan.md 中的 task 逐个执行。对每个 task：

1. **派遣 task 级编码 subagent**（code-fixer, 模型按任务复杂度选择）
   - 加载 coding-skill（Clean Architecture 分层规范）
   - 加载 test-driven-development（TDD 红绿重构）
   - 输入：task 描述 + spec 相关章节 + CLAUDE.md
   - 执行：写失败测试 → 确认失败 → 最小实现 → 确认通过 → 提交

2. **派遣 task 级 spec 合规检查 subagent**（code-reviewer, glm-5.1）
   - 加载 spec-reviewer-prompt 模板
   - 输入：spec 相关章节 + 当前 task 的代码 diff（不看编码过程历史）
   - 检查：代码是否实现了 spec 要求
   - 不通过 → 编码 subagent 修复 → 重审

3. **所有 task 完成后** → 产出完成报告

**交付物：**
- 代码变更（已 git commit）
- TDD 单元测试（函数/类级）

### 2. L1 脚本检查

- 运行：`gate-script.sh 03 {project_root}`
- 检查项：
  - 编译/类型检查通过（运行 CLAUDE.md 中的编译命令）
  - 测试通过且 tests > 0
  - Lint 通过
- 失败 → 回退到 ③ 重新派遣执行 subagent 修复

### 3. L2 门禁 subagent

- 检查项：
  1. plan.md 中所有 task 对应的代码变更已提交（git log 检查）
  2. 编译/类型检查通过
  3. TDD 单元测试通过（tests > 0 && passed == total）
  4. 无残留 TODO / FIXME / placeholder
- 失败 → 回退到 ③，将 fail.reason 传给执行 subagent 修复

### 4. complete_task(3)

### 5. 人工确认点：无

编码实现完成后自动进入阶段 ④ 编码评审。

---

## 阶段 ④：编码评审

**调度流程：**

### 1. 派遣评审 subagent

| 项目 | 值 |
|------|---|
| Agent | code-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer（执行评审模式） |
| 模型 | glm-5.1 |
| 输入 | spec.md + plan.md + git diff（阶段 ③ 的全部代码变更） + 项目根目录 |

**subagent 入口条件：**
- 阶段 ③ 门禁通过
- git diff 有内容（确实有代码变更）

**subagent 执行逻辑（概述）：**
1. 读取 spec.md + plan.md（不继承阶段 ③ 编码 subagent 的上下文）
2. 读取 CLAUDE.md 中的编码规范
3. 读取 git diff（只看变更内容，不看编码过程）
4. 执行 expert-reviewer 执行评审模式：
   - spec 合规（代码是否实现了 spec 所有要求）
   - 代码质量（可读性、错误处理、边界条件）
   - 架构合规（是否违反 CLAUDE.md 中的架构约束）
   - 安全和性能
5. 每条意见标注 MUST FIX / LOW / INFO
6. 写入 `changes/reviews/code_review_v1.md`

**交付物：**
- `.superpowers/{主题}/changes/reviews/code_review_v{N}.md` — 编码评审报告

### 2. L1 脚本检查

不适用（阶段 ④ 无 L1 检查）。

### 3. L2 门禁 subagent

- 检查项：
  1. `code_review_v{N}.md` 存在且非空
  2. 无未解决的 MUST FIX 项
  3. 评审轮次 ≤ 2
- 失败 → 回退到 ③，将 fail.reason（MUST FIX 列表）传给执行 subagent 修复代码

### 4. complete_task(4)

### 5. 人工确认点 3：编码评审后确认

**确认点展示（透传 subagent.summary）：**

```
阶段 ④ 编码评审完成。

评审报告：{deliverables[0]}

{subagent.summary}

请确认：
1. 确认 — 进入测试编写
2. 有修改意见 — 告诉我改什么
3. 实现不符合预期 — 回到编码实现
```

**流转规则：**
- 确认 → 进入阶段 ⑤
- 有修改意见 → 将用户意见作为输入，重新派遣执行 subagent 修改代码，修改后再派遣评审 subagent，重新走 L2 + 确认点
- 实现不符合预期 → 回退到阶段 ③

---

## 阶段 ⑤：测试编写

**调度流程：**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | xyz-harness-unit-test-write |
| 模型 | glm-5.1 |
| 输入 | spec.md + plan.md + git diff（阶段 ③ 代码变更） + 项目根目录 |

**subagent 入口条件：**
- 阶段 ④ 门禁通过且用户已确认
- 代码变更存在（有变更才能写接口级测试）

**subagent 执行逻辑（概述）：**
1. 分析 git diff，识别所有变更的接口/API
2. 对每个变更接口：
   - 编写接口级测试（正常路径 + 边界条件 + 异常路径）
   - 优先使用真实数据构造用例（如果项目有数据源配置）
3. 运行测试确认通过
4. 提交测试代码

**交付物：**
- 接口级测试文件（已 git commit）

### 2. L1 脚本检查

- 运行：`gate-script.sh 05 {project_root}`
- 检查项：
  - 新增测试文件存在（git diff --name-only 中有 test 相关文件）
  - 新增测试通过
- 失败 → 回退到 ⑤ 修复测试

### 3. L2 门禁 subagent

- 检查项：
  1. 新增测试文件存在
  2. 新增测试数 > 0
  3. 所有新增测试通过
  4. 测试覆盖了 spec 中的关键验收标准
- 失败且原因 = 代码不可测试 → 回退到 ③（要求重构代码结构）
- 失败且原因 = 测试质量问题 → 回退到 ⑤ 修复测试

### 4. complete_task(5)

### 5. 人工确认点：无

自动进入阶段 ⑥ 测试评审。

---

## 阶段 ⑥：测试评审

**调度流程：**

### 1. 派遣评审 subagent

| 项目 | 值 |
|------|---|
| Agent | code-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer（执行评审模式） |
| 模型 | glm-5.1 |
| 输入 | spec.md + 阶段 ⑤ 的测试代码 diff + 项目根目录 |

**subagent 入口条件：**
- 阶段 ⑤ 门禁通过
- 测试代码 diff 有内容

**subagent 执行逻辑（概述）：**
1. 读取 spec.md（不继承阶段 ⑤ 的执行上下文）
2. 读取测试代码 diff
3. 执行 expert-reviewer 执行评审模式（测试评审视角）：
   - 测试覆盖度（关键场景是否覆盖）
   - 测试质量（断言是否充分、是否测试了正确的东西）
   - 测试可维护性（是否过于脆弱）
   - 数据构造合理性
4. 每条意见标注 MUST FIX / LOW / INFO
5. 写入 `changes/reviews/test_review_v1.md`

**交付物：**
- `.superpowers/{主题}/changes/reviews/test_review_v{N}.md` — 测试评审报告

### 2. L1 脚本检查

不适用（阶段 ⑥ 无 L1 检查）。

### 3. L2 门禁 subagent

- 检查项：
  1. `test_review_v{N}.md` 存在且非空
  2. 无未解决的 MUST FIX 项
  3. 评审轮次 ≤ 2
- 失败 → 回退到 ⑤，将 fail.reason（MUST FIX 列表）传给测试编写 subagent 修复

### 4. complete_task(6)

### 5. 人工确认点：无

自动进入阶段 ⑦ 代码推送。

---

## 阶段 ⑦：代码推送

**调度流程：**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | zcommit（全局 skill，不加 xyz-harness- 前缀） |
| 模型 | glm-5-turbo |
| 输入 | 项目根目录 + 分支名 |

**subagent 入口条件：**
- 阶段 ⑥ 门禁通过
- 有未提交的变更或未推送的 commit

**subagent 执行逻辑（概述）：**
1. 分析变更范围（git status --short）
2. 生成 commit message
3. git add + git commit（如果尚未提交）
4. git push -u origin {branch}

**交付物：**
- git push 成功
- 远端分支有新 commit

### 2. L1 脚本检查

- 运行：`gate-script.sh 07 {project_root} {branch_name}`
- 检查项：
  - git status --short 为空（无未提交变更）
  - git log origin/{branch} 有新 commit（push 成功）
- 失败 → 修复重试（网络/权限问题，不回退）

### 3. L2 门禁 subagent

- 检查项：
  1. 本地无未提交变更（git status --short 为空）
  2. push 成功（git log origin/{branch} 有新 commit）
- 失败 → 修复权限/网络问题后重试 push

### 4. complete_task(7)

### 5. 人工确认点：无

自动进入阶段 ⑧ CI 验证。

---

## 阶段 ⑧：CI 验证

**调度流程：**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | xyz-harness-verification-before-completion |
| 模型 | glm-5.1 |
| 输入 | 项目根目录 + CLAUDE.md 中的验证命令 |

**subagent 入口条件：**
- 阶段 ⑦ 门禁通过
- 代码已推送到远端

**subagent 执行逻辑（概述）：**
1. 读取 CLAUDE.md 中的质量门禁章节
2. 依次执行所有验证命令（编译、类型检查、lint、测试）
3. 对每条命令：运行 → 读完整输出 → 检查 exit code → 记录结果
4. 如有 CI 配置（.github/workflows/ 等），触发 CI 并等待结果
5. 将所有验证输出写入 `changes/evidence/verification_output.md`
6. CI 结果写入 `changes/evidence/ci_result.md`

**门禁条件（硬编码，不可跳过）：**
- 编译：exit code == 0
- 测试：exit code == 0 **且** test count > 0 **且** failures == 0
- Lint：exit code == 0

**交付物：**
- `.superpowers/{主题}/changes/evidence/verification_output.md` — 本地验证输出
- `.superpowers/{主题}/changes/evidence/ci_result.md` — CI 结果（如有）

### 2. L1 脚本检查

- 运行：`gate-script.sh 08 {project_root}`
- 检查项：
  - 运行 CLAUDE.md 中所有验证命令
  - 所有命令 exit code == 0
  - 测试数 > 0 且 passed == total
- 失败：
  - 测试数 = 0 → 回退到 ⑤（测试未实际运行）
  - 编译错误 → 回退到 ③（编译问题）
  - 测试失败 → 回退到 ③ 或 ⑤（按错误类型判断）

### 3. L2 门禁 subagent

- 检查项：
  1. `verification_output.md` 存在
  2. 所有本地验证命令 exit code == 0
  3. 测试数 > 0 且 passed == total
  4. CI 结果：status == SUCCESS（如有 CI）
- 失败 → 按回退路由表处理（同 L1 失败路由）

### 4. complete_task(8)

### 5. 人工确认点：无

自动进入确认点 4。

---

## 确认点 4：部署目标确认

**位置：** 阶段 ⑧ 门禁通过后，阶段 ⑨ 开始前。

**确认点展示（透传 subagent.summary）：**

```
阶段 ⑧ CI 验证通过。

验证结果：{deliverables[0]}
CI 结果：{deliverables[1]}

{subagent.summary}

即将进入部署验证。请确认部署目标：
1. 确认 — 部署到目标环境
2. 修改目标 — 告诉我部署到哪里
3. 暂不部署 — 等一下再继续
```

**流转规则：**
- 确认 → 进入阶段 ⑨
- 修改目标 → 更新部署配置 → 重新展示
- 暂不部署 → 暂停，等待用户回来

---

## 阶段 ⑨：部署验证

**调度流程：**

### 1. 派遣执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | xyz-harness-deploy-verify |
| 模型 | glm-5.1 |
| 输入 | 项目根目录 + 部署目标环境 + 部署方式 |

**subagent 入口条件：**
- 阶段 ⑧ 门禁通过
- 用户已确认部署目标
- 部署命令/脚本存在

**subagent 执行逻辑（概述）：**
1. 读取部署配置（从 CLAUDE.md 或项目配置文件）
2. 执行部署命令
3. 等待部署完成
4. 执行健康检查（HTTP 探测、关键接口可达性）
5. 记录部署结果到 `changes/evidence/deploy_result.md`

**交付物：**
- 部署成功
- `.superpowers/{主题}/changes/evidence/deploy_result.md` — 部署结果

### 2. L1 脚本检查

- 运行：`gate-script.sh 09 {project_root}`
- 检查项：
  - 健康检查端点返回 200（如果项目配置了健康检查）
- 失败：
  - 代码问题 → 回退到 ③
  - 配置问题 → 就地修复后重试

### 3. L2 门禁 subagent

- 检查项：
  1. `deploy_result.md` 存在
  2. 部署状态为成功
  3. 健康检查通过
- 失败 → 代码问题回退到 ③；配置问题就地修复后重试

### 4. complete_task(9)

### 5. 人工确认点：无

自动进入阶段 ⑩。

---

## 阶段 ⑩：用户最终确认

本阶段由主 agent 直接处理，不派遣 subagent。主 agent 只透传各阶段 subagent 返回的 summary，不读取交付物内容。

### 主 agent 执行逻辑：

1. 更新 loop_task_tracker：阶段 ⑩ 标记为完成
2. 向用户展示最终交付确认（基于各阶段 subagent.summary 拼接）：

```
全部 11 阶段完成。

需求：[用户原始需求描述]
变更追溯：.superpowers/{主题}/changes/summary.md

阶段完成情况（基于各阶段 subagent.summary）：
① {阶段 ① summary}
② {阶段 ② summary}
③ {阶段 ③ summary}
④ {阶段 ④ summary}
⑤ {阶段 ⑤ summary}
⑥ {阶段 ⑥ summary}
⑦ {阶段 ⑦ summary}
⑧ {阶段 ⑧ summary}
⑨ {阶段 ⑨ summary}

请确认最终交付：
1. 确认完成 — 进入自动复盘
2. 需求不符 — 回到需求分析（说明哪里不符）
3. 实现有问题 — 回到编码实现（说明什么问题）
```

### 流转规则：
- 确认完成 → 进入阶段 ⑪ 自动复盘
- 需求不符 → 回退到阶段 ①（更新 loop_task_tracker，重置 ① 及后续）
- 实现有问题 → 回退到阶段 ③（更新 loop_task_tracker，重置 ③ 及后续）

---

## 阶段 ⑪：自动复盘

本阶段自动执行，不需要人工确认。

**调度流程：**

### 1. 派遣复盘 subagent

| 项目 | 值 |
|------|---|
| Agent | code-reviewer |
| 加载 Skill | 无（通用分析能力） |
| 模型 | glm-5.1 |
| 输入 | summary.md + 各阶段评审报告路径 + 回退记录 + .xyz-harness/metrics/ |

**subagent 入口条件：**
- 阶段 ⑩ 用户已确认完成
- summary.md 存在

**subagent 执行逻辑（概述）：**
1. 读取 summary.md，了解完整流程状态
2. 读取各阶段评审报告（reviews/ 目录）
3. 读取 .xyz-harness/metrics/ 中的指标数据
4. 分析：
   - 哪些阶段发生了回退？根因分类（需求不清/代码问题/测试问题/环境问题）
   - 评审 agent 是否有效拦截了问题？（评审发现的问题 vs 用户发现的问题）
   - L1 gate 脚本是否有遗漏？（该拦没拦的场景）
   - 哪些阶段 AI 犯了不该犯的错？（对照 CLAUDE.md 规则检查）
   - CLAUDE.md 缺少什么规则？需要新增或修改什么？
5. 产出 retrospective.md

**交付物：**
- `.superpowers/{主题}/changes/retrospective.md` — 复盘报告

### 2. 无 L1/L2 门禁检查

复盘结果不影响流程。

### 3. complete_task(11)

### 4. 无人工确认点

### 5. 复盘产出后：检查可改进项

如果有 CLAUDE.md 改进建议，主 agent 向用户展示：

```
阶段 ⑪ 复盘完成。报告：changes/retrospective.md

发现以下可改进项：
1. [问题描述] → 建议新增 CLAUDE.md 规则：[规则]
2. [问题描述] → 建议修改规则：[原规则] → [新规则]

是否采纳？采纳后我会更新 CLAUDE.md。
```

如果发现 Agent 因领域知识缺失而犯错，读取 `references/wiki-structure.md`，建议用户补充项目 Wiki 对应文档。

### 6. 运行指标记录

主 agent 将本次需求的所有运行指标汇总写入 `.xyz-harness/metrics/{yyyy-MM-dd}-{需求名}.json`：

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

# 第七部分：回退路由表

| 失败场景 | 回退到 | 说明 |
|---------|--------|------|
| ② 需求评审不通过 | → ① | 计划不合理或需求不清晰 |
| ③ spec 合规不通过 | → 当前 task 内修复 | task 级，不回退整个阶段 |
| ④ 编码评审不通过（≤2轮） | → ③ | 代码质量问题 |
| ⑤ 代码不可测试 | → ③ | 代码结构不支持测试编写 |
| ⑥ 测试评审不通过（≤2轮） | → ⑤ | 测试质量问题 |
| ⑦ push 失败 | → 修复重试 | 网络/权限问题，不回退 |
| ⑧ CI 测试数=0 | → ⑤ | 测试未实际运行 |
| ⑧ CI 编译错误 | → ③ | 编译问题 |
| ⑧ CI 测试失败 | → ③ 或 ⑤ | 按错误类型判断 |
| ⑨ 部署失败 | → ③ 或配置修复 | 代码问题回 ③，配置问题就地修复 |
| ⑩ 需求不符 | → ① | 方向错误 |
| ⑩ 实现有问题 | → ③ | 实现有误 |

## 回退时 tracker 处理逻辑

回退发生时：

1. 识别回退目标阶段 N
2. 将 tracker 中阶段 N 及之后所有阶段重置为未完成
3. 清除 `.xyz-harness/gate/` 中被重置阶段的 `.pass` 标记文件
4. 重新派遣执行 subagent 从阶段 N 开始

---

# 第八部分：异常处理

## 评审循环超限

当评审轮次超出上限时（需求评审 > 3 轮，编码/测试评审 > 2 轮）：

1. 主 agent 暂停
2. 向用户展示：

```
阶段 {N} 评审已达到轮次上限（{X}轮），仍未通过。

最后一次评审报告：{路径}
未解决的 MUST FIX：{列出}

请决策：
1. 继续评审 — 再给一轮
2. 接受当前状态 — 跳过评审，进入下一阶段
3. 回退 — 回到 {回退目标}
```

## subagent 返回 blocked

当执行 subagent 连续 2 次返回 blocked：

1. 主 agent 暂停
2. 向用户说明阻塞原因
3. 建议拆分任务、换方案、或人工介入
4. 等待用户决策

## subagent 返回 fail

当 subagent 返回 fail：

1. 检查是否有 rollback_target
2. 有 → 按回退路由表处理
3. 无 → 向用户展示 fail.reason，等待用户决策

---

# 第九部分：产出物清单

一次完整的 dev-flow 执行后，项目中有以下产出物：

```
.superpowers/{yyyy-MM-dd}-{主题}/
├── spec.md                              # 需求设计文档
├── plan.md                              # 实现计划
└── changes/
    ├── summary.md                       # 全流程追溯摘要
    ├── reviews/
    │   ├── plan_review_v1.md            # 计划评审记录
    │   ├── code_review_v1.md            # 编码评审记录（可能有 v2+）
    │   └── test_review_v1.md            # 测试评审记录
    ├── evidence/
    │   ├── verification_output.md       # 本地验证输出
    │   ├── ci_result.md                 # CI 结果
    │   └── deploy_result.md             # 部署结果
    └── retrospective.md                 # 复盘记录

.xyz-harness/
├── gate/
│   ├── stage-01.pass                    # 各阶段 L1 门禁标记
│   ├── stage-03.pass
│   ├── stage-05.pass
│   ├── stage-07.pass
│   ├── stage-08.pass
│   └── stage-09.pass
└── metrics/
    └── {yyyy-MM-dd}-{需求名}.json       # 运行指标

wiki/                                    # 如果阶段 ⑪ 建议了补充
└── [按需新增或更新的领域文档]

CLAUDE.md                                # 如果阶段 ⑪ 建议了规则更新
```

---

# 第十部分：持续改进

## 阶段 ⑪ 复盘说明

每次需求完成后自动执行复盘 subagent，分析：
- 回退根因分类（需求不清/代码问题/测试问题/环境问题）
- 评审有效性（agent 发现 vs 用户发现）
- L1 gate 脚本遗漏场景
- CLAUDE.md 缺失规则

## 运行指标

每个需求完成后，运行指标记录到 `.xyz-harness/metrics/{yyyy-MM-dd}-{需求名}.json`，包含：
- 总 token 消耗和耗时
- 各阶段 subagent 的 token/耗时
- 回退次数和回退原因
- 评审有效率

## 跨需求聚合

手动触发更新 `.xyz-harness/harness-health.md`：

> 当用户说"更新 harness health"、"聚合指标"、"harness 健康报告"时，读取 `.xyz-harness/metrics/` 下所有 JSON 文件，聚合分析后更新 `harness-health.md`。

内容包含：
- 累计需求数
- 平均回退次数
- 常见错误模式
- 评审有效率
- CLAUDE.md 改进建议（从各次复盘聚合）

---

## 流程总结

```
需求描述
  → [前置检查] worktree / CLAUDE.md / CI
  → [自动] ① 需求分析
            产出：spec.md + plan.md + summary.md
            L1: gate-script.sh 01 + L2: gate-checker
  → ✋ 确认点1：需求设计确认
  → [自动] ② 需求评审
            产出：plan_review_v{N}.md
            L2: gate-checker（≤3轮）
  → ✋ 确认点2：计划评审确认
  → [自动] ③ 编码实现（subagent-driven-development）
            内含 task 级 TDD + spec 合规检查
            产出：代码 + 单元测试
            L1: gate-script.sh 03 + L2: gate-checker
  → [自动] ④ 编码评审
            产出：code_review_v{N}.md
            L2: gate-checker（≤2轮）
  → ✋ 确认点3：编码评审确认
  → [自动] ⑤ 测试编写（Change-driven Testing）
            产出：接口级测试
            L1: gate-script.sh 05 + L2: gate-checker
  → [自动] ⑥ 测试评审
            产出：test_review_v{N}.md
            L2: gate-checker（≤2轮）
  → [自动] ⑦ 代码推送（zcommit）
            L1: gate-script.sh 07 + L2: gate-checker
  → [自动] ⑧ CI 验证
            产出：verification_output.md + ci_result.md
            L1: gate-script.sh 08 + L2: gate-checker
  → ✋ 确认点4：部署目标确认
  → [自动] ⑨ 部署验证
            产出：deploy_result.md
            L1: gate-script.sh 09 + L2: gate-checker
  → [自动] ⑩ 用户确认
  → ✋ 确认点5：最终交付确认
  → [自动] ⑪ 自动复盘
            产出：retrospective.md + metrics JSON
```

**用户只需要介入 5 次，其余全自动。每次需求都有完整的 Audit Trail。**
