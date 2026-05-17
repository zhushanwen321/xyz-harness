---
name: xyz-harness-phase-spec
description: Phase 1 (spec) of the manual xyz-harness workflow. Used when the user says "start Phase 1", "do spec phase", "write spec", or at the beginning of a harness workflow to produce spec.md.
---

# Phase 1: Spec

## Purpose

Understand user requirements, clarify scope, and produce a complete `spec.md` document.

## Steps

### 1. Brainstorm

Load the xyz-harness-brainstorming skill and explore:
- User's feature request or problem
- Existing codebase context
- Functional requirements and constraints
- Technical approach options

### 2. Write spec.md

Create `.xyz-harness/{topic}/spec.md` with:

- YAML frontmatter containing `verdict: pass`
- Background and context
- Functional requirements
- Acceptance criteria (AC)
- Constraints (technical, UX, business)
- Complexity assessment

**spec.md YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `verdict` | string | 是 | `"pass"` | 门禁通过标志。gate 检查此字段必须存在且值为 `"pass"` | `verdict: pass` | 写成了 `verdict: true`（布尔值，gate 会报错） |

**完整示例：**
```
---
verdict: pass
---

# {Feature Title}

## Background
{describe what this feature is about}

## Functional Requirements
{list what the system should do}

## Acceptance Criteria
{testable conditions that must be met}

## Constraints
{technical, UX, business constraints}

## Complexity Assessment
{domain, storage, data-flow, API, non-functional}
```

### 2a. Write spec review

Create `.xyz-harness/{topic}/changes/reviews/spec_review_v1.md` with format:

**spec_review YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `verdict` | string | 是 | `"pass"` | 评审通过标志。gate 检查是否为 `"pass"` | `verdict: pass` | 写成了 `verdict: "pass"`（字符串用引号也能解析，但规范建议不加引号） |
| `must_fix` | number | 是 | `0` | 必须修复的问题数量。gate 检查此值必须为数字 `0` | `must_fix: 0` | 写成了 `must_fix: "0"`（字符串，gate 会报错）；写成了 `must_fix: 2`（还有未修问题，门禁不通过） |

**完整示例：**
```
---
verdict: pass
must_fix: 0
---

# Spec Review — {topic}

## Summary
{one-line review conclusion}

## Issues Found
{list issues with severity levels}

## Conclusion
{verdict justification}
```

### 3. Self-Check

- [ ] spec.md exists in the topic directory
- [ ] spec.md has YAML frontmatter with verdict: pass
- [ ] spec review file exists with verdict: pass, must_fix: 0
- [ ] Requirements are clearly separated from implementation details
- [ ] Acceptance criteria are testable
- [ ] All constraints are documented

### 4. Gate Handoff

When opening a separate gate check conversation, submit these files:

| File | Path |
|------|------|
| Spec | `{topic}/spec.md` |
| Spec review | `{topic}/changes/reviews/spec_review_v*.md` |

Open a new Pi session, load the xyz-harness-gate skill, and tell it:
> "Check Phase 1 gate for topic `{topic}`"

### 5. Tell user

When done: "Phase 1 complete. spec.md created at {path}. File list for gate check above. Ready for Phase 2 (plan) or run gate check."
