---
name: meta-sk-agent-writer
description: "Use when creating or editing agent.md files for Claude Code or Pi subagents. Not for SKILL.md — use meta-sk-skill-writer instead."
---

# Agent Writer

## Core Principle

agent.md 定义独立执行者。与 skill 不同，agent 有自己的上下文、工具集和模型选择，不继承父 agent 对话历史。

## agent.md vs SKILL.md

| 维度 | agent.md | SKILL.md |
|------|----------|----------|
| 触发 | 确定性（代码指定 agent name） | 概率匹配（模型看 description） |
| description | 能力摘要，不需要触发词 | 只写触发条件（"Use when..."） |
| 工具 | 可限制（tools/disallowedTools） | 无限制 |
| 模型 | 可指定（model 字段） | 继承主 agent |
| 上下文 | 独立，不继承父对话 | 在主 agent 上下文中 |

## Frontmatter 字段

必填：
```yaml
name: agent-name          # 唯一标识符
description: "能力摘要"    # 不需要触发词，写能力范围
```

可选（按使用频率排序）：

| 字段 | 值 | 适用场景 |
|------|-----|---------|
| `model` | `inherit` / `sonnet` / `opus` / `haiku` / 具体模型 ID | 审查用高质量模型，快速操作用轻量模型 |
| `tools` | `"Read, Bash, Grep"` 或 `["Read", "Bash"]` | 审查类只读，修复类需要 Edit |
| `skills` | `"skill-name"` 或 `["s1", "s2"]` | 启动时预加载 skill |
| `maxTurns` | 正整数 | 限制 agent 轮次防止无限循环 |
| `memory` | `user` / `project` / `local` | 跨会话持久记忆 |
| `background` | `true` | 始终后台运行 |
| `effort` | `"high"` / 正整数 | 推理努力级别 |
| `color` | `blue` / `green` / `yellow` 等 | 终端颜色标识 |
| `omitClaudeMd` | `true` | 只读 agent 省略 CLAUDE.md 注入（省 token） |

省略 `tools` = 所有工具可用。审查类 agent 建议限制为只读。

## Description 写法

不需要"Use when..."格式。直接写能力范围：

```yaml
# 好 — 能力摘要
description: "业务逻辑审查。验证代码覆盖所有业务用例，构造模拟数据推演执行路径。"

# 好 — 带边界
description: "代码品味审查（TS/Rust/Python）。读取品味文档后按 P0-P3 四级审查。不做 bug 检查。"

# 差 — 模糊
description: "审查代码。"

# 差 — 包含触发词（agent 不需要触发词）
description: "Use when you need BLR review."
```

## 正文结构

```markdown
# Agent 名称

一句话定位。

## 输入
task prompt 中必须/可选包含的参数。

## 执行步骤
1. 读取方法论（read skill 文件）
2. 获取数据
3. 执行分析
4. 输出结果

## 输出格式
具体格式定义。

## 约束
- 每条有后果链
```

## 与 Skill 的引用关系

agent 只定义"做什么"和"输出什么"，方法论维护在 skill 中：

```
agent.md（~30-50 行）
  → read {skill_path}/SKILL.md（方法论）
```

修改方法论只需更新 skill，不改 agent。

## 安装位置

源文件在项目中开发，symlink 到运行时目录：

| 工具 | agent 目录 |
|------|-----------|
| Claude Code | `~/.claude/agents/` |
| Pi | `~/.pi/agent/agents/` |

```bash
ln -s /path/to/agents/{name}.md ~/.claude/agents/{name}.md
ln -s /path/to/agents/{name}.md ~/.pi/agent/agents/{name}.md
```

## 跨平台兼容性

| 字段 | Claude Code | Pi |
|------|------------|-----|
| `name` / `description` | agent 发现和展示 | agent 发现和展示 |
| `model` | 生效 | **不生效**（Pi 用 model-resolve） |
| `tools` | 生效 | **不生效**（Pi 固定 read,bash,write,edit） |
| 正文 | system prompt 注入 | system prompt 注入 |

`model` 和 `tools` 在 Pi 中不生效，但保留不报错。正文在两个平台都作为 system prompt 注入。

## 何时不用

- 创建/优化 SKILL.md → `meta-sk-skill-writer`
- 规则写作模板 → `meta-sk-skill-writer/references/rule-templates.md`
