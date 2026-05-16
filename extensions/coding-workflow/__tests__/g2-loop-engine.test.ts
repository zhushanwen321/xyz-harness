import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// T4: 尚未实现 — import 失败 = RED
import { LoopEngine } from "../loop-engine.js";
import type { LoopConfig } from "../types.js";

const TEST_CONFIG: LoopConfig = {
  name: "Test Loop",
  itemSource: "plan_tasks",
  itemIdField: "case_id",
  allowedStatuses: ["EXECUTED", "ERROR"],
  completedStatus: "EXECUTED",
  maxRounds: 5,
  batchSize: 5,
  requireVerificationRound: true,
  evidenceFile: ".xyz-harness/test-topic/changes/evidence/e2e-evidence.json",
  roundPrompt: "test-round",
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

  it("TC-2-01: init() creates empty evidence JSON", () => {
  engine.init();
  const evidencePath = join(tmpDir, ".xyz-harness", "test-topic", "changes", "evidence", "e2e-evidence.json");
  assert.ok(existsSync(evidencePath));
  const content = JSON.parse(readFileSync(evidencePath, "utf-8"));
  assert.deepStrictEqual(content.rounds, []);
  });

  it("TC-2-02: init() replaces {topicDir} in evidenceFile", () => {
  engine.init();
  const evidencePath = engine.getEvidenceFilePath();
  assert.ok(!evidencePath.includes("{topicDir}"));
  });

  it("TC-2-03: startRound() → phase=in_round", () => {
  engine.init();
  engine.startRound();
  assert.strictEqual(engine.state.phase, "in_round");
  });

  it("TC-2-04: onRoundComplete counts completedItems (3/5 EXECUTED)", () => {
  engine.init();
  // 写入 3 个 EXECUTED + 2 个 ERROR
  const evidencePath = engine.getEvidenceFilePath();
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
  assert.strictEqual(engine.state.completedItems, 3);
  });

  it("TC-2-05: all EXECUTED → phase=verification", () => {
  engine.init();
  const evidencePath = engine.getEvidenceFilePath();
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

  it("TC-2-06: verification_round.completed → phase=gate_check", () => {
  engine.init();
  const evidencePath = engine.getEvidenceFilePath();
  const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
  evidence.state.totalItems = 5;
  evidence.state.completedItems = 5;
  evidence.state.currentRound = 1;
  evidence.state.phase = "verification";
  evidence.verification_round.completed = true;
  evidence.verification_round.items = [
    { item_id: "case-1", status: "EXECUTED", evidence: {} },
    { item_id: "case-2", status: "EXECUTED", evidence: {} },
    { item_id: "case-3", status: "EXECUTED", evidence: {} },
    { item_id: "case-4", status: "EXECUTED", evidence: {} },
    { item_id: "case-5", status: "EXECUTED", evidence: {} }
  ];
  writeFileSync(evidencePath, JSON.stringify(evidence));
  engine.onRoundComplete();
  assert.strictEqual(engine.state.phase, "gate_check");
  });

  it("TC-2-07: maxRounds reached but incomplete → failed", () => {
  const limitedConfig = { ...TEST_CONFIG, maxRounds: 2 };
  const eng = new LoopEngine(limitedConfig, tmpDir, "test-topic");
  eng.init();
  const evidencePath = eng.getEvidenceFilePath();
  // 模拟 2 轮完成但 case-3 仍 ERROR
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
  const prompt = engine.getPrompt();
  assert.ok(prompt.includes("Test Loop"));
  assert.ok(prompt.includes("1")); // currentRound
  });

  it("TC-2-09: getIncompleteItems() filters correctly (2/5 EXECUTED)", () => {
  engine.init();
  const evidencePath = engine.getEvidenceFilePath();
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
  engine.onRoundComplete();
  const incomplete = engine.getIncompleteItems();
  assert.strictEqual(incomplete.length, 3);
  });

  it("TC-2-10: Verification round returns all items", () => {
  engine.init();
  const evidencePath = engine.getEvidenceFilePath();
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
  const allItems = engine.getIncompleteItems();
  assert.strictEqual(allItems.length, 5); // VR returns ALL items
  });

  it("TC-2-11: Evidence JSON appends rounds", () => {
  engine.init();
  const evidencePath = engine.getEvidenceFilePath();
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
  // Verify 2 rounds
  const final = JSON.parse(readFileSync(evidencePath, "utf-8"));
  assert.strictEqual(final.rounds.length, 2);
  });
});
