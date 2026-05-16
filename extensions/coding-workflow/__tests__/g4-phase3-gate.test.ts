// TDD RED — Phase 3 Gate (implementation not yet exists)
// Top-level import of non-existent module → all tests FAIL at import time
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runPhase3Gate } from "../gates/gate_phase3.js";

// ── Shared mock data ───────────────────────────────────────

const FIXTURE_DIR = join(__dirname, "fixtures", "g4-temp");

const allPassEvidence = {
  loop: "e2e-testing",
  state: { totalItems: 3, completedItems: 3, currentRound: 1, maxRounds: 5, phase: "gate_check", verificationRoundCompleted: true },
  rounds: [{
  round: 1,
  items: [
    { item_id: "t1", status: "EXECUTED", evidence: {} },
    { item_id: "t2", status: "EXECUTED", evidence: {} },
    { item_id: "t3", status: "EXECUTED", evidence: {} },
  ],
  }],
  verification_round: {
  completed: true,
  startedAt: "2026-05-16T10:00:00Z",
  items: [
    { item_id: "t1", status: "EXECUTED", evidence: {} },
    { item_id: "t2", status: "EXECUTED", evidence: {} },
    { item_id: "t3", status: "EXECUTED", evidence: {} },
  ],
  },
};

const planTasksAll = ["t1", "t2", "t3"];

// ── Tests ──────────────────────────────────────────────────

describe("G4: Phase 3 Gate", () => {
  beforeEach(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  });
  afterEach(() => {
  if (existsSync(FIXTURE_DIR)) {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
  });

  it("TC-4-01: 5 L1 checks all PASS → Gate PASS", async () => {
  // Create valid evidence files so evidence_files_exist passes
  const screenshotFile = join(FIXTURE_DIR, "screenshot.png");
  writeFileSync(screenshotFile, Buffer.alloc(2048, "x"));

  const evidenceWithFiles = {
    ...allPassEvidence,
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: { screenshots: [screenshotFile] } },
      { item_id: "t2", status: "EXECUTED", evidence: { screenshots: [screenshotFile] } },
      { item_id: "t3", status: "EXECUTED", evidence: { screenshots: [screenshotFile] } },
    ],
    }],
  };

  const result = await runPhase3Gate(evidenceWithFiles, planTasksAll, FIXTURE_DIR);
  assert.strictEqual(result.passed, true, "all L1 checks PASS should result in Gate PASS");
  assert.ok(result.output, "result should have output summary");
  });

  it("TC-4-02: any single L1 FAIL → Gate FAIL (short-circuit)", async () => {
  // Evidence missing t3 → item_coverage fails
  const evidenceMissingItem = {
    ...allPassEvidence,
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "EXECUTED", evidence: {} },
      // t3 is missing → item_coverage should fail
    ],
    }],
  };
  const planWithT3 = ["t1", "t2", "t3"];

  const result = await runPhase3Gate(evidenceMissingItem, planWithT3, FIXTURE_DIR);
  assert.strictEqual(result.passed, false, "any L1 FAIL should cause Gate FAIL");
  });

  it("TC-4-03: L1 all PASS + L2 unavailable → fail-open PASS", async () => {
  // L2 verifier not configured or network error → should not block
  // Provide evidence that passes all L1 checks
  const screenshotFile = join(FIXTURE_DIR, "screenshot.png");
  writeFileSync(screenshotFile, Buffer.alloc(2048, "x"));

  const evidenceWithFiles = {
    ...allPassEvidence,
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: { screenshots: [screenshotFile] } },
      { item_id: "t2", status: "EXECUTED", evidence: { screenshots: [screenshotFile] } },
      { item_id: "t3", status: "EXECUTED", evidence: { screenshots: [screenshotFile] } },
    ],
    }],
  };

  // Pass no L2 config to simulate L2 unavailability
  const result = await runPhase3Gate(evidenceWithFiles, planTasksAll, FIXTURE_DIR, { l2Enabled: false });
  assert.strictEqual(result.passed, true, "L1 PASS + L2 unavailable should be fail-open PASS");
  });

  it("TC-4-04: Gate output format matches { passed, output }", async () => {
  const result = await runPhase3Gate(allPassEvidence, planTasksAll, FIXTURE_DIR);

  assert.ok("passed" in result, "result must have 'passed' field");
  assert.ok("output" in result, "result must have 'output' field");
  assert.strictEqual(typeof result.passed, "boolean", "'passed' must be boolean");
  assert.strictEqual(typeof result.output, "string", "'output' must be string");
  });

  it("TC-4-05: Gate FAIL output describes first failed check", async () => {
  // Evidence with 1 ERROR item → executed_per_item fails first
  const evidenceWithError = {
    loop: "e2e-testing",
    state: { totalItems: 3, completedItems: 2, currentRound: 1, maxRounds: 5, phase: "gate_check", verificationRoundCompleted: true },
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "ERROR", evidence: { error: "timeout" } },
      { item_id: "t3", status: "EXECUTED", evidence: {} },
    ],
    }],
    verification_round: {
    completed: true,
    startedAt: "2026-05-16T10:00:00Z",
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "EXECUTED", evidence: {} },
      { item_id: "t3", status: "EXECUTED", evidence: {} },
    ],
    },
  };

  const result = await runPhase3Gate(evidenceWithError, planTasksAll, FIXTURE_DIR);
  assert.strictEqual(result.passed, false, "should FAIL when items have ERROR status");
  assert.ok(
    result.output.includes("executed_per_item") || result.output.includes("item_coverage"),
    `FAIL output should mention the failed check name, got: "${result.output}"`,
  );
  });
});
