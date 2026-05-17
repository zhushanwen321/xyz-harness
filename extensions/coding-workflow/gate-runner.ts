// Gate runner: dispatch to phase-specific gate
import type { PhaseId, GateL1Result, GateResult } from "./types.js";
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
  // Dynamically imported to avoid potential circular deps with gate-verifier
  const { runL2Verification } = await import("./gate-verifier.js");
  const l2 = await runL2Verification(phaseId, topicDir, projectRoot);

  if (l2 && !l2.passed) {
    return { l1, l2, passed: false };
  }

  return { l1, l2, passed: true };
}
