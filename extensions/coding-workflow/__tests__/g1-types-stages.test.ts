// TDD RED — Type system + Stage definitions (T1+T2)
import { describe, it } from "node:test";
import assert from "node:assert";
import { WORKFLOW_STAGES } from "../stages.js";
import type { LoopConfig, GateCheck } from "../types.js";

describe("G1: Type system + Stage definitions", () => {
  it("TC-1-01: currentPhase type allows 1|2|3|4", () => {
  const phases = [...new Set(WORKFLOW_STAGES.map(s => s.phase))];
  assert.deepStrictEqual(phases.sort(), [1, 2, 3, 4]);
  });

  it("TC-1-02: WORKFLOW_STAGES length", () => {
  assert.strictEqual(WORKFLOW_STAGES.length, 15);
  });

  it("TC-1-02b: Phase distribution correct", () => {
  const byPhase: Record<number, number> = {};
  for (const s of WORKFLOW_STAGES) {
    byPhase[s.phase] = (byPhase[s.phase] || 0) + 1;
  }
  assert.strictEqual(byPhase[1], 8);
  assert.strictEqual(byPhase[2], 4);
  assert.strictEqual(byPhase[3], 1);
  assert.strictEqual(byPhase[4], 2);
  });

  it("TC-1-03: requiresConfirmation only at Stage 2/8/15", () => {
  const confirmed = WORKFLOW_STAGES.filter(s => s.requiresConfirmation).map(s => s.number);
  assert.deepStrictEqual(confirmed.sort(), [2, 8, 15]);
  });

  it("TC-1-04: Stage 13 is health check", () => {
  const s13 = WORKFLOW_STAGES.find(s => s.number === 13);
  assert.ok(s13);
  assert.strictEqual(s13!.type, "automated");
  });

  it("TC-1-05: LoopConfig has all required fields", () => {
  const fields: Array<keyof LoopConfig> = [
    "name", "itemSource", "itemIdField", "allowedStatuses",
    "completedStatus", "maxRounds", "batchSize", "requireVerificationRound",
    "evidenceFile", "roundPrompt", "gateScript", "gateChecks", "confirmationRequired"
  ];
  assert.strictEqual(fields.length, 13);
  });

  it("TC-1-06: No stage references removed gates", () => {
  const allScripts = WORKFLOW_STAGES.flatMap(s => {
    const scripts: string[] = [];
    if (s.gateScript) scripts.push(s.gateScript);
    if (s.gateScripts) scripts.push(...s.gateScripts);
    return scripts;
  });
  assert.ok(!allScripts.includes("12"), "gate_12 should be removed");
  assert.ok(!allScripts.includes("13"), "gate_13 should be removed");
  });

  it("TC-1-07: GateCheck type compiles", () => {
  const check: GateCheck = { name: "item_coverage", type: "L1" };
  assert.strictEqual(check.name, "item_coverage");
  });
});
