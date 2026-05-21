# Wave 3: Gates — 5 个 Phase Gate + Runner + Verifier

## Task 3.1: Phase 1 & 2 Gates

**文件：**
- 创建：`extensions/coding-workflow/gates/gate_spec.ts`
- 创建：`extensions/coding-workflow/gates/gate_plan.ts`

- [ ] **步骤 1：写入 gate_spec.ts**

```typescript
// Phase 1 (spec) L1 gate
import type { GateL1Result } from "../types.js";
import { fileExists, findLatestReview, checkNoMustFix, readYamlField } from "./common.js";

export async function gateSpec(topicDir: string): Promise<GateL1Result> {
  const errors: string[] = [];

  // 1. spec.md exists with verdict
  const specPath = `${topicDir}/spec.md`;
  if (!fileExists(specPath)) {
    errors.push(`spec.md not found at ${specPath}`);
  } else {
    const verdict = readYamlField(specPath, "verdict");
    if (verdict === null || verdict === "" || verdict === undefined) {
      errors.push(`spec.md: verdict missing or empty`);
    }
  }

  // 2. Latest spec review exists
  const reviewPath = findLatestReview(topicDir, "spec_review_v");
  if (!reviewPath) {
    errors.push("No spec_review_v{N}.md found");
  } else {
    // 3. Review must_fix empty or verdict pass
    const mfResult = checkNoMustFix(reviewPath);
    if (!mfResult.passed) {
      errors.push(mfResult.error!);
    }
  }

  return { passed: errors.length === 0, errors };
}
```

- [ ] **步骤 2：写入 gate_plan.ts**

```typescript
// Phase 2 (plan) L1 gate
import type { GateL1Result } from "../types.js";
import { fileExists, findLatestReview, checkNoMustFix, readYamlField } from "./common.js";

export async function gatePlan(topicDir: string, complexity?: "L1" | "L2"): Promise<GateL1Result> {
  const errors: string[] = [];

  // 1. plan.md exists with verdict
  const planPath = `${topicDir}/plan.md`;
  if (!fileExists(planPath)) {
    errors.push(`plan.md not found at ${planPath}`);
  } else {
    const verdict = readYamlField(planPath, "verdict");
    if (verdict === null || verdict === "" || verdict === undefined) {
      errors.push(`plan.md: verdict missing or empty`);
    }
  }

  // 2. e2e-test-plan.md exists with verdict
  const e2ePlanPath = `${topicDir}/e2e-test-plan.md`;
  if (!fileExists(e2ePlanPath)) {
    errors.push(`e2e-test-plan.md not found at ${e2ePlanPath}`);
  } else {
    const verdict = readYamlField(e2ePlanPath, "verdict");
    if (verdict === null || verdict === "" || verdict === undefined) {
      errors.push(`e2e-test-plan.md: verdict missing or empty`);
    }
  }

  // 3. test_cases_template.json exists
  const templatePath = `${topicDir}/test_cases_template.json`;
  if (!fileExists(templatePath)) {
    errors.push(`test_cases_template.json not found at ${templatePath}`);
  }

  // 4. L2 complexity: sub-documents
  if (complexity === "L2") {
    for (const sub of ["plan-backend.md", "plan-frontend.md", "plan-api-contract.md"]) {
      if (!fileExists(`${topicDir}/${sub}`)) {
        errors.push(`L2 complexity: ${sub} not found`);
      }
    }
  }

  // 5. Latest plan review must_fix empty
  const reviewPath = findLatestReview(topicDir, "plan_review_v");
  if (!reviewPath) {
    errors.push("No plan_review_v{N}.md found");
  } else {
    const mfResult = checkNoMustFix(reviewPath);
    if (!mfResult.passed) {
      errors.push(mfResult.error!);
    }
  }

  return { passed: errors.length === 0, errors };
}
```

- [ ] **步骤 3：类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit gates/gate_spec.ts gates/gate_plan.ts 2>&1
```
预期：无错误

- [ ] **步骤 4：提交**

```bash
git add extensions/coding-workflow/gates/gate_spec.ts extensions/coding-workflow/gates/gate_plan.ts
git commit -m "feat: add V5 spec and plan phase gates"
```

---

## Task 3.2: Phase 3 & 4 Gates

**文件：**
- 创建：`extensions/coding-workflow/gates/gate_dev.ts`
- 创建：`extensions/coding-workflow/gates/gate_test.ts`

- [ ] **步骤 1：写入 gate_dev.ts**

```typescript
// Phase 3 (dev) L1 gate
import type { GateL1Result } from "../types.js";
import { fileExists, findLatestReview, checkNoMustFix, readYamlField } from "./common.js";

export async function gateDev(topicDir: string): Promise<GateL1Result> {
  const errors: string[] = [];

  // 1. test_results.md exists with all_passing: true
  const resultsPath = `${topicDir}/changes/evidence/test_results.md`;
  if (!fileExists(resultsPath)) {
    errors.push(`test_results.md not found at ${resultsPath}`);
  } else {
    const allPassing = readYamlField(resultsPath, "all_passing");
    if (allPassing !== true) {
      errors.push(`test_results.md: all_passing is not true`);
    }
  }

  // 2. Latest code review must_fix empty
  const reviewPath = findLatestReview(topicDir, "code_review_v");
  if (!reviewPath) {
    errors.push("No code_review_v{N}.md found");
  } else {
    const mfResult = checkNoMustFix(reviewPath);
    if (!mfResult.passed) {
      errors.push(mfResult.error!);
    }
  }

  return { passed: errors.length === 0, errors };
}
```

- [ ] **步骤 2：写入 gate_test.ts**

```typescript
// Phase 4 (test) L1 gate
import type { GateL1Result } from "../types.js";
import { checkTestExecution } from "./common.js";

export async function gateTest(topicDir: string): Promise<GateL1Result> {
  const templatePath = `${topicDir}/test_cases_template.json`;
  const executionPath = `${topicDir}/changes/evidence/test_execution.json`;

  const result = checkTestExecution(templatePath, executionPath);
  return { passed: result.passed, errors: result.errors };
}
```

- [ ] **步骤 3：类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit gates/gate_dev.ts gates/gate_test.ts 2>&1
```
预期：无错误

- [ ] **步骤 4：提交**

```bash
git add extensions/coding-workflow/gates/gate_dev.ts extensions/coding-workflow/gates/gate_test.ts
git commit -m "feat: add V5 dev and test phase gates"
```

---

## Task 3.3: Phase 5 Gate + Gate Runner

**文件：**
- 创建：`extensions/coding-workflow/gates/gate_pr.ts`
- 创建：`extensions/coding-workflow/gate-runner.ts`

- [ ] **步骤 1：写入 gate_pr.ts**

```typescript
// Phase 5 (pr) L1 gate
import type { GateL1Result } from "../types.js";
import { fileExists, readYamlField } from "./common.js";

export async function gatePr(topicDir: string): Promise<GateL1Result> {
  const errors: string[] = [];

  const prPath = `${topicDir}/changes/evidence/pr_evidence.md`;
  if (!fileExists(prPath)) {
    errors.push(`pr_evidence.md not found at ${prPath}`);
  } else {
    const prCreated = readYamlField(prPath, "pr_created");
    if (prCreated !== true) {
      errors.push(`pr_evidence.md: pr_created is not true`);
    }
  }

  const ciPath = `${topicDir}/changes/evidence/ci_results.md`;
  if (!fileExists(ciPath)) {
    errors.push(`ci_results.md not found at ${ciPath}`);
  } else {
    const ciPassed = readYamlField(ciPath, "ci_passed");
    if (ciPassed !== true) {
      errors.push(`ci_results.md: ci_passed is not true`);
    }
  }

  return { passed: errors.length === 0, errors };
}
```

- [ ] **步骤 2：写入 gate-runner.ts**

```typescript
// Gate runner: dispatch to phase-specific gate
import type { PhaseId, GateL1Result, GateResult, WorkflowState } from "./types.js";
import { gateSpec } from "./gates/gate_spec.js";
import { gatePlan } from "./gates/gate_plan.js";
import { gateDev } from "./gates/gate_dev.js";
import { gateTest } from "./gates/gate_test.js";
import { gatePr } from "./gates/gate_pr.js";

/** Run L1 check for the given phase */
export async function runL1Gate(
  phaseId: PhaseId,
  topicDir: string,
  planComplexity?: "L1" | "L2",
): Promise<GateL1Result> {
  switch (phaseId) {
    case 1:
      return gateSpec(topicDir);
    case 2:
      return gatePlan(topicDir, planComplexity);
    case 3:
      return gateDev(topicDir);
    case 4:
      return gateTest(topicDir);
    case 5:
      return gatePr(topicDir);
    default:
      return { passed: false, errors: [`Unknown phase: ${phaseId}`] };
  }
}

/**
 * Run full gate (L1 + L2). Returns combined result.
 * L2 is only run if L1 passes.
 */
export async function runGate(
  phaseId: PhaseId,
  topicDir: string,
  projectRoot: string,
  planComplexity?: "L1" | "L2",
): Promise<GateResult> {
  const l1 = await runL1Gate(phaseId, topicDir, planComplexity);

  if (!l1.passed) {
    return { l1, passed: false };
  }

  // L2: LLM anti-fabrication verification
  // Dynamically imported to avoid circular deps
  const { runL2Verification } = await import("./gate-verifier.js");
  const l2 = await runL2Verification(phaseId, topicDir, projectRoot);

  if (l2 && !l2.passed) {
    return { l1, l2, passed: false };
  }

  return { l1, l2, passed: true };
}
```

- [ ] **步骤 3：类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit gates/gate_pr.ts gate-runner.ts 2>&1
```
预期：无错误（gate-verifier.ts 先不检查）

- [ ] **步骤 4：提交**

```bash
git add extensions/coding-workflow/gates/gate_pr.ts extensions/coding-workflow/gate-runner.ts
git commit -m "feat: add V5 PR gate and gate runner"
```

---

## Task 3.4: L2 Gate Verifier

**文件：**
- 创建：`extensions/coding-workflow/gate-verifier.ts`

- [ ] **步骤 1：写入 gate-verifier.ts**

```typescript
// L2 LLM anti-fabrication verification
// Calls llm-simple-router via HTTP. Fail-open on network errors.
import type { PhaseId, GateL2Result } from "./types.js";
import { PHASE_NAMES } from "./types.js";
import * as fs from "node:fs";

const LLM_ROUTER_URL = "http://127.0.0.1:9981/v1/messages";
const L2_TIMEOUT_MS = 30_000;

interface L2Request {
  phase: string;
  phaseNumber: number;
  topicDir: string;
  deliverables: string[];
}

interface L2Response {
  verdict: "pass" | "fail";
  reason?: string;
}

function collectDeliverables(topicDir: string, phaseId: PhaseId): string[] {
  // Collect file contents for L2 verification
  const files: string[] = [];
  const add = (p: string) => {
    if (fs.existsSync(p)) files.push(p);
  };

  const td = topicDir;
  const ed = `${td}/changes/evidence`;
  const rd = `${td}/changes/reviews`;

  switch (phaseId) {
    case 1:
      add(`${td}/spec.md`);
      add(`${rd}/spec_review_v1.md`);
      add(`${rd}/spec_review_v2.md`);
      add(`${rd}/spec_review_v3.md`);
      break;
    case 2:
      add(`${td}/plan.md`);
      add(`${td}/e2e-test-plan.md`);
      add(`${td}/plan-backend.md`);
      add(`${td}/plan-frontend.md`);
      add(`${td}/plan-api-contract.md`);
      add(`${rd}/plan_review_v1.md`);
      add(`${rd}/plan_review_v2.md`);
      break;
    case 3:
      add(`${ed}/test_results.md`);
      add(`${rd}/code_review_v1.md`);
      add(`${rd}/code_review_v2.md`);
      break;
    case 4:
      add(`${ed}/test_execution.json`);
      add(`${td}/test_cases_template.json`);
      break;
    case 5:
      add(`${ed}/pr_evidence.md`);
      add(`${ed}/ci_results.md`);
      break;
  }

  return files;
}

function buildL2Prompt(phaseId: PhaseId, topicDir: string): string {
  const phaseName = PHASE_NAMES[phaseId];
  const deliverables = collectDeliverables(topicDir, phaseId);

  let prompt = `You are verifying Phase ${phaseId} (${phaseName}) deliverables for fabrication.\n\n`;
  prompt += `Files to verify:\n`;
  for (const f of deliverables) {
    prompt += `- ${f}\n`;
  }
  prompt += `\nVerify that:\n`;
  prompt += `1. All files exist and have valid YAML frontmatter\n`;
  prompt += `2. Review files have zero remaining MUST FIX items\n`;
  prompt += `3. Test results are consistent with actual code changes\n`;
  prompt += `4. No fabricated or placeholder content exists\n`;
  prompt += `\nRespond with JSON only:\n`;
  prompt += `{"verdict": "pass" | "fail", "reason": "explanation"}`;

  return prompt;
}

export async function runL2Verification(
  phaseId: PhaseId,
  topicDir: string,
  _projectRoot: string,
): Promise<GateL2Result | undefined> {
  const prompt = buildL2Prompt(phaseId, topicDir);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), L2_TIMEOUT_MS);

    const response = await fetch(LLM_ROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llm-simple-router/glm-5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Fail-open: HTTP errors don't block
    if (!response.ok) {
      return { passed: true, error: `L2 HTTP ${response.status} — fail-open` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { passed: true, error: "L2 response not parseable — fail-open" };
    }

    let parsed: L2Response;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return { passed: true, error: "L2 JSON parse error — fail-open" };
    }

    if (parsed.verdict === "fail") {
      return {
        passed: false,
        error: parsed.reason || "L2 verdict: fail",
        raw: content,
      };
    }

    return { passed: true };
  } catch {
    // Network error or timeout — fail-open
    return { passed: true, error: "L2 network error — fail-open" };
  }
}
```

- [ ] **步骤 2：类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit gate-verifier.ts 2>&1
```
预期：无错误

- [ ] **步骤 3：提交**

```bash
git add extensions/coding-workflow/gate-verifier.ts
git commit -m "feat: add V5 L2 gate verifier (LLM anti-fabrication)"
```
