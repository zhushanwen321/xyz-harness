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
