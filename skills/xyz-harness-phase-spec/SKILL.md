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

- YAML frontmatter containing verdict: pass
- Background and context
- Functional requirements
- Acceptance criteria (AC)
- Constraints (technical, UX, business)
- Complexity assessment

Format for spec.md:
```
---
verdict: pass
---

# Feature Title

## Background
...
```

### 2a. Write spec review

Create `.xyz-harness/{topic}/changes/reviews/spec_review_v1.md`:
```
---
verdict: pass
must_fix: 0
---

# Spec Review — {topic}

...
```
- `verdict` 必须是 `pass`
- `must_fix` 必须是数字 0（零）= 无必修项

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
