// Phase 4 (test) L1 gate
import type { GateL1Result } from "../types.js";
import { checkTestExecution } from "./common.js";

export async function gateTest(topicDir: string): Promise<GateL1Result> {
  const templatePath = `${topicDir}/test_cases_template.json`;
  const executionPath = `${topicDir}/changes/evidence/test_execution.json`;

  const result = checkTestExecution(templatePath, executionPath);
  return { passed: result.passed, errors: result.errors };
}
