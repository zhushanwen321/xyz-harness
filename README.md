# xyz-harness-engineering

基于 Harness Engineering 的 AI 编码工作流体系 —— 以 pi（AI 编码 Agent）为载体，实现 11 阶段需求开发流水线。

## 什么是 Harness Engineering

Harness Engineering 是一种用工程化约束替代 prompt 软指导的 AI 编码方法论。核心思路：**与其告诉 AI "请仔细检查"，不如用脚本门禁、独立评审、人工确认三层机制强制保证质量**。AI 倾向于跳过检查、伪造通过结果，硬约束比 prompt 级软要求更可靠。

参考资料：
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [OpenAI: A Practical Guide to Building Agents](https://cdn.openai.com/business.pdf)

## 核心设计

### 11 阶段流水线

```
① 需求分析 → ② 需求评审 → ③ 编码实现 → ④ 编码评审 → ⑤ 测试编写
→ ⑥ 测试评审 → ⑦ 代码推送 → ⑧ CI 验证 → ⑨ 部署验证 → ⑩ 用户确认
→ ⑪ 自动复盘
```

每阶段完成后由独立 gate-checker subagent 验证，失败按路由表回退到对应阶段重新执行。

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
| xyz-harness-brainstorming | superpowers brainstorming | ① | 需求探索与澄清 |
| xyz-harness-writing-plans | superpowers writing-plans | ① | 生成 spec.md + plan.md |
| xyz-harness-subagent-driven-development | superpowers subagent-driven-dev | ③ | Task 级编码编排，含 spec 合规检查 |
| xyz-harness-expert-reviewer | 新建 | ②④⑥ | 统一评审（计划评审 / 执行评审两种模式） |
| xyz-harness-coding-skill | 新建 | ③ | Clean Architecture 分层编码规范 |
| xyz-harness-unit-test-write | 新建 | ⑤ | Change-driven Testing（接口/API 级） |
| xyz-harness-verification-before-completion | superpowers v-b-c | ⑧ | 编译、测试、lint 验证 |
| xyz-harness-deploy-verify | 新建 | ⑨ | 部署验证 SOP |
| xyz-harness-test-driven-development | superpowers TDD | ③（内部） | 函数/类级 TDD |
| **xyz-harness-dev-flow** | 新建（编排器） | 全程 | 11 阶段纯调度，不直接执行任何阶段 |

## 安装

```bash
python3 install.py
```

- 安装位置：`~/.pi/agent/skills/xyz-harness-*` 和 `~/.agents/skills/xyz-harness-*`（symlink）
- 自动清理旧版（不带 `xyz-harness-` 前缀的 dev-flow 等同名 skill）

## 使用方式

1. 在 pi 中打开目标项目
2. 说 **"开发需求 xxx"** 触发 `xyz-harness-dev-flow`
3. 流程自动执行，在 5 个人工确认点暂停等待决策：
   - 确认点1：需求分析结果（① 后）
   - 确认点2：计划评审结果（② 后）
   - 确认点3：代码实现结果（④ 后）
   - 确认点4：部署目标确认（⑨ 前）
   - 确认点5：最终交付确认（⑩）

## 项目结构

```
xyz-harness-engineering/
├── skills/
│   ├── xyz-harness-dev-flow/        # 编排器
│   ├── xyz-harness-brainstorming/
│   ├── xyz-harness-writing-plans/
│   ├── xyz-harness-subagent-driven-development/
│   ├── xyz-harness-expert-reviewer/
│   ├── xyz-harness-coding-skill/
│   ├── xyz-harness-unit-test-write/
│   ├── xyz-harness-verification-before-completion/
│   ├── xyz-harness-deploy-verify/
│   └── xyz-harness-test-driven-development/
├── .superpowers/                    # 设计文档
│   └── 2026-05-08-harness-engineering/
└── install.py                       # symlink 安装脚本
```

## 配置要求

目标项目需要：

1. **CLAUDE.md** 存在（≤200行，作为 L1 上下文常驻）
2. CLAUDE.md 包含 **质量门禁章节**（定义编译命令、测试命令、lint 命令等）

模板参考：`skills/xyz-harness-dev-flow/references/claude-md-template.md`

## 文档索引

| 文档 | 说明 |
|------|------|
| [spec.md](.superpowers/2026-05-08-harness-engineering/spec.md) | 完整架构设计 |
| [plan.md](.superpowers/2026-05-08-harness-engineering/plan.md) | 实施计划 |
| [stage-execution-detail.md](.superpowers/2026-05-08-harness-engineering/stage-execution-detail.md) | 各阶段详细执行逻辑 |
