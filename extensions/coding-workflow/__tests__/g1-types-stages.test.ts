// TDD RED — Type system + Stage definitions (T1+T2)
// ALL tests target features that do NOT exist in current codebase:
//   - WORKFLOW_STAGES has 16 entries (need 15)
//   - Only phases 1|2 exist (need 1|2|3|4)
//   - No LoopConfig/LoopState/GateCheck/LoopPhaseDefinition runtime exports
//   - No loopConfig on any stage
//   - Stage 13 has gateScript "12" (forbidden after refactor)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WORKFLOW_STAGES, E2E_LOOP_CONFIG } from "../stages.js";
import type { LoopConfig, LoopState } from "../types.js";

describe("G1: Type system + Stage definitions", () => {

  it("TC-1-01: phases include 1, 2, 3, and 4", () => {
  const phases = [...new Set(WORKFLOW_STAGES.map(s => s.phase))].sort((a, b) => a - b);
  // Current: [1, 2]. Target: [1, 2, 3, 4]
  assert.deepStrictEqual(phases, [1, 2, 3, 4],
    `Expected phases [1,2,3,4], got [${phases}]`);
  });

  it("TC-1-02: WORKFLOW_STAGES contains exactly 15 entries", () => {
  // Current: 16. Target: 15
  assert.strictEqual(WORKFLOW_STAGES.length, 15,
    `Expected 15 stages, got ${WORKFLOW_STAGES.length}`);
  });

  it("TC-1-03: phase distribution is Phase1=8, Phase2=4, Phase3=1, Phase4=2", () => {
  const byPhase: Record<number, number> = {};
  for (const s of WORKFLOW_STAGES) {
    byPhase[s.phase] = (byPhase[s.phase] || 0) + 1;
  }
  // Current: Phase1=8, Phase2=8
  assert.strictEqual(byPhase[1], 8, "Phase 1 should have 8 stages");
  assert.strictEqual(byPhase[2], 4, "Phase 2 should have 4 stages");
  assert.strictEqual(byPhase[3], 1, "Phase 3 should have 1 stage");
  assert.strictEqual(byPhase[4], 2, "Phase 4 should have 2 stages");
  });

  it("TC-1-04: requiresConfirmation only on Stage 2, 8, 15", () => {
  const confirmed = WORKFLOW_STAGES
    .filter(s => s.requiresConfirmation)
    .map(s => s.number)
    .sort((a, b) => a - b);
  // Current: [2, 8, 16]. Target: [2, 8, 15]
  assert.deepStrictEqual(confirmed, [2, 8, 15]);
  });

  it("TC-1-05: Stage 13 exists and is health check (phase=3)", () => {
  const s13 = WORKFLOW_STAGES.find(s => s.number === 13);
  assert.ok(s13, "Stage 13 must exist");
  // 当前 Stage 13 phase=2，目标是 phase=3（集成健康检查）
  assert.strictEqual(s13.phase, 3, `Stage 13 phase should be 3, got ${s13.phase}`);
  assert.strictEqual(s13.type, "automated");
  });

  it("TC-1-06: E2E_LOOP_CONFIG has all 13 required fields", () => {
  const requiredFields = [
  "name", "itemSource", "itemIdField", "allowedStatuses",
  "completedStatus", "maxRounds", "batchSize",
  "requireVerificationRound", "evidenceFile",
  "roundPrompt", "gateScript", "gateChecks", "confirmationRequired",
  ];
  assert.strictEqual(requiredFields.length, 13, "Sanity: 13 required fields");
  for (const f of requiredFields) {
  assert.ok(f in E2E_LOOP_CONFIG, `E2E_LOOP_CONFIG missing field: ${f}`);
  }
  });

  it("TC-1-07: no stage gateScript or gateScripts contains '12' or '13'", () => {
  // Current: Stage 13 has gateScript="12", Stage 14 has gateScript="13"
  for (const s of WORKFLOW_STAGES) {
    const scripts: string[] = [];
    if (s.gateScript) scripts.push(s.gateScript);
    if (s.gateScripts) scripts.push(...s.gateScripts);
    for (const script of scripts) {
    assert.ok(script !== "12" && script !== "13",
      `Stage ${s.number} references forbidden gate script "${script}"`);
    }
  }
  });

  it("TC-1-08: E2E_LOOP_CONFIG gateChecks are valid", () => {
  for (const gc of E2E_LOOP_CONFIG.gateChecks) {
  assert.ok(gc.name, "gateCheck must have name");
  assert.ok(gc.type === "L1" || gc.type === "L2", `gateCheck type must be L1 or L2, got ${gc.type}`);
  }
  assert.strictEqual(E2E_LOOP_CONFIG.gateChecks.length, 6, "Expected 6 gate checks");
  });

  it("TC-1-09: LoopState type is structurally correct", () => {
  // 验证 LoopState 接口结构通过构造符合接口的对象
  const ls: LoopState = {
  round: 1, maxRounds: 5, items: [],
  verificationRoundCompleted: false, phase: "in_round",
  };
  assert.strictEqual(ls.round, 1);
  assert.strictEqual(ls.phase, "in_round");
  });

  it("TC-1-10: LoopConfig type is structurally correct", () => {
  // 验证 LoopConfig 接口结构通过构造符合接口的对象
  const lc: LoopConfig = {
  name: "test", itemSource: "plan_tasks", itemIdField: "id",
  allowedStatuses: ["EXECUTED"], completedStatus: "EXECUTED",
  maxRounds: 3, batchSize: 5, requireVerificationRound: true,
  evidenceFile: ".json", roundPrompt: "", gateScript: "",
  gateChecks: [], confirmationRequired: false,
  };
  assert.strictEqual(lc.maxRounds, 3);
  });
});
