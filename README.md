# xyz-harness-engineering

基于 Harness Engineering 的 AI 编码工作流引擎 —— 以 Pi（AI 编码 Agent）为载体，实现 5-phase 需求开发流水线。

## 核心理念

**AI 是不可信的执行者。** 与其告诉 AI "请仔细检查"，不如用脚本门禁、独立评审、强制复盘三层机制让它无法偷懒。

具体来说，AI 有这些逃脱倾向：

| AI 行为 | 后果 |
|---------|------|
| 跳过检查，声称"已验证" | 交付质量不可控 |
| 伪造测试通过结果 | 缺陷进入生产 |
| 利用之前 phase 记忆偷跑 | 需求偏离，设计未经验证 |
| 遇到困难悄悄降级标准 | 交付物不达标但看不出来 |
| 复盘失败后继续推进 | 质量闭环断裂 |

Harness 通过**五层防御**解决这些问题：

```
L1 上下文隔离 ── AI 只能看到当前 phase 的指令，不知道整体流程
L2 脚本门禁   ── gate-check.py 验证交付物，AI 无法伪造脚本输出
L3 独立评审   ── review subagent 独立进程，不受编码者 bias 影响
L4 强制复盘   ── retrospect 失败 → phase-start BLOCKED，无法推进
L5 结果可见   ── 失败信息写入 gate 返回消息，不再静默吞掉
```

参考资料：
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agients)
- [OpenAI: A Practical Guide to Building Agents](https://cdn.openai.com/business.pdf)

## 两种运行模式

### Auto Mode（coding-workflow 扩展）

```
/coding-workflow my-feature
```

一条命令启动，AI 自动完成 5 个 phase。你只需在出现问题时介入。

**控制流程：**

```
/coding-workflow <topic>
  → 创建 topic 目录，注入 Phase 1 skill
  → AI 产出 deliverables，调用 coding-workflow-gate
    → gate-check.py 验证
    → review subagent 独立审查
    → retrospect subagent 独立复盘
    → PASS: 消息中显示 review + retrospect 状态
    → FAIL: 列出具体修复项
  → AI 调用 coding-workflow-phase-start
    → 检查 retrospect 文件存在（不存在则 BLOCKED）
    → compact() 清除对话历史
    → 注入下一 phase skill
  → Phase 5 完成后生成 overall_retrospect（覆盖全部 5 个 phase）
```

**AI 能看到什么：**
- 当前 phase 的 skill 指令
- topic 目录路径
- coding-workflow-gate 和 coding-workflow-phase-start 两个工具

**AI 看不到什么：**
- 一共有多少个 phase
- 下一个 phase 是什么
- 之前 phase 的讨论内容（compact 后被清除）
- 其他项目的 harness 运行历史

### Manual Mode（纯 Skill）

不安装扩展，手动触发每个 phase。适合需要精细控制的场景。

```
# 在 Pi 中，手动加载 skill
"start Phase 1"  → brainstorming skill 加载
"start Phase 2"  → writing-plans skill 加载
...
```

每个 phase 完成后，手动运行 gate check、手动 dispatch review/retrospect。

## 5-Phase 工作流

| Phase | 名称 | 产出 | 质量保障 |
|-------|------|------|---------|
| 1 | **Spec** | spec.md | spec_review + spec_retrospect |
| 2 | **Plan** | plan.md + e2e-test-plan.md + test_cases_template.json | plan_review + plan_retrospect |
| 3 | **Dev** | 源代码 + test_results.md | code_review + dev_retrospect |
| 4 | **Test** | test_execution.json | test_review + test_retrospect |
| 5 | **PR** | pr_evidence.md + ci_results.md | pr_review + overall_retrospect |

每个 phase 都有三层质量保障：
1. **Gate** — 脚本验证交付物存在性和格式
2. **Review** — 独立 subagent 审查质量（verdict: pass/fail, must_fix: N）
3. **Retrospect** — 独立 subagent 复盘执行过程和流程体验

## 安装

### 1. 安装 harness skills

```bash
cd xyz-harness-engineering
python3 install.py
```

安装脚本会将 `skills/xyz-harness-*` 目录 symlink 到：
- `~/.pi/agent/skills/`（Pi）
- `~/.agents/skills/`（Claude Code）

### 2. 安装 coding-workflow 扩展（Auto Mode）

```bash
mkdir -p ~/.pi/agent/extensions/coding-workflow/lib
cp extensions/coding-workflow/index.ts extensions/coding-workflow/gate-check.py ~/.pi/agent/extensions/coding-workflow/
cp extensions/coding-workflow/lib/model-resolve.ts extensions/coding-workflow/lib/subagent.ts ~/.pi/agent/extensions/coding-workflow/lib/
```

重启 Pi 或 `/reload` 生效。

### 3. 安装 retrospect（install.py 自动处理）

install.py 已将 `agents/harness-retrospect` 作为 agent 安装，并将 `skills/harness-retrospect` 作为 skill 安装。

验证：
```bash
# Agent（coding-workflow 扩展的 subagent system prompt）
ls ~/.pi/agent/agents/harness-retrospect/agent.md

# Skill（全局可发现，子 agent 可通过 skill 机制加载）
ls ~/.pi/agent/skills/harness-retrospect/SKILL.md
```

### 4. 配置模型

创建 `~/.pi/agent/subagent-models.json`：

```json
{
  "models": [
    {
      "id": "glm-5-turbo",
      "provider": "router-openai",
      "task-complexity": ["low"],
      "order": 2
    },
    {
      "id": "ds-flash",
      "provider": "router-openai",
      "task-complexity": ["low", "medium"],
      "order": 3
    }
  ]
}
```

review subagent 使用 `medium` 复杂度，retrospect subagent 使用 `low` 复杂度。

### 5. 配置目标项目

目标项目的 `CLAUDE.md` 需要包含：

| 章节 | 必需？ | 缺失影响 |
|------|--------|----------|
| 项目背景 + 技术栈 | 必需 | AI 无法理解项目 |
| 模块结构 | 必需 | AI 无法规划文件变更 |
| 架构约束 | 必需 | 编码和评审无规范 |
| 编码规范 | 必需 | AI 按自己的风格编码 |
| 质量门禁（编译/测试/lint 命令） | 必需 | gate 脚本形同虚设 |
| 测试规范 | 推荐 | 测试风格不统一 |

## 使用

### 启动工作流

```
/coding-workflow implement-user-auth
```

### 查看进度

```
/coding-workflow-status
```

### 退出

```
/coding-workflow-abort
```

### 回退

| 场景 | 操作 |
|------|------|
| gate 失败 | 根据失败信息修复，重新调用 `coding-workflow-gate` |
| 想退出 | `/coding-workflow-abort` |
| 想重新开始 | abort 后重新 `/coding-workflow <topic>` |
| 扩展有问题 | 删除扩展目录，回到 Manual Mode |

## 复盘安全保障

复盘是 harness 的质量闭环。**复盘不可跳过。**

保障机制：

```
gate PASS
  → retrospect subagent 执行
    → 成功：retrospect 文件创建 → gate 消息显示 "Retrospect: xxx.md created"
    → 失败：gate 消息显示 WARNING + 失败原因
  → AI 调用 phase-start
    → retrospect 文件存在？
      → 是：放行
      → 否：BLOCKED，给出重试选项
```

Phase 5 的 overall_retrospect 覆盖全部 5 个 phase，读取前 4 个 phase 的复盘记录进行交叉分析。

## 产出物

```
.xyz-harness/{yyyy-MM-dd}-{topic}/
├── spec.md                        # Phase 1: 需求设计
├── plan.md                        # Phase 2: 实现计划
├── e2e-test-plan.md               # Phase 2: E2E 测试计划
├── test_cases_template.json       # Phase 2: 测试用例模板
└── changes/
    ├── reviews/
    │   ├── spec_review_v1.md      # Phase 1 审查
    │   ├── spec_retrospect.md     # Phase 1 复盘
    │   ├── plan_review_v1.md      # Phase 2 审查
    │   ├── plan_retrospect.md     # Phase 2 复盘
    │   ├── code_review_v1.md      # Phase 3 审查
    │   ├── dev_retrospect.md      # Phase 3 复盘
    │   ├── test_review_v1.md      # Phase 4 审查
    │   ├── test_retrospect.md     # Phase 4 复盘
    │   ├── pr_review_v1.md        # Phase 5 审查
    │   └── overall_retrospect.md  # Phase 5 整体复盘（覆盖全部 5 个 phase）
    └── evidence/
        ├── test_results.md        # Phase 3: 测试结果
        ├── test_execution.json    # Phase 4: 测试执行记录
        ├── pr_evidence.md         # Phase 5: PR 证据
        └── ci_results.md          # Phase 5: CI 结果
```

## 项目结构

```
xyz-harness-engineering/
├── skills/                               # Skill 定义（17 个：11 个 harness 核心 + 6 个通用工具）
│   ├── xyz-harness-brainstorming/        # Phase 1: 需求探索
│   ├── xyz-harness-writing-plans/        # Phase 2: 计划编写
│   ├── xyz-harness-phase-dev/            # Phase 3: 编码实现
│   ├── xyz-harness-phase-test/           # Phase 4: 测试执行
│   ├── xyz-harness-phase-pr/             # Phase 5: 推送 + PR
│   ├── xyz-harness-gate/                 # Gate 检查
│   ├── xyz-harness-expert-reviewer/      # 统一评审
│   ├── xyz-harness-backend-dev/          # 后端编码规范
│   ├── xyz-harness-frontend-dev/         # 前端编码规范
│   ├── xyz-harness-test-driven-development/  # TDD 方法论
│   ├── xyz-harness-subagent-driven-development/  # subagent 调度
│   ├── chrome-automation/                # CDP 浏览器自动化
│   ├── create-worktree/                  # worktree 创建
│   ├── merge-worktree/                   # worktree 合并
│   ├── vision-analysis/                  # 图像/视频分析
│   ├── zcommit/                          # 智能提交
│   └── harness-retrospect/               # 复盘分析
├── agents/
│   └── harness-retrospect/agent.md       # 复盘 agent（coding-workflow 使用）
├── commands/                             # 用户命令
│   ├── dev.md
│   └── track.md
├── docs/                                 # 文档
│   ├── e2e-research/
│   └── retrospectives/
├── extensions/
│   ├── coding-workflow/                  # Auto Mode 扩展
│   │   ├── index.ts
│   │   ├── gate-check.py
│   │   └── lib/
│   │       ├── model-resolve.ts
│   │       └── subagent.ts
│   ├── todolist/                          # 任务追踪
│   ├── claude-rules-loader/               # 跨项目规则加载
│   └── edit-whitespace-normalizer/        # 编辑前空白字符修复
├── install.py                            # 全局安装脚本
├── install-to-project.sh                 # 一键安装到项目
├── CLAUDE.md                             # 开发者文档
└── README.md                             # 本文件
```

## 依赖

| 依赖 | 版本 | 用途 | 必需？ |
|------|------|------|--------|
| Pi | latest | AI 编码 Agent | 必需 |
| Python 3 + PyYAML | 3.10+ | gate-check.py | 必需 |
| Node.js | v21+ | coding-workflow 扩展 | Auto Mode 必需 |
| Git | 2.x+ | worktree 管理 | 必需 |
| `~/.pi/agent/subagent-models.json` | — | 模型配置 | Auto Mode 必需 |
