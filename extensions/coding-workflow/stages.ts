// Workflow Controller — 阶段定义
// 16 个 stage：Phase 1 (8步) + Phase 2 (8阶段)

import type { StageDefinition } from "./types.js";

export const WORKFLOW_STAGES: StageDefinition[] = [
  // ── Phase 1: 需求沟通 (Stage 1-8) ──────────────────────
  {
  number: 1,
  name: "需求讨论",
  phase: 1,
  type: "interactive",
  requiresConfirmation: false,
  prompt: `Discuss the requirement with the user. Use brainstorming techniques to explore:
- What is the core problem?
- Who are the users?
- What are the constraints?
- What does success look like?
Ask one question at a time. Propose 2-3 approaches with trade-offs when appropriate.`,
  deliverables: [],
  },
  {
  number: 2,
  name: "Spec 编写",
  phase: 1,
  type: "interactive",
  requiresConfirmation: true,
  prompt: `Write the spec.md based on the discussion. The spec MUST include:
- Outcomes/目标
- Scope/范围 (with out-of-scope)
- Constraints/约束
- Decisions made/已做决策
- Behavioral constraints/行为约束 (Always/Ask First/Never)
- 已有基础设施
- Verification/验收标准
Output: .xyz-harness/{topicDir}/spec.md`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/spec.md",
    label: "spec.md",
    required: true,
    contentChecks: [
      { type: "must_not_match", pattern: "\\[AMBIGUOUS\\]", message: "spec.md contains unresolved [AMBIGUOUS] markers" },
    ],
    },
  ],
  },
  {
  number: 3,
  name: "Spec 评审",
  phase: 1,
  type: "automated",
  gateScript: "03",
  requiresConfirmation: false,
  prompt: `Dispatch harness-spec-reviewer subagent to review spec.md completeness and quality.
Check: six-element completeness, [AMBIGUOUS] markers, reference integrity.
Fix all MUST FIX issues found, then re-run review until 0 MUST FIX remain.
Output: .xyz-harness/{topicDir}/changes/reviews/spec_review_v1.md`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/changes/reviews/spec_review_*.md",
    label: "spec review report",
    required: true,
    contentChecks: [
    { type: "yaml_verdict", message: "spec review verdict is not 'pass'" },
    ],
    },
  ],
  },
  {
  number: 4,
  name: "Plan 编写",
  phase: 1,
  type: "interactive",
  requiresConfirmation: false,
  prompt: `Write the implementation plan based on spec.md. Each task MUST include:
- Description
- Acceptance criteria (verifiable)
- File changes table
- Risk points
Assess complexity (L1/L2). If L2, dispatch harness-backend-planner and harness-frontend-planner in parallel.
Output: .xyz-harness/{topicDir}/plan.md`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/plan.md",
    label: "plan.md",
    required: true,
    },
  ],
  },
  {
  number: 5,
  name: "Plan 评审",
  phase: 1,
  type: "automated",
  gateScript: "05",
  requiresConfirmation: false,
  prompt: `Dispatch harness-reviewer subagent to review plan.md feasibility and spec coverage.
Check: task completeness, dependency correctness, workload estimation.
Fix all MUST FIX issues found, then re-run review until 0 MUST FIX remain.
Output: .xyz-harness/{topicDir}/changes/reviews/plan_review_v1.md`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/changes/reviews/plan_review_*.md",
    label: "plan review report",
    required: true,
    contentChecks: [
    { type: "yaml_verdict", message: "plan review verdict is not 'pass'" },
    ],
    },
  ],
  },
  {
  number: 6,
  name: "E2E 测试计划",
  phase: 1,
  type: "automated",
  requiresConfirmation: false,
  prompt: `Write the E2E test plan based on spec.md and plan.md.
Define test groups, dependency graph, and test cases with 4-layer verification (API/DOM/Visual/DB).
Output: .xyz-harness/{topicDir}/e2e-test-plan.md`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/e2e-test-plan.md",
    label: "e2e-test-plan.md",
    required: true,
    },
  ],
  },
  {
  number: 7,
  name: "E2E 测试计划评审",
  phase: 1,
  type: "automated",
  gateScript: "07",
  requiresConfirmation: false,
  prompt: `Dispatch harness-e2e-test-plan-reviewer subagent to review the E2E test plan.
Check: coverage completeness, verification layer appropriateness, dependency correctness.
Fix all MUST FIX issues found, then re-run review until 0 MUST FIX remain.
Output: .xyz-harness/{topicDir}/changes/reviews/e2e_test_plan_review_v1.md`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/changes/reviews/e2e_test_plan_review_*.md",
    label: "e2e test plan review report",
    required: true,
    contentChecks: [
    { type: "yaml_verdict", message: "e2e test plan review verdict is not 'pass'" },
    ],
    },
  ],
  },
  {
  number: 8,
  name: "用户确认",
  phase: 1,
  type: "interactive",
  requiresConfirmation: true,
  prompt: `Present the Phase 1 deliverables to the user for final confirmation.
Show: spec.md summary, plan.md task count, any open decisions.
Wait for user approval before proceeding to Phase 2.`,
  deliverables: [],
  },

  // ── Phase 2: 开发交付 (Stage 9-16) ─────────────────────
  {
  number: 9,
  name: "TDD 测试编写",
  phase: 2,
  type: "automated",
  requiresConfirmation: false,
  prompt: `Write failing tests for each task in plan.md BEFORE writing any implementation code (TDD RED phase).
For each task:
1. Read the task's acceptance criteria from plan.md
2. Dispatch harness-tdd-coder to write failing unit tests
3. Verify tests fail as expected (RED)
4. git commit test files
Register all tasks with harness_register_tasks at the start.
Output: test files in the project source tree`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/changes/evidence/tdd-red-report.md",
    label: "TDD red report",
    required: true,
    },
  ],
  },
  {
  number: 10,
  name: "编码实现",
  phase: 2,
  type: "automated",
  gateScript: "09",
  requiresConfirmation: false,
  prompt: `Implement the code to make the failing tests pass (TDD GREEN phase).
For each task:
1. Dispatch harness-executor to implement code (pre-written tests must now pass)
2. Run tests to confirm GREEN
3. Dispatch harness-reviewer for spec compliance check
4. git commit after each task
Register all plan tasks with harness_register_tasks at the start. Complete them in order.`,
  deliverables: [],
  },
  {
  number: 11,
  name: "编码评审",
  phase: 2,
  type: "automated",
  gateScript: "10",
  requiresConfirmation: false,
  prompt: `Dispatch harness-reviewer to review all code changes (git diff).
Check: spec compliance, code quality, architecture adherence, security.
Output: .xyz-harness/{topicDir}/changes/reviews/code_review_v1.md
Max 2 review rounds. MUST FIX must be resolved before passing.`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/changes/reviews/code_review_*.md",
    label: "code review report",
    required: true,
    contentChecks: [
    { type: "yaml_verdict", message: "code review verdict is not 'pass'" },
    ],
    },
  ],
  },
  {
  number: 12,
  name: "单元测试",
  phase: 2,
  type: "automated",
  gateScript: "11",
  requiresConfirmation: false,
  prompt: `Write interface-level tests for all changed interfaces (Change-driven Testing).
Dispatch harness-executor with xyz-harness-unit-test-write skill.
Tests must cover: normal path, boundary conditions, error paths.
Run tests to confirm all pass.`,
  deliverables: [],
  },
  {
  number: 13,
  name: "E2E 测试",
  phase: 2,
  type: "automated",
  gateScript: "12",
  requiresConfirmation: false,
  prompt: `**CRITICAL: Dispatch harness-e2e-tester subagent for all E2E test execution.**
Use chrome-automation skill for all UI smoke tests.
NEVER fabricate results by code inspection — every UI test MUST be executed in a real browser with screenshots.
Fabricated results (writing "代码已实现" without actual execution) will be caught by gate_12 and rejected.
If a test cannot be executed, mark it as SKIP with explicit reason. DO NOT pass it as "OK".

Execute E2E tests according to e2e-test-plan.md.
1. Start Chrome CDP (port 9222)
2. Start backend and frontend services
3. Prepare test data
4. Execute test groups in dependency order (G1 → G2 → G3)
5. Record results per test case
Output: .xyz-harness/{topicDir}/changes/evidence/e2e-test-report.md
If blocking failure found, rollback to Stage 10 (coding).`,
  deliverables: [
  {
  path: ".xyz-harness/{topicDir}/changes/evidence/e2e-test-report.md",
  label: "e2e test report",
  required: true,
  },
  ],
  },
  {
  number: 14,
  name: "测试评审",
  phase: 2,
  type: "automated",
  gateScript: "13",
  requiresConfirmation: false,
  prompt: `Dispatch harness-reviewer to review unit tests and E2E test results.
Check: test coverage, assertion quality, E2E pass rate.
Output: .xyz-harness/{topicDir}/changes/reviews/test_review_v1.md
Max 2 review rounds.`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/changes/reviews/test_review_*.md",
    label: "test review report",
    required: true,
    contentChecks: [
    { type: "yaml_verdict", message: "test review verdict is not 'pass'" },
    ],
    },
  ],
  },
  {
  number: 15,
  name: "推送+CI+部署",
  phase: 2,
  type: "automated",
  gateScripts: ["14"],
  requiresConfirmation: false,
  prompt: `Execute the push-CI-deploy sequence:
1. git push (use zcommit skill)
2. Wait for CI to pass
3. Deploy and verify health
L1 gate 14 will verify all three steps automatically.
Output: .xyz-harness/{topicDir}/changes/evidence/verification_output.md
   .xyz-harness/{topicDir}/changes/evidence/deploy_result.md`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/changes/evidence/verification_output.md",
    label: "verification output",
    required: true,
    },
    {
    path: ".xyz-harness/{topicDir}/changes/evidence/deploy_result.md",
    label: "deploy result",
    required: true,
    },
  ],
  },
  {
  number: 16,
  name: "自动复盘",
  phase: 2,
  type: "automated",
  requiresConfirmation: false,
  prompt: `Dispatch harness-reviewer to analyze the entire workflow:
- Rollback root causes
- Review effectiveness
- Gate script coverage gaps
- CLAUDE.md improvement suggestions
Output: .xyz-harness/{topicDir}/changes/retrospective.md
   .xyz-harness/{topicDir}/metrics.json`,
  deliverables: [
    {
    path: ".xyz-harness/{topicDir}/changes/retrospective.md",
    label: "retrospective.md",
    required: true,
    },
    {
    path: ".xyz-harness/{topicDir}/metrics.json",
    label: "metrics.json",
    required: true,
    },
  ],
  },
];
