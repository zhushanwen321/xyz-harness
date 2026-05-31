# YAML Frontmatter Guide

Description 是 YAML frontmatter 的一部分，格式错误会导致 Pi 启动报错 `Missing closing "quote`。

## 格式选择

| 场景 | 格式 | 示例 |
|------|------|------|
| 无内部引号，或只有少量英文引号 | 双引号 | `description: "Use when..."` |
| 大量中文触发词引号 `"提交PR"` | `>-` 块标量 | 见下文 |
| 任何含 `:` 或 `"` 的内容 | 禁止 plain string | 见下文 |

## 双引号（默认）

```yaml
---
name: example-skill
description: "Use when executing plans with independent tasks"
---
```

## `>-` 块标量（中文引号多时强制使用）

当 description 包含大量 `"提交PR"`、`"快速改动"` 等中文引号时，双引号字符串内的 `\"` 转义容易因断行导致配对失败。改用 `>-` 折叠块标量，内部 `"` 无需转义：

```yaml
---
name: example-skill
description: >-
  当用户说"提交PR"、"创建PR"、"pr-worktree"时使用此 skill。
user-invocable: true
---
```

注意 `>-` 的缩进：内容行必须比 `description:` 缩进至少一个空格（通常 2 空格），`user-invocable:` 回到与 `description:` 同一缩进级别表示 frontmatter 继续。

## `>-` 约束

1. **块标量内容内部不能包含单独一行的 `---`**（会被 YAML 解析为文档结束标记）
2. **块标量结束后必须是另一个 frontmatter 字段（如 `user-invocable:`）或 `---` 闭合标记**，不能紧跟 Markdown 正文
3. **`-` 表示折叠换行**：多行内容会被合并为单行（保留空格分隔），不影响实际效果

## 禁止无引号 plain string

```yaml
# 错误 — 冒号被解析为 mapping key，YAML 解析失败
description: Gate check for harness. Trigger: run gate check.

# 正确 — 双引号包裹
description: "Gate check for harness. Trigger: run gate check."
```

## 常见错误

| 错误 | 现象 | 修复 |
|------|------|------|
| `description: "..."` 内含偶数个 `\"` 但断行位置不当 | `Missing closing "quote` | 改用 `>-` |
| `description: >-` 后紧跟 Markdown 标题 `# Skill` | frontmatter 解析错误 | 插入 `---` 闭合标记或另一个 frontmatter 字段 |
| `description: 触发词: "提交"` | `Nested mappings are not allowed` | 加双引号或改用 `>-` |
| `description: "` 开头但忘记闭合 | YAML parse error | 补全引号或改用 `>-` |

## 验证与自动修复

```bash
# 检查所有 skill
python3 scripts/validate-skill-yaml.py skills/*/SKILL.md

# 自动修复问题 description（双引号转义过多 → 转换为 >-）
python3 scripts/validate-skill-yaml.py --fix skills/*/SKILL.md
```
