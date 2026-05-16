import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LoopEngine } from "../loop-engine.js";
import { E2E_LOOP_CONFIG } from "../stages.js";

// Helper: write evidence JSON to the path the engine expects
function writeEvidence(tmpDir: string, engine: LoopEngine, evidence: Record<string, unknown>) {
  const absPath = join(tmpDir, engine.getEvidenceFilePath());
  writeFileSync(absPath, JSON.stringify(evidence));
}

// Helper: read evidence JSON from disk
function readEvidence(tmpDir: string, engine: LoopEngine) {
  const absPath = join(tmpDir, engine.getEvidenceFilePath());
  return JSON.parse(readFileSync(absPath, "utf-8"));
}

describe("G8: Loop tools (via LoopEngine)", () => {
  let tmpDir: string;

  beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "g8-test-"));
  });

  afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── harness_loop_round_complete 核心逻辑 ──────────────────
  //
  // The tool calls engine.onRoundComplete(), which:
  //   1. reads evidence JSON from disk
  //   2. counts completedItemIds (status === completedStatus) across all rounds
  //   3. checks verificationRoundCompleted
  //   4. returns: "next_round" | "verification" | "gate_check" | "failed"
  //      and sets engine.state.phase accordingly

  it("TC-8-01: round complete — some items incomplete → continue in_round", () => {
  const engine = new LoopEngine(E2E_LOOP_CONFIG, tmpDir, "test-topic");
  engine.init();
  engine.startRound(); // round=1

  const evidence = readEvidence(tmpDir, engine);
  evidence.state.totalItems = 5;
  evidence.state.currentRound = 1;
  evidence.rounds = [{
    round: 1,
    startedAt: new Date().toISOString(),
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "ERROR", evidence: { error: "timeout" } },
    { item_id: "case-4", status: "ERROR", evidence: { error: "crash" } },
    { item_id: "case-5", status: "ERROR", evidence: { error: "assert" } },
    ],
  }];
  writeEvidence(tmpDir, engine, evidence);

  const result = engine.onRoundComplete();
  assert.strictEqual(result, "next_round", "Should return next_round with incomplete items");
  assert.strictEqual(engine.state.phase, "in_round");
  assert.strictEqual(engine.state.items.length, 2, "Only EXECUTED items should be counted as completed");
  assert.strictEqual(engine.state.round, 1);
  });

  it("TC-8-02: round complete — all items EXECUTED → phase=verification", () => {
  const engine = new LoopEngine(E2E_LOOP_CONFIG, tmpDir, "test-topic");
  engine.init();
  engine.startRound(); // round=1

  const evidence = readEvidence(tmpDir, engine);
  evidence.state.totalItems = 3;
  evidence.state.currentRound = 1;
  evidence.rounds = [{
    round: 1,
    startedAt: new Date().toISOString(),
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "EXECUTED", evidence: {} },
    ],
  }];
  writeEvidence(tmpDir, engine, evidence);

  const result = engine.onRoundComplete();
  assert.strictEqual(result, "verification", "All items completed should trigger verification");
  assert.strictEqual(engine.state.phase, "verification");
  assert.strictEqual(engine.state.items.length, 3);
  });

  it("TC-8-03: verification complete → gate_check", () => {
  const engine = new LoopEngine(E2E_LOOP_CONFIG, tmpDir, "test-topic");
  engine.init();

  const evidence = readEvidence(tmpDir, engine);
  evidence.state.totalItems = 2;
  evidence.state.completedItems = 2;
  evidence.state.currentRound = 1;
  evidence.state.phase = "verification";
  evidence.rounds = [{
    round: 1,
    startedAt: "",
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    ],
  }];
  evidence.verification_round = {
    completed: true,
    startedAt: "",
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    ],
  };
  writeEvidence(tmpDir, engine, evidence);

  // onRoundComplete reads verification_round.completed from evidence JSON
  // and syncs to _state.verificationRoundCompleted
  const result = engine.onRoundComplete();
  assert.strictEqual(result, "gate_check", "Completed verification should lead to gate_check");
  assert.strictEqual(engine.state.phase, "gate_check");
  assert.strictEqual(engine.state.verificationRoundCompleted, true);
  });

  it("TC-8-04: max rounds reached but incomplete → failed", () => {
  const limitedConfig = { ...E2E_LOOP_CONFIG, maxRounds: 1 };
  const engine = new LoopEngine(limitedConfig, tmpDir, "test-topic");
  engine.init();
  engine.startRound(); // round=1 (also maxRounds=1)

  const evidence = readEvidence(tmpDir, engine);
  evidence.state.totalItems = 3;
  evidence.state.currentRound = 1;
  evidence.rounds = [{
    round: 1,
    startedAt: "",
    items: [
    { item_id: "case-1", status: "ERROR", evidence: { error: "fail" } },
    { item_id: "case-2", status: "ERROR", evidence: { error: "fail" } },
    { item_id: "case-3", status: "EXECUTED", evidence: {} },
    ],
  }];
  writeEvidence(tmpDir, engine, evidence);

  const result = engine.onRoundComplete();
  assert.strictEqual(result, "failed", "Max rounds with incomplete items should fail");
  assert.strictEqual(engine.state.phase, "failed");
  });

  it("TC-8-05: multi-round accumulation — item completed in round 2 after ERROR in round 1", () => {
  const engine = new LoopEngine(E2E_LOOP_CONFIG, tmpDir, "test-topic");
  engine.init();

  // Round 1: 2/3 EXECUTED
  engine.startRound();
  let evidence = readEvidence(tmpDir, engine);
  evidence.state.totalItems = 3;
  evidence.state.currentRound = 1;
  evidence.rounds = [{
    round: 1,
    startedAt: "",
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "ERROR", evidence: { error: "flaky" } },
    ],
  }];
  writeEvidence(tmpDir, engine, evidence);

  let result = engine.onRoundComplete();
  assert.strictEqual(result, "next_round");

  // Round 2: case-3 now EXECUTED
  engine.startRound(); // round=2
  evidence = readEvidence(tmpDir, engine);
  evidence.state.currentRound = 2;
  evidence.rounds.push({
    round: 2,
    startedAt: "",
    items: [
    { item_id: "case-3", status: "EXECUTED", evidence: {} },
    ],
  });
  writeEvidence(tmpDir, engine, evidence);

  result = engine.onRoundComplete();
  // case-1, case-2 from round 1 + case-3 from round 2 = all 3 EXECUTED
  assert.strictEqual(result, "verification", "Item recovered in round 2 should count as completed");
  assert.strictEqual(engine.state.phase, "verification");
  assert.strictEqual(engine.state.items.length, 3);
  });

  it("TC-8-06: verification NOT completed → phase stays verification (not gate_check)", () => {
  const engine = new LoopEngine(E2E_LOOP_CONFIG, tmpDir, "test-topic");
  engine.init();

  const evidence = readEvidence(tmpDir, engine);
  evidence.state.totalItems = 2;
  evidence.state.currentRound = 1;
  evidence.rounds = [{
    round: 1,
    startedAt: "",
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    ],
  }];
  evidence.verification_round = {
    completed: false,
    startedAt: "",
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "ERROR", evidence: { error: "still broken" } },
    ],
  };
  writeEvidence(tmpDir, engine, evidence);

  const result = engine.onRoundComplete();
  // All items in rounds are EXECUTED, but verification_round.completed = false
  assert.strictEqual(result, "verification", "Without verification completion, should go to verification");
  assert.strictEqual(engine.state.phase, "verification");
  });

  // ── harness_loop_exit 相关 ─────────────────────────────────
  //
  // harness_loop_exit is a thin wrapper: validates phase === 3,
  // then returns { earlyExit: true, reason }.
  // It does NOT mutate engine state. The meaningful behavior to test
  // is that engine state remains consistent after an early abort.

  it("TC-8-07: loop exit — engine state snapshot remains consistent", () => {
  const engine = new LoopEngine(E2E_LOOP_CONFIG, tmpDir, "test-topic");
  engine.init();
  engine.startRound();

  // Simulate partial progress before early exit
  const evidence = readEvidence(tmpDir, engine);
  evidence.state.totalItems = 4;
  evidence.state.currentRound = 1;
  evidence.rounds = [{
    round: 1,
    startedAt: "",
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "ERROR", evidence: { error: "env broken" } },
    ],
  }];
  writeEvidence(tmpDir, engine, evidence);

  // Before "exit", snapshot state
  assert.strictEqual(engine.state.phase, "in_round");
  assert.strictEqual(engine.state.round, 1);
  // State doesn't change — exit is just a signal, engine keeps last state
  assert.strictEqual(engine.state.round, 1);
  });

  it("TC-8-08: onRoundComplete return value matches phase transition", () => {
  const engine = new LoopEngine(E2E_LOOP_CONFIG, tmpDir, "test-topic");
  engine.init();

  // Empty rounds → 0 completed, rounds < maxRounds → next_round
  engine.startRound();
  let evidence = readEvidence(tmpDir, engine);
  evidence.state.totalItems = 5;
  evidence.state.currentRound = 1;
  evidence.rounds = [{ round: 1, startedAt: "", items: [] }];
  writeEvidence(tmpDir, engine, evidence);

  let result = engine.onRoundComplete();
  assert.strictEqual(result, "next_round");
  assert.strictEqual(engine.state.phase, "in_round");

  // Now complete all items
  engine.startRound(); // round=2
  evidence = readEvidence(tmpDir, engine);
  evidence.state.currentRound = 2;
  evidence.rounds.push({
    round: 2,
    startedAt: "",
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "EXECUTED", evidence: {} },
    { item_id: "case-4", status: "EXECUTED", evidence: {} },
    { item_id: "case-5", status: "EXECUTED", evidence: {} },
    ],
  });
  writeEvidence(tmpDir, engine, evidence);

  result = engine.onRoundComplete();
  assert.strictEqual(result, "verification");
  assert.strictEqual(engine.state.phase, "verification");
  });
});
