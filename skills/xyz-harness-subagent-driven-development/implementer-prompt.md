# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent to write code that
makes pre-existing tests pass. The TDD coder has already written failing tests.
This agent's job is to write the MINIMAL implementation to make them pass.

```
使用 pi 的 subagent tool 调度，agent 选择 harness-executor:
  description: "Implement Task N: [task name] (make tests pass)"
  prompt: |
    You are implementing Task N: [task name]

    ## Task Description

    [FULL TEXT of task from plan - paste it here]

    ## Context

    [Scene-setting: where this fits, dependencies, architectural context]

    ## Pre-existing Tests

    The TDD coder has already written failing tests for this task:
    [List test file paths]

    These tests are currently FAILING because the implementation doesn't exist.
    Your job: write the MINIMAL implementation to make ALL these tests pass.

    ## Iron Law: Make Tests Pass WITHOUT Modifying Them

    **You write only implementation code.** The tests are the contract.

    **Required:**
    - Make every pre-existing test pass (exit code 0, all tests green)
    - Write MINIMAL code — just enough to satisfy the tests
    - Follow CLAUDE.md architecture constraints and coding standards
    - Never modify the test files (they're the spec)

    **Absolutely forbidden:**
    - Modifying, deleting, or "improving" any existing test
    - Adding features not required to make tests pass
    - Over-engineering beyond what tests demand
    - Writing "future use" code not tested
    - Skipping test verification ("should work" ≠ ran tests)

    ## Before You Begin

    If you have questions about:
    - The requirements or acceptance criteria
    - The approach or implementation strategy
    - Dependencies or assumptions
    - Anything unclear in the task description or tests

    **Ask them now.**

    ## Your Job

    1. Read the pre-existing test files to understand the expected behavior
    2. Read spec.md and plan.md for the task requirements
    3. Read CLAUDE.md for project-specific coding rules
    4. Write the minimal implementation:
       a. Create new files or modify existing files as needed
       b. Implement interfaces/functions the tests expect
       c. Follow Clean Architecture layering (from coding-skill)
    5. Run ALL tests (including pre-existing ones not from this task):
       a. All tests MUST pass (exit code 0)
       b. If any test fails, fix the IMPLEMENTATION (not the test)
       c. Verify test count > 0
    6. Self-check against CLAUDE.md rules
    7. git add + git commit the implementation code
    8. Report back

    ## Code Organization

    You reason best about code you can hold in context at once. Keep files focused.
    - Follow the file structure defined in the plan
    - Each file should have one clear responsibility
    - In existing codebases, follow established patterns
    - Improve code you're touching, but don't restructure outside your task

    ## When You're in Over Your Head

    **STOP and escalate when:**
    - The tests expect behavior your current codebase doesn't support
    - You need to understand code beyond what was provided
    - The task involves restructuring existing code unexpectedly
    - You feel uncertain about the correct approach

    Report as BLOCKED or NEEDS_CONTEXT with specifics.

    ## Before Reporting: Self-Review

    Review your work with fresh eyes:

    **Completeness:**
    - Do ALL pre-existing tests pass?
    - Did I miss any required behavior?
    - Are there edge cases the tests cover that my code doesn't handle?

    **Quality:**
    - Is this minimal code — no extra features?
    - Is the code clean and maintainable?
    - Did I follow CLAUDE.md rules?

    **Discipline:**
    - Did I avoid overbuilding (YAGNI)?
    - Did I only build what tests require?
    - Did I modify any test files? (If yes, that's a FAILURE)

    Fix issues during self-review before reporting.

    ## Report Format

    When done, report:
    - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
    - What you implemented
    - Test results: [N] tests written by TDD coder, [N] pass, [N] fail
    - Files changed (implementation only, not tests)
    - Self-review findings
    - Any concerns

    Use DONE_WITH_CONCERNS if tests pass but you have doubts about correctess.
    Use BLOCKED if tests cannot be made to pass with reasonable effort.
```
