import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// T4: import LoopEngine
import { LoopEngine } from "../loop-engine.js";
import type { LoopConfig } from "../types.js";

const TEST_CONFIG: LoopConfig = {
  name: "Test Loop",
  itemSource: "plan_tasks",
  itemIdField: "item_id",
  allowedStatuses: ["EXECUTED", "ERROR"],
  completedStatus: "EXECUTED",
  maxRounds: 5,
  batchSize: 5,
  requireVerificationRound: true,
  evidenceFile: ".xyz-harness/test-topic/changes/evidence/e2e-evidence.json",
  roundPrompt: "Phase: {phaseName}, Round: {currentRound}/{maxRounds}",
  gateScript: "phase3",
  gateChecks: [{ name: "item_coverage", type: "L1" }],
  confirmationRequired: true
};

describe("G2: Loop Engine state machine", () => {
  let tmpDir: string;
  let engine: LoopEngine;

  beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "loop-test-"));
  engine = new LoopEngine(TEST_CONFIG, tmpDir, "test-topic");
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  // getEvidenceFilePath() returns relative path; join with tmpDir for absolute path
  function absEvidencePath(): string {
  return join(tmpDir, engine.getEvidenceFilePath());
  }

  it("TC-2-01: init() creates empty evidence JSON", () => {
  engine.init();
  const evidencePath = absEvidencePath();
  assert.ok(existsSync(evidencePath));
  const content = JSON.parse(readFileSync(evidencePath, "utf-8"));
  assert.deepStrictEqual(content.rounds, []);
  });

  it("TC-2-02: init() replaces {topicDir} in evidenceFile", () => {
  engine.init();
  const evidencePath = engine.getEvidenceFilePath();
  assert.ok(!evidencePath.includes("{topicDir}"));
  });

  it("TC-2-03: startRound() -> phase=in_round", () => {
  engine.init();
  engine.startRound();
  assert.strictEqual(engine.state.phase, "in_round");
  });

  it("TC-2-04: onRoundComplete counts completedItems (3/5 EXECUTED)", () => {
  engine.init();
  engine.startRound(); // round=1
  const evidencePath = absEvidencePath();
  const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  evidence.rounds.push({
    round: 1, startedAt: new Date().toISOString(),
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "ERROR", evidence: { error: "timeout" } },
    { item_id: "case-4", status: "EXECUTED", evidence: {} },
    { item_id: "case-5", status: "ERROR", evidence: { error: "crash" } }
    ]
  });
  evidence.state.totalItems = 5;
  evidence.state.currentRound = 1;
  writeFileSync(evidencePath, JSON.stringify(evidence));
  engine.onRoundComplete();
  // LoopState.items contains items that reached completedStatus
  assert.strictEqual(engine.state.items.length, 3);
  });

  it("TC-2-05: all EXECUTED -> phase=verification", () => {
  engine.init();
  engine.startRound(); // round=1
  const evidencePath = absEvidencePath();
  const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  evidence.rounds.push({
    round: 1, startedAt: new Date().toISOString(),
    items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "EXECUTED", evidence: {} },
    { item_id: "case-4", status: "EXECUTED", evidence: {} },
    { item_id: "case-5", status: "EXECUTED", evidence: {} }
    ]
  });
  evidence.state.totalItems = 5;
  evidence.state.currentRound = 1;
  writeFileSync(evidencePath, JSON.stringify(evidence));
  engine.onRoundComplete();
  assert.strictEqual(engine.state.phase, "verification");
  });

  it("TC-2-06: verification_round.completed -> phase=gate_check", () => {
  engine.init();
  engine.startRound(); // round=1
  const evidencePath = absEvidencePath();
  const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  evidence.state.totalItems = 5;
  evidence.state.completedItems = 5;
  evidence.state.currentRound = 1;
  evidence.state.phase = "verification";
  // onRoundComplete counts completedItemIds from evidence.rounds, not verification_round
  // so we must put all EXECUTED items in rounds too
  evidence.rounds.push({
    round: 1, startedAt: "", items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "EXECUTED", evidence: {} },
    { item_id: "case-4", status: "EXECUTED", evidence: {} },
    { item_id: "case-5", status: "EXECUTED", evidence: {} }
    ]
  });
  evidence.verification_round.completed = true;
  evidence.verification_round.items = [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "EXECUTED", evidence: {} },
    { item_id: "case-4", status: "EXECUTED", evidence: {} },
    { item_id: "case-5", status: "EXECUTED", evidence: {} }
  ];
  writeFileSync(evidencePath, JSON.stringify(evidence));
  // onRoundComplete checks _state.verificationRoundCompleted (in-memory, not from JSON)
  // state getter returns _state reference, so we can mutate through it
  engine.state.verificationRoundCompleted = true;
  engine.onRoundComplete();
  assert.strictEqual(engine.state.phase, "gate_check");
  });

  it("TC-2-07: maxRounds reached but incomplete -> failed", () => {
  const limitedConfig = { ...TEST_CONFIG, maxRounds: 2 };
  const eng = new LoopEngine(limitedConfig, tmpDir, "test-topic");
  eng.init();
  eng.startRound(); // round=1
  eng.startRound(); // round=2
  const evidencePath = join(tmpDir, eng.getEvidenceFilePath());
  const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  evidence.state.totalItems = 5;
  evidence.state.maxRounds = 2;
  evidence.state.currentRound = 2;
  evidence.rounds.push(
    { round: 1, startedAt: "", items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "ERROR", evidence: { error: "x" } },
    { item_id: "case-4", status: "EXECUTED", evidence: {} },
    { item_id: "case-5", status: "EXECUTED", evidence: {} }
    ]},
    { round: 2, startedAt: "", items: [
    { item_id: "case-3", status: "ERROR", evidence: { error: "still broken" } }
    ]}
  );
  writeFileSync(evidencePath, JSON.stringify(evidence));
  eng.onRoundComplete();
  assert.strictEqual(eng.state.phase, "failed");
  });

  it("TC-2-08: getPrompt() replaces variables", () => {
  engine.init();
  engine.startRound(); // round=1
  const prompt = engine.getPrompt();
  // roundPrompt is "Phase: {phaseName}, Round: {currentRound}/{maxRounds}"
  assert.ok(prompt.includes("Test Loop"));
  assert.ok(prompt.includes("1")); // currentRound
  });

  it("TC-2-09: getIncompleteItems() filters correctly (2/5 EXECUTED)", () => {
  engine.init();
  const evidencePath = absEvidencePath();
  const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  evidence.state.totalItems = 5;
  evidence.rounds.push({
    round: 1, startedAt: "", items: [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "ERROR", evidence: {} },
    { item_id: "case-4", status: "ERROR", evidence: {} },
    { item_id: "case-5", status: "ERROR", evidence: {} }
    ]
  });
  writeFileSync(evidencePath, JSON.stringify(evidence));
  const incomplete = engine.getIncompleteItems();
  assert.strictEqual(incomplete.length, 3);
  });

  it("TC-2-10: Verification round returns all items", () => {
  engine.init();
  const evidencePath = absEvidencePath();
  const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  evidence.state.totalItems = 5;
  evidence.state.completedItems = 5;
  evidence.state.phase = "verification";
  evidence.rounds.push({
    round: 1, startedAt: "", items: Array.from({ length: 5 }, (_, i) => ({
    item_id: `case-${i+1}`, status: "EXECUTED", evidence: {}
    }))
  });
  writeFileSync(evidencePath, JSON.stringify(evidence));
  // getIncompleteItems returns ALL items when phase === "verification"
  engine.state.phase = "verification";
  const allItems = engine.getIncompleteItems();
  assert.strictEqual(allItems.length, 5);
  });

  it("TC-2-11: Evidence JSON appends rounds", () => {
  engine.init();
  engine.startRound(); // round=1
  const evidencePath = absEvidencePath();
  // Round 1
  let evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  evidence.rounds.push({ round: 1, startedAt: "", items: [] });
  evidence.state.currentRound = 1;
  writeFileSync(evidencePath, JSON.stringify(evidence));
  engine.onRoundComplete();
  // Round 2
  engine.startRound();
  evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  evidence.rounds.push({ round: 2, startedAt: "", items: [] });
  evidence.state.currentRound = 2;
  writeFileSync(evidencePath, JSON.stringify(evidence));
  engine.onRoundComplete();
  // Verify 2 rounds persisted
  const final = JSON.parse(readFileSync(evidencePath, "utf-8"));
  assert.strictEqual(final.rounds.length, 2);
  });
});
