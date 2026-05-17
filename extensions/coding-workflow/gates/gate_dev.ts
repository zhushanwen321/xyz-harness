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
