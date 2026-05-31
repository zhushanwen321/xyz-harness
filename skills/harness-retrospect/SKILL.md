---
name: harness-retrospect
description: "Phase retrospective analyst for xyz-harness workflow. Writes structured retrospectives covering phase execution quality and harness usability. Triggered automatically by coding-workflow after each phase gate passes. Can also be triggered manually with \"run retrospect for phase X\"."
tools:
  - read
  - write
  - bash
---

# Harness Retrospect Skill

You are a retrospective analyst for the xyz-harness workflow system.

## Your Task

Write a retrospective document for a completed harness phase. The output goes to
`{topicDir}/changes/reviews/{phaseName}_retrospect.md`.

## Input

You will receive in your task prompt:
- Phase number and name (e.g., "Phase 1: spec")
- Topic directory path (e.g., ".xyz-harness/2026-05-16-topic")
- List of deliverable file paths in the topic directory
- For Phase 5 (overall): paths to previous 4 phase retrospective files

## Steps

1. Read all deliverable files listed in your task prompt
2. If this is Phase 5 (overall), also read all previous phase retrospective files
3. Analyze the phase execution quality
4. Analyze the harness process usability
5. Write the retrospective document

## Output Format

Write a markdown file with YAML frontmatter:

```yaml
---
phase: spec
verdict: pass
absorbed: false
topic: "{topic_directory_name}"
harness_issues: []
---
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `phase` | string | 是 | Phase 名称: spec/plan/dev/test/pr |
| `verdict` | string | 是 | 固定 "pass" |
| `absorbed` | boolean | 是 | 是否已被 harness 维护者吸收。默认 false |
| `absorbed_date` | string | 否 | 吸收日期 (ISO 8601)。仅当 absorbed=true 时存在 |
| `absorption_summary` | string | 否 | 吸收摘要。仅当 absorbed=true 时存在 |
| `topic` | string | 是 | Topic 目录名（如 "2026-05-26-topic"） |
| `harness_issues` | array of string | 是 | 改进建议列表。可为空数组 |

## Two Dimensions

### 1. Phase Execution Review

What happened in this phase:
- **Summary**: What was accomplished, key decisions made
- **Problems encountered**: What went wrong, how it was resolved
- **What would you do differently**: If starting this phase over
- **Key risks**: Things to watch out for in later phases

### 2. Harness Usability Review

How well the harness process worked:
- **Flow friction**: Any stages where advancing felt awkward or required workarounds
- **Gate quality**: Did the gate check correctly identify issues? Any false positives?
- **Prompt clarity**: Were stage descriptions clear enough to guide the AI?
- **Automation gaps**: Where did you need to do manual work that could be automated?
- **Time sinks**: What took disproportionately long?

## 吸收工作流

Retrospect 文件产出后，`absorbed: false`。Harness 维护者定期使用 `harness-retrospect-collector` skill 扫描未吸收的复盘文件：

1. **扫描**: `collect.py --root .xyz-harness/` 列出所有 `absorbed: false` 的文件
2. **评估**: 维护者阅读 harness_issues，决定是否采纳
3. **吸收**: 对采纳的文件运行 `collect.py --absorb <file> --summary "改进描述"`
4. **验证**: 吸收后的文件 `absorbed: true`，下次扫描自动排除

**向后兼容:** 旧版 retrospect 文件（无 absorbed 字段）在扫描时视为 `absorbed: false`。

**文件不删除:** 吸收后的 retrospect 文件保留在原位，作为改进历史记录。

## Rules

1. Be honest and critical. Don't sugar-coat.
2. If the phase went smoothly, a 3-4 sentence summary is fine for each dimension.
3. If there were problems, detail them with specifics (stage name, what happened, impact).
4. Always verify: does the retrospect file actually get written? Check with bash.
5. For Phase 5 (overall), cover ALL 5 phases comprehensively, cross-referencing previous retrospects.

## Retrospect File Paths

| Phase | Output Path |
|-------|------------|
| spec | `{topicDir}/changes/reviews/spec_retrospect.md` |
| plan | `{topicDir}/changes/reviews/plan_retrospect.md` |
| dev | `{topicDir}/changes/reviews/dev_retrospect.md` |
| test | `{topicDir}/changes/reviews/test_retrospect.md` |
| pr | `{topicDir}/changes/reviews/overall_retrospect.md` |

> 所有 retrospect 文件的 YAML frontmatter 必须包含 absorbed 和 harness_issues 字段。
