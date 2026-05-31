---
name: meta-sk-skill-writer
description: "Use when creating or editing skills, diagnosing trigger failures, or testing trigger accuracy. Not for CLAUDE.md optimization or general rule writing — read references/rule-templates.md instead."
---

# Skill Writer

## Core Principle

**先看失败，再写 skill。** 没有观察过 agent 在没有这个 skill 时怎么失败，你不知道 skill 应该教什么。

## Description 写法

Description 是触发的唯一入口。模型只看到 name + description，概率匹配决定是否加载 SKILL.md。

**只写"何时用"，不写"做什么"。** 写了工作流摘要 → 模型把 description 当快捷版 skill 执行 → 跳过 SKILL.md → 丢失细节。

```yaml
# 坏 — Claude 会跳过 SKILL.md 直接执行 description 里的流程
description: "Use when executing plans - dispatches subagent per task with review between tasks"

# 好 — 只有触发条件，逼模型读完整内容
description: "Use when executing implementation plans with independent tasks"
```

规则：
- 用 "Use when..." 开头
- 第三人称（description 被 inject 到 system prompt）
- 包含用户实际会说的短语和症状
- 包含排除子句（"Not for..."）
- < 500 字符（name + description 合计 ≤ 1024）
- 提及具体名词（文件格式、技术栈、命令名）

### Description 格式

description 是 YAML frontmatter，格式错误导致 Pi 启动报错。read `references/yaml-guide.md` 获取完整格式规范。核心原则：双引号优先；中文引号多时用 `>-`（不能含单独 `---`）；禁止无引号 plain string。写完运行验证：`python3 scripts/validate-skill-yaml.py skills/*/SKILL.md`

## SKILL.md 结构

```
skill-name/
├── SKILL.md              # 主文件（< 200 行）
└── references/           # 详细内容（按需加载，一层深度）
```

```markdown
# Skill Name

## Overview
核心原则，1-2 句。

## When to Use
- 适用场景
- **When NOT to use**

## Core Pattern
Before/After 对比，或核心方法。

## Quick Reference
速查表。

## Common Mistakes
典型错误 + 修复。
```

详细内容（> 100 行）放 references/，不要嵌套引用。

## 自由度分级

匹配具体程度到任务的脆弱性。选错方案会导致数据丢失或不可逆操作 → 低自由度：

| 自由度 | 适用 | 格式 |
|--------|------|------|
| 高 | 多种方案可行 | 文字指导 |
| 中 | 有偏优方案 | 伪代码/模板 |
| 低 | 操作脆弱 | 具体脚本 |

## 规则质量检查

当诊断发现问题在**内容质量**（规则缺后果链、有空泛表达、有冲突）而非结构或触发时，read `references/rule-templates.md` 获取：
- 后果链模板（约束/偏好/上下文/反模式）
- 反模式检测清单（空泛规则、裸规则、缺边界、重复、冲突）
- 载体感知（CLAUDE.md 用禁令型，SKILL.md 用流程型）

## Token 效率

每个 token 都要 justify 存在。冗余内容占用 context → 挤占对话历史空间 → 模型遗忘早期信息 → 遵守率下降。

- 一流的例子 > 多个平庸的例子
- 不重复 cross-reference 的 skill 已说过的内容
- 用 `--help` 引导详细参数，不在 SKILL.md 中枚举所有 flag
- 不解释 Claude 已知的概念（什么是 PDF、什么是库）

## 触发测试

创建或修改 skill 后验证：

1. **正向测试**（5 条）：不同用户措辞，确认 skill 被加载
2. **反向测试**（3 条）：相近但不相关的意图，确认不误触发
3. **直接问 Claude**：`"When would you use the [skill-name] skill?"` — 检查引用是否正确
4. **检查 context 预算**：skill 列表超预算会被静默排除

目标：90% 正向命中率。

## 反合理化（纪律类 skill 专用）

强制执行纪律的 skill（TDD、编码规范、安全检查）需要抵抗合理化。**只在纪律类 skill 中使用。**

方法：列出常见借口 + 现实，显式禁止每种绕过方式：

```markdown
| 借口 | 现实 |
|------|------|
| "太简单不需要" | 简单代码也出 bug |

## 红旗 — 停下来
- "我遵循的是精神不是形式"
- "这次情况不同"
- "先作为参考保留"
```

## 何时不用

- 优化规则内容（非 skill 结构）→ read `references/rule-templates.md`
- 优化 CLAUDE.md → 始终加载无触发问题，read `references/rule-templates.md` 做反模式检测
