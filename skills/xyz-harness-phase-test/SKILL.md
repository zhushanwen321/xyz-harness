---
name: xyz-harness-phase-test
description: Phase 4 (test) of the manual xyz-harness workflow. Use when the user says "start Phase 4", "test phase", "run tests", "execute test cases", or after dev is done to run E2E/integration tests.
---

# Phase 4: Test

## Purpose

Execute test cases from test_cases_template.json, record results in test_execution.json, and fix any failures.

## Prerequisites

- test_results.md exists with all_passing: true
- Code review passed
- All code changes committed

## Steps

### 1. Load Test Templates

Read test_cases_template.json to list all test cases.

### 2. Execute Test Cases

For each test case (by ID group):
- API tests: curl/httpx against backend endpoints
- Frontend tests: Playwright or manual verification
- Integration tests: service-level tests

### 3. Record Results

Create or update test_execution.json:
- Track which cases were executed
- Record pass/fail per case
- Include round number

### 4. Fix Failures

If any test fails: diagnose → fix → re-run → update execution json.

### 5. Self-Check

- [ ] All test cases from template have been executed
- [ ] All tests pass in final round
- [ ] test_execution.json is valid JSON
- [ ] test_results.md still accurate

### 6. Tell user

When done: "Phase 4 complete. All tests pass. Ready for Phase 5 (PR) or run gate check."
