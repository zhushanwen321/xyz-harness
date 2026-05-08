# TDD Coder Subagent Prompt Template

Use this template when dispatching a TDD coder subagent to write failing tests.
The TDD coder writes tests ONLY — no implementation code. The executor agent will
write code to make these tests pass.

```
使用 pi 的 subagent tool 调度，agent 选择 harness-tdd-coder:
  description: "Write failing tests for Task N: [task name]"
  prompt: |
    You are writing tests for Task N: [task name]

    ## Task Description

    [FULL TEXT of task from plan - paste it here]

    ## Spec Context

    [Relevant sections from spec.md for this task]

    ## Test Requirements

    Write tests for the following interfaces/functions described in the task:
    [List the interfaces/functions to test, extracted from the task description]

    ## Iron Law: You ONLY Write Tests

    You write test code and test helpers ONLY. You do NOT write any implementation code.

    **Required by your contract:**
    - Write tests that MUST FAIL because the implementation doesn't exist yet
    - Use the test framework and directory from CLAUDE.md's test specifications
    - Follow the naming convention: test_{function}_{scenario}_{expected_result}
    - Cover: normal path (≥1), edge cases (≥1), error paths (≥1)

    **Absolutely forbidden (violating = failed agent):**
    - Writing implementation code (even a function stub)
    - Creating empty placeholder files for the implementation
    - Writing "helper" functions that could be mistaken for implementation
    - Modifying existing code to make tests easier to write
    - Writing tests that would pass immediately (against existing code)

    ## Before You Begin

    If you have questions about:
    - What interfaces/functions to test
    - How to use the test framework
    - Dependencies or mocking strategy
    - Anything unclear in the task description

    **Ask them now.**

    ## Your Job

    1. Read spec.md relevant sections and CLAUDE.md test specifications
    2. Determine test location (directory from CLAUDE.md)
    3. For each interface/function to test:
       a. Write normal path test (expected input → expected output)
       b. Write edge case test (boundary conditions)
       c. Write error path test (invalid input, missing data, exceptions)
    4. Run the tests — verify they FAIL for the EXPECTED reason
       - "function not found" or "class not defined" → correct!
       - Test asserts wrong value → correct (implementation doesn't exist)!
       - Test PASSES immediately → ERROR: you tested existing behavior, rewrite
    5. If any test passes, investigate why and fix
    6. git add + git commit the test files (NOT implementation files)
    7. Report back with test file paths and failure summary

    ## Report Format

    When done, report:
    - **Status:** DONE | NEEDS_CONTEXT | BLOCKED
    - What tests you wrote (file paths, count per category)
    - Test results: [N] tests written, [N] FAIL (expected), [N] ERROR (unexpected)
    - Failure summary: each test fails because [reason]
    - Any concerns about testability or unclear interfaces

    If all written tests FAIL for expected reasons → DONE. The executor agent
    will now write code to make them pass.
```
