---
name: harness-retrospect-collector
description: >-
  Retrospect collector for xyz-harness. Scans retrospect files, tracks absorption status, aggregates improvement suggestions. Trigger: "collect retrospects", "retrospect status", "scan retrospects", "absorb retrospect".
tools:
  - read
  - write
  - bash
---

# Harness Retrospect Collector Skill

Retrospect 收集器，用于扫描、吸收和聚合 xyz-harness 工作流中的复盘文件。

## 三种模式

| 模式 | 触发参数 | 作用 |
|------|---------|------|
| **scan** | 默认 | 扫描未吸收的 retrospect 文件，输出状态表 |
| **absorb** | `--absorb <file>` | 标记指定文件为已吸收 |
| **aggregate** | `--aggregate` | 聚合 harness_issues，按频率排序 |

## 使用方式

所有操作通过 `collect.py` 脚本执行：

```bash
# 扫描未吸收的 retrospect（默认）
python3 skills/harness-retrospect-collector/scripts/collect.py --root .xyz-harness/

# 列出全部（含已吸收）
python3 skills/harness-retrospect-collector/scripts/collect.py --root .xyz-harness/ --all

# 标记吸收
python3 skills/harness-retrospect-collector/scripts/collect.py \
  --root .xyz-harness/ \
  --absorb .xyz-harness/2026-05-26-topic/changes/reviews/spec_retrospect.md \
  --summary "已将建议整合到 gate-check.py"

# 聚合 harness_issues 并按频率排序
python3 skills/harness-retrospect-collector/scripts/collect.py \
  --root .xyz-harness/ --aggregate

# JSON 输出（用于脚本集成）
python3 skills/harness-retrospect-collector/scripts/collect.py \
  --root .xyz-harness/ --json
```

## Retrospect YAML Frontmatter 格式

`collect.py` 识别以下 frontmatter 字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `phase` | string | Phase 名称：spec/plan/dev/test/pr |
| `verdict` | string | 始终为 `pass` |
| `topic` | string | Topic 目录名（可选，从路径推断） |
| `absorbed` | bool | 是否已被吸收（默认 false） |
| `absorbed_date` | string | 吸收日期（ISO 格式） |
| `absorption_summary` | string | 吸收摘要 |
| `harness_issues` | list[string] | 发现的 harness 问题/改进建议 |

## 向后兼容

旧版 retrospect 文件不含 `absorbed` 字段，一律视为 `false`（未吸收）。
不含 `harness_issues` 字段的文件在 aggregate 模式下被跳过（无 issue 可聚合）。

## 输出格式示例

### 默认 scan 输出（表格）

```
File                                                    | Phase | Topic        | Issues | Absorbed
---------------------------------------------------------------------------------------------
.xyz-harness/2026-05-26-topic/changes/reviews/spec_retrospect.md | spec  | topic        | 3      | false
```

### --aggregate 输出（频率排序表）

```
Issue                                          | Freq | Sources
--------------------------------------------------------------------
Gate check script missing schema validation    | 3    | spec_retro..., plan_retro...
Phase transition too manual                    | 2    | dev_retro..., test_retro...
```

### --json 输出

```json
[
  {
    "file": ".xyz-harness/2026-05-26-topic/changes/reviews/spec_retrospect.md",
    "phase": "spec",
    "topic": "2026-05-26-topic",
    "absorbed": false,
    "harness_issues": ["Gate check script missing schema validation"]
  }
]
```
