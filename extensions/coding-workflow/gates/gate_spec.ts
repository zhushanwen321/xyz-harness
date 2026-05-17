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

  // 2. Latest spec review exists and has no MUST FIX
  const reviewPath = findLatestReview(topicDir, "spec_review_v");
  if (!reviewPath) {
    errors.push("No spec_review_v{N}.md found");
  } else {
    const mfResult = checkNoMustFix(reviewPath);
    if (!mfResult.passed) {
      errors.push(mfResult.error!);
    }
  }

  return { passed: errors.length === 0, errors };
}
