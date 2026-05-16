import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// T6: gate_phase3.ts 尚未创建 — import 失败 = RED
import { gatePhase3 } from "../gates/gate_phase3.js";
import type { LoopConfig } from "../types.js";

const TEST_CONFIG: LoopConfig = {
  name: "Test",
  itemSource: "plan_tasks",
  itemIdField: "case_id",
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

function makeFullEvidence(tmpDir: string) {
  const dir = join(tmpDir, ".xyz-harness", "evidence");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
  join(dir, "e2e-evidence.json"),
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
}

describe("G4: Phase 3 Gate", () => {
  let tmpDir: string;

  beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "g4-test-"));
  });
  afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  });

  it("TC-4-01: All 5 L1 checks pass → Gate PASS", () => {
  makeFullEvidence(tmpDir);
  const result = gatePhase3(tmpDir, TEST_CONFIG);
  assert.strictEqual(result.passed, true);
  });

  it("TC-4-02: Any L1 FAIL → Gate FAIL (short-circuit)", () => {
  // 不写 evidence → item_coverage 会失败
  const result = gatePhase3(tmpDir, TEST_CONFIG);
  assert.strictEqual(result.passed, false);
  assert.ok(result.output.includes("item_coverage"));
  });

  it("TC-4-03: L1 all pass + L2 unavailable → degrade to PASS", () => {
  makeFullEvidence(tmpDir);
  // L2 需要 localhost LLM，测试环境不可用时应降级通过
  const result = gatePhase3(tmpDir, TEST_CONFIG);
  assert.strictEqual(result.passed, true);
  });

  it("TC-4-04: Gate output format", () => {
  makeFullEvidence(tmpDir);
  const result = gatePhase3(tmpDir, TEST_CONFIG);
  assert.ok(typeof result.passed === "boolean");
  assert.ok(typeof result.output === "string");
  });

  it("TC-4-05: Gate FAIL describes first failed check", () => {
  const result = gatePhase3(tmpDir, TEST_CONFIG);
  assert.strictEqual(result.passed, false);
  assert.ok(result.output.includes("item_coverage"));
  });
});
