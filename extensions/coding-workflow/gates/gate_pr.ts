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
