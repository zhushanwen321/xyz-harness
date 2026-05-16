// TDD RED — L1 gate check functions (implementation not yet exists)
// Top-level import of non-existent exports → tests FAIL at import time
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  item_coverage,
  executed_per_item,
  verification_round_completed,
  verification_all_executed,
  evidence_files_exist,
} from "../gates/common.js";

// ── Shared mock data ───────────────────────────────────────

const FIXTURE_DIR = join(__dirname, "fixtures", "g3-temp");

const mockEvidenceAllExecuted = {
  loop: "test-loop",
  state: { totalItems: 3, completedItems: 3, currentRound: 1, maxRounds: 5, phase: "done", verificationRoundCompleted: true },
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

const mockPlanTasks = ["t1", "t2", "t3"];

// ── Tests ──────────────────────────────────────────────────

describe("G3: L1 gate check functions", () => {
  beforeEach(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  });
  afterEach(() => {
  if (existsSync(FIXTURE_DIR)) {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
  });

  // ── item_coverage ─────────────────────────────────────────

  it("TC-3-01: item_coverage — all tasks covered → PASS", () => {
  const result = item_coverage(mockEvidenceAllExecuted, mockPlanTasks);
  assert.strictEqual(result.pass, true, "all plan items present in evidence should PASS");
  assert.ok(result.output, "result should have output message");
  });

  it("TC-3-02: item_coverage — missing 1 task → FAIL", () => {
  const planWithExtra = ["t1", "t2", "t3", "t4"]; // t4 not in evidence
  const result = item_coverage(mockEvidenceAllExecuted, planWithExtra);
  assert.strictEqual(result.pass, false, "missing task should FAIL");
  assert.ok(result.output.includes("t4"), "output should mention the missing task");
  });

  // ── executed_per_item ─────────────────────────────────────

  it("TC-3-03: executed_per_item — all items have EXECUTED status → PASS", () => {
  const result = executed_per_item(mockEvidenceAllExecuted);
  assert.strictEqual(result.pass, true, "all items EXECUTED should PASS");
  });

  it("TC-3-04: executed_per_item — one item has only ERROR → FAIL", () => {
  const evidenceWithError = {
    loop: "test-loop",
    state: { totalItems: 3, completedItems: 2, currentRound: 1, maxRounds: 5, phase: "in_round" },
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "ERROR", evidence: { error: "timeout" } },
      { item_id: "t3", status: "EXECUTED", evidence: {} },
    ],
    }],
  };
  const result = executed_per_item(evidenceWithError);
  assert.strictEqual(result.pass, false, "item with ERROR status should FAIL");
  assert.ok(result.output.includes("t2"), "output should mention the failing item");
  });

  // ── verification_round_completed ──────────────────────────

  it("TC-3-05: verification_round_completed — completed=true → PASS", () => {
  const result = verification_round_completed(mockEvidenceAllExecuted);
  assert.strictEqual(result.pass, true, "verification round completed should PASS");
  });

  it("TC-3-06: verification_round_completed — completed=false → FAIL", () => {
  const evidenceNotComplete = {
    ...mockEvidenceAllExecuted,
    verification_round: { completed: false, items: [] },
  };
  const result = verification_round_completed(evidenceNotComplete);
  assert.strictEqual(result.pass, false, "verification round not completed should FAIL");
  });

  // ── verification_all_executed ─────────────────────────────

  it("TC-3-07: verification_all_executed — all verification items EXECUTED → PASS", () => {
  const result = verification_all_executed(mockEvidenceAllExecuted);
  assert.strictEqual(result.pass, true, "all verification items EXECUTED should PASS");
  });

  it("TC-3-08: verification_all_executed — has ERROR in verification → FAIL", () => {
  const evidenceWithVerifyError = {
    ...mockEvidenceAllExecuted,
    verification_round: {
    completed: true,
    startedAt: "2026-05-16T10:00:00Z",
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "ERROR", evidence: { error: "selector not found" } },
      { item_id: "t3", status: "EXECUTED", evidence: {} },
    ],
    },
  };
  const result = verification_all_executed(evidenceWithVerifyError);
  assert.strictEqual(result.pass, false, "ERROR in verification round should FAIL");
  });

  // ── evidence_files_exist ──────────────────────────────────

  it("TC-3-09: evidence_files_exist — files exist and size > 1KB → PASS", () => {
  // Create a real file with enough content
  const validFile = join(FIXTURE_DIR, "screenshot-valid.png");
  const largeContent = Buffer.alloc(2048, "x"); // 2KB of data
  writeFileSync(validFile, largeContent);

  const evidenceWithFiles = {
    ...mockEvidenceAllExecuted,
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: { screenshots: [validFile] } },
      { item_id: "t2", status: "EXECUTED", evidence: { screenshots: [] } },
      { item_id: "t3", status: "EXECUTED", evidence: { screenshots: [] } },
    ],
    }],
  };
  const result = evidence_files_exist(evidenceWithFiles, FIXTURE_DIR);
  assert.strictEqual(result.pass, true, "existing file >1KB should PASS");
  });

  it("TC-3-10: evidence_files_exist — referenced file not found → FAIL", () => {
  const missingFile = join(FIXTURE_DIR, "nonexistent.png");
  const evidenceWithMissing = {
    ...mockEvidenceAllExecuted,
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: { screenshots: [missingFile] } },
    ],
    }],
  };
  const result = evidence_files_exist(evidenceWithMissing, FIXTURE_DIR);
  assert.strictEqual(result.pass, false, "missing evidence file should FAIL");
  });

  it("TC-3-11: evidence_files_exist — file exists but too small → FAIL", () => {
  const tinyFile = join(FIXTURE_DIR, "tiny.png");
  writeFileSync(tinyFile, "x"); // 1 byte

  const evidenceWithTiny = {
    ...mockEvidenceAllExecuted,
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: { screenshots: [tinyFile] } },
    ],
    }],
  };
  const result = evidence_files_exist(evidenceWithTiny, FIXTURE_DIR);
  assert.strictEqual(result.pass, false, "file too small should FAIL");
  });
});
