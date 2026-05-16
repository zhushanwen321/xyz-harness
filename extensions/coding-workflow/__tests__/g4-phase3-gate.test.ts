import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// gate_phase3 is async and takes (projectRoot, config, evidenceFilePath, signal?)
import { gatePhase3 } from "../gates/gate_phase3.js";
import type { LoopConfig } from "../types.js";

const TEST_CONFIG: LoopConfig = {
  name: "Test",
  itemSource: "plan_tasks",
  itemIdField: "item_id",
  allowedStatuses: ["EXECUTED", "ERROR"],
  completedStatus: "EXECUTED",
  maxRounds: 5,
  batchSize: 5,
  requireVerificationRound: true,
  evidenceFile: ".xyz-harness/evidence.json",
  roundPrompt: "",
  gateScript: "phase3",
  gateChecks: [
  { name: "item_coverage", type: "L1" },
  { name: "executed_per_item", type: "L1" },
  { name: "evidence_files_exist", type: "L1" },
  { name: "verification_round_completed", type: "L1" },
  { name: "verification_all_executed", type: "L1" },
  { name: "anti_fabrication", type: "L2" },
  ],
  confirmationRequired: true,
};

function makeFullEvidence(tmpDir: string): string {
  const evidenceDir = join(tmpDir, ".xyz-harness", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, "e2e-evidence.json");
  writeFileSync(
  evidencePath,
  JSON.stringify({
    loop: "test",
    state: {
    totalItems: 1,
    completedItems: 1,
    currentRound: 1,
    maxRounds: 5,
    phase: "gate_check",
    verificationRoundCompleted: true,
    },
    rounds: [
    {
      round: 1,
      startedAt: new Date().toISOString(),
      items: [
      {
        item_id: "case-1",
        status: "EXECUTED",
        evidence: { cdp_commands: ["navigate"], screenshots: [] },
      },
      ],
    },
    ],
    verification_round: {
    completed: true,
    startedAt: new Date().toISOString(),
    items: [
      {
      item_id: "case-1",
      status: "EXECUTED",
      evidence: { cdp_commands: ["navigate"], screenshots: [] },
      },
    ],
    },
  }),
  );
  return evidencePath;
}

describe("G4: Phase 3 Gate", () => {
  let tmpDir: string;

  beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "g4-test-"));
  });
  afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  });

  it("TC-4-01: All 5 L1 checks pass -> Gate PASS", async () => {
  const evidencePath = makeFullEvidence(tmpDir);
  const result = await gatePhase3(tmpDir, TEST_CONFIG, evidencePath);
  assert.strictEqual(result.passed, true);
  });

  it("TC-4-02: Any L1 FAIL -> Gate FAIL (short-circuit)", async () => {
  // No evidence file -> evidence file not found -> FAIL
  const fakePath = join(tmpDir, ".xyz-harness", "evidence", "e2e-evidence.json");
  const result = await gatePhase3(tmpDir, TEST_CONFIG, fakePath);
  assert.strictEqual(result.passed, false);
  assert.ok(result.output.includes("Evidence file not found"));
  });

  it("TC-4-03: L1 all pass + L2 unavailable -> degrade to PASS", async () => {
  const evidencePath = makeFullEvidence(tmpDir);
  const result = await gatePhase3(tmpDir, TEST_CONFIG, evidencePath);
  // L2 (anti-fabrication) will catch import error and degrade to PASS
  assert.strictEqual(result.passed, true);
  assert.ok(result.output.includes("PASS"));
  });

  it("TC-4-04: Gate output format", async () => {
  const evidencePath = makeFullEvidence(tmpDir);
  const result = await gatePhase3(tmpDir, TEST_CONFIG, evidencePath);
  assert.ok(typeof result.passed === "boolean");
  assert.ok(typeof result.output === "string");
  });

  it("TC-4-05: Gate FAIL describes first failed check", async () => {
  const fakePath = join(tmpDir, ".xyz-harness", "evidence", "e2e-evidence.json");
  const result = await gatePhase3(tmpDir, TEST_CONFIG, fakePath);
  assert.strictEqual(result.passed, false);
  assert.ok(result.output.includes("Evidence file not found"));
  });
});
