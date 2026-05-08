# xyz-harness-engineering

基于 Harness Engineering 的 AI 编码工作流体系 —— 以 pi（AI 编码 Agent）为载体，实现 11 阶段需求开发流水线。

## 什么是 Harness Engineering

Harness Engineering 是一种用工程化约束替代 prompt 软指导的 AI 编码方法论。核心思路：**与其告诉 AI "请仔细检查"，不如用脚本门禁、独立评审、人工确认三层机制强制保证质量**。AI 倾向于跳过检查、伪造通过结果，硬约束比 prompt 级软要求更可靠。

参考资料：
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agients)
- [OpenAI: A Practical Guide to Building Agents](https://cdn.openai.com/business.pdf)

## 使用指南：从零开发一个需求

### 前置条件

1. **安装本项目的 skill**

```bash
cd xyz-harness-engineering
python3 install.py
```

安装脚本会：
- 将 `skills/xyz-harness-*` 目录 symlink 到 `~/.pi/agent/skills/` 和 `~/.agents/skills/`
- 清理旧版不带 `xyz-harness-` 前缀的同名 skill

2. **目标项目有 CLAUDE.md**

目标项目（你要开发需求的项目）根目录必须有 `CLAUDE.md` 文件，且包含**质量门禁**章节。

如果目标项目没有 CLAUDE.md，dev-flow 会自动提示你。也可以参考模板：
`skills/xyz-harness-dev-flow/references/claude-md-template.md`

质量门禁章节示例（CLAUDE.md 中必须有）：

```markdown
## 质量门禁

- 编译: `cargo build`
- 测试: `cargo test`
- lint: `cargo clippy`
```

这些命令会被 `gate-script.sh` 读取并执行，作为 L1 强制门禁。

3. **在 worktree 中工作（推荐）**

建议使用 `create-worktree` skill 为每个需求创建独立分支和工作目录。如果你已在 worktree 中，dev-flow 会自动检测。

### 开始开发

在 pi 中打开目标项目，输入：

```
开发需求 xxx
```

或者：

```
做一个需求：实现用户注册功能
```

这会触发 `xyz-harness-dev-flow` skill，启动 11 阶段流水线。

---

### 11 阶段全流程

你只需要在 5 个确认点做决策，其余全自动。

```
① 需求分析 ────── ✋ 确认点1：需求设计确认
② 需求评审 ────── ✋ 确认点2：计划评审确认
③ 编码实现
④ 编码评审 ────── ✋ 确认点3：编码评审确认
⑤ 测试编写
⑥ 测试评审
⑦ 代码推送
⑧ CI 验证 ──────── ✋ 确认点4：部署目标确认
⑨ 部署验证
⑩ 用户确认 ────── ✋ 确认点5：最终交付确认
⑪ 自动复盘
```

下面逐阶段说明会发生什么、你需要做什么。

---

#### 阶段 ① 需求分析

**做什么：** AI 会和你对话，理解需求、澄清细节、提出方案，最终产出 spec.md（需求设计文档）和 plan.md（实现计划）。

**你需要做的：**
1. 回答 AI 的提问（每次一个问题，优先多选）
2. 在 2-3 个方案中选择
3. 逐节确认设计
4. 审阅最终的 spec.md

**✋ 确认点1：** AI 展示需求分析结果，你选择：
- **确认** → 进入 ② 需求评审
- **有修改意见** → 直接改 spec/plan，重新确认
- **方向不对** → 重新讨论

---

#### 阶段 ② 需求评审

**做什么：** AI 独立评审 spec 和 plan（不继承你的对话历史，保证客观性）。检查需求完整性、计划可行性、一致性。

**你需要做的：** 等待评审完成（自动）

**✋ 确认点2：** AI 展示评审结果，你选择：
- **确认** → 进入 ③ 编码实现
- **有修改意见** → AI 修改后重新评审
- **计划不合理** → 回到 ① 重新讨论

评审循环上限：≤3 轮。超出后暂停让你决策。

---

#### 阶段 ③ 编码实现

**做什么：** AI 按 plan.md 中的 task 逐个编码。每个 task 内部：
1. TDD 红-绿-重构（先写测试 → 确认失败 → 最小实现 → 确认通过）
2. spec 合规检查（独立 subagent 验证代码是否符合 spec）
3. 合规不通过 → 修复 → 重审

**你需要做的：** 无（全自动）

**质量门禁：** 编译通过 + 测试通过 + lint 通过（gate-script.sh L1 强制检查）

---

#### 阶段 ④ 编码评审

**做什么：** 独立评审 subagent 审查代码变更。检查 spec 合规、代码质量、架构合规、安全性能。

**你需要做的：** 等待评审完成（自动）

**✋ 确认点3：** AI 展示评审结果，你选择：
- **确认** → 进入 ⑤ 测试编写
- **有修改意见** → AI 修改后重新评审
- **实现不符合预期** → 回到 ③ 重新编码

评审循环上限：≤2 轮。超出后暂停让你决策。

---

#### 阶段 ⑤ 测试编写

**做什么：** AI 分析代码变更，为每个变更的接口编写接口级测试（正常路径 + 边界条件 + 异常路径）。

**你需要做的：** 无（全自动）

**质量门禁：** 新增测试文件存在 + 测试通过（gate-script.sh L1 强制检查）

---

#### 阶段 ⑥ 测试评审

**做什么：** 独立评审 subagent 审查测试代码质量。

**你需要做的：** 无（全自动）

评审循环上限：≤2 轮。

---

#### 阶段 ⑦ 代码推送

**做什么：** AI 使用 zcommit skill 提交并推送代码到远端。

**你需要做的：** 无（全自动）

**质量门禁：** 工作区干净 + push 成功（gate-script.sh L1 强制检查）

---

#### 阶段 ⑧ CI 验证

**做什么：** AI 执行 CLAUDE.md 中定义的所有验证命令（编译、测试、lint），记录结果。

**你需要做的：** 无（全自动）

**质量门禁：** 所有命令 exit code == 0 且测试数 > 0 且 passed == total（硬编码，不可跳过）

---

#### ✋ 确认点4：部署目标确认

AI 展示 CI 验证通过结果，你确认部署目标：
- **确认** → 进入 ⑨ 部署验证
- **修改目标** → 告诉 AI 部署到哪里
- **暂不部署** → 暂停，等待你回来

---

#### 阶段 ⑨ 部署验证

**做什么：** AI 执行部署命令，验证健康检查通过。

**你需要做的：** 无（全自动）

**质量门禁：** 健康检查返回 200（gate-script.sh L1 强制检查）

---

#### ✋ 确认点5：最终交付确认

AI 展示所有阶段的 summary，你确认最终交付：
- **确认完成** → 进入 ⑪ 自动复盘
- **需求不符** → 回到 ① 重新讨论
- **实现有问题** → 回到 ③ 重新编码

---

#### 阶段 ⑪ 自动复盘

**做什么：** AI 分析本次需求的完整流程，产出复盘报告。包含：
- 回退根因分类
- 评审有效性评估
- gate 脚本遗漏检查
- CLAUDE.md 改进建议

**你需要做的：** 审阅复盘报告，决定是否采纳 CLAUDE.md 改进建议。

---

### 回退机制

任何阶段失败时，AI 会按回退路由表自动回退：

| 失败场景 | 回退到 |
|---------|--------|
| ② 需求评审不通过 | → ① 重新讨论 |
| ④ 编码评审不通过 | → ③ 重新编码 |
| ⑤ 代码不可测试 | → ③ 重构代码 |
| ⑥ 测试评审不通过 | → ⑤ 修复测试 |
| ⑧ CI 编译错误 | → ③ 修复编译 |
| ⑧ CI 测试失败 | → ③ 或 ⑤（按错误类型） |
| ⑨ 部署失败 | → ③（代码问题）或就地修复（配置问题） |
| ⑩ 需求不符 | → 01 重新讨论 |
| ⑩ 实现有问题 | → 03 重新编码 |

---

### 产出物

一次完整的 dev-flow 执行后，目标项目中有以下产出物：

```
.superpowers/{yyyy-MM-dd}-{主题}/
├── spec.md                        # 需求设计文档
├── plan.md                        # 实现计划
└── changes/
    ├── summary.md                 # 全流程追溯
    ├── reviews/
    │   ├── plan_review_v1.md      # 需求评审记录
    │   ├── code_review_v1.md      # 编码评审记录
    │   └── test_review_v1.md      # 测试评审记录
    ├── evidence/
    │   ├── verification_output.md # 本地验证输出
    │   ├── ci_result.md           # CI 结果
    │   └── deploy_result.md       # 部署结果
    └── retrospective.md           # 复盘记录

.xyz-harness/
├── gate/
│   ├── stage-01.pass              # 各阶段 L1 门禁标记
│   ├── stage-03.pass
│   └── ...
└── metrics/
    └── {yyyy-MM-dd}-{需求名}.json  # 运行指标
```

---

## 核心设计

### 三层约束

| 层级 | 机制 | 说明 |
|------|------|------|
| L1 脚本强制 | gate-script.sh 生成 `.xyz-harness/gate/{stage}.pass` | AI 无法伪造脚本输出 |
| L2 subagent 检查 | gate-checker 独立验证 | 评审质量、产出物完整性 |
| L3 人工确认 | 用户手动决策（5 个确认点） | 需求方向、计划、代码、部署、交付 |

### 上下文三层

| 层级 | 加载时机 | 内容 |
|------|---------|------|
| L1 会话常驻 | 自动 | CLAUDE.md（≤200行，最高优先级） |
| L2 阶段常驻 | 进入阶段 | 当前阶段 skill + references |
| L3 按需加载 | Agent 主动 | Wiki 知识库 |

### 执行与评判分离

评审 subagent 不继承编码 subagent 的上下文，只看到 spec + plan + 代码 diff + 编码规范，看不到编码过程中的讨论和试错。

## Skill 清单

| Skill 名 | 来源 | 触发阶段 | 说明 |
|---------|------|---------|------|
| xyz-harness-dev-flow | 新建（编排器） | 全程 | 11 阶段纯调度，不直接执行 |
| xyz-harness-brainstorming | 提取 | ① | 需求探索与澄清 → 下一步: writing-plans |
| xyz-harness-writing-plans | 提取 | ① | 生成 plan.md → 下一步: 需求评审 |
| xyz-harness-expert-reviewer | 新建 | ②④⑥ | 统一评审（计划/编码/测试三种模式） |
| xyz-harness-subagent-driven-development | 提取+适配 | ③ | Task 级编码编排 → 下一步: 编码评审 |
| xyz-harness-coding-skill | 新建 | ③ | Clean Architecture 分层编码规范（被 subagent 加载） |
| xyz-harness-test-driven-development | 提取 | ③ | TDD 方法论（被 subagent 加载） |
| xyz-harness-unit-test-write | 新建 | ⑤ | Change-driven Testing（接口级） |
| xyz-harness-verification-before-completion | 提取 | ⑧ | 编译、测试、lint 验证 |
| xyz-harness-deploy-verify | 新建 | ⑨ | 部署验证 |

## 安装

```bash
python3 install.py
```

- 安装位置：`~/.pi/agent/skills/xyz-harness-*` 和 `~/.agents/skills/xyz-harness-*`（symlink）
- 自动清理旧版（不带 `xyz-harness-` 前缀的 dev-flow 等同名 skill）

## 项目结构

```
xyz-harness-engineering/
├── skills/
│   ├── xyz-harness-dev-flow/        # 编排器
│   │   ├── SKILL.md
│   │   ├── scripts/gate-script.sh
│   │   └── references/
│   │       ├── claude-md-template.md
│   │       └── wiki-structure.md
│   ├── xyz-harness-brainstorming/
│   ├── xyz-harness-writing-plans/
│   ├── xyz-harness-subagent-driven-development/
│   │   ├── SKILL.md
│   │   ├── implementer-prompt.md
│   │   └── spec-reviewer-prompt.md
│   ├── xyz-harness-expert-reviewer/
│   ├── xyz-harness-coding-skill/
│   │   ├── SKILL.md
│   │   └── specs/                   # 6 份 Clean Architecture 分层规范
│   ├── xyz-harness-unit-test-write/
│   ├── xyz-harness-verification-before-completion/
│   ├── xyz-harness-deploy-verify/
│   └── xyz-harness-test-driven-development/
├── .superpowers/                    # 设计文档
│   └── 2026-05-08-harness-engineering/
│       ├── spec.md
│       ├── plan.md
│       └── stage-execution-detail.md
└── install.py
```

## 文档索引

| 文档 | 说明 |
|------|------|
| [spec.md](.superpowers/2026-05-08-harness-engineering/spec.md) | 完整架构设计 |
| [plan.md](.superpowers/2026-05-08-harness-engineering/plan.md) | 实施计划 |
| [stage-execution-detail.md](.superpowers/2026-05-08-harness-engineering/stage-execution-detail.md) | 各阶段详细执行逻辑 |
