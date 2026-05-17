---
name: xyz-harness-phase-plan
description: Phase 2 (plan) of the manual xyz-harness workflow. Use when the user says "start Phase 2", "plan phase", "write plan", or after spec.md is done to produce plan.md + E2E test plan + test cases template.
---

# Phase 2: Plan

## Purpose

Based on the approved spec.md, produce an implementation plan, E2E test plan, and test case templates.

## Prerequisites

- spec.md exists with verdict: pass
- spec has been reviewed (spec_review exists with verdict: pass, must_fix: 0)

## Steps

### 1. Read spec.md

Load the completed spec.md to understand requirements and acceptance criteria.

### 2. Assess complexity

Determine plan complexity: L1 (simple) or L2 (complex). Dimensions: domain, storage, data-flow, API integration, non-functional.

### 3. Write plan.md

Create `.xyz-harness/{topic}/plan.md` with:
- YAML frontmatter with verdict: pass
- Task list with file paths, operation (create/modify), execution group
- Execution group ordering with dependencies
- For L2: also create plan-backend.md, plan-frontend.md, plan-api-contract.md

Consult xyz-harness-writing-plans skill for detailed methodology.

### 4. Write E2E test plan

Create `.xyz-harness/{topic}/e2e-test-plan.md` with YAML frontmatter verdict: pass.

### 5. Write test case templates

Create `.xyz-harness/{topic}/test_cases_template.json` with valid JSON test_cases array.

### 6. Review

Use xyz-harness-expert-reviewer methodology or dispatch a subagent for independent review.

### 7. Self-Check

- [ ] plan.md exists with verdict: pass
- [ ] e2e-test-plan.md exists with verdict: pass
- [ ] test_cases_template.json exists and is valid JSON
- [ ] plan review exists with verdict: pass, must_fix: 0
- [ ] Tasks cover all acceptance criteria from spec

### 8. Tell user

When done: "Phase 2 complete. All plan deliverables ready. Ready for Phase 3 (dev) or run gate check."
