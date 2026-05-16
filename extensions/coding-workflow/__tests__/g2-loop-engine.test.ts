// TDD RED — LoopEngine tests (implementation not yet exists)
// Top-level import of non-existent module → all tests FAIL at import time
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { existsSync, unlinkSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LoopEngine } from "../loop-engine.js";
import type { LoopConfig } from "../loop-engine.js";

// ── Test fixtures ──────────────────────────────────────────

const TEST_DIR = join(__dirname, "fixtures", "g2-temp");
const EVIDENCE_FILE = join(TEST_DIR, "evidence.json");

const BASE_CONFIG: LoopConfig = {
  name: "test-loop",
  itemSource: "tasks",
  itemIdField: "task_id",
  completedStatus: "EXECUTED",
  errorStatus: "ERROR",
  maxRounds: 5,
  promptTemplate: "Phase: {phaseName}, Round: {currentRound}/{maxRounds}, Items left: {remainingItems}",
  evidenceFile: join(TEST_DIR, "evidence.json"),
  verificationPrompt: "Verify all items",
  gateConfig: { gateType: "phase3" },
};

function makeConfig(overrides: Partial<LoopConfig> = {}): LoopConfig {
  return { ...BASE_CONFIG, ...overrides };
}

function cleanup() {
  if (existsSync(TEST_DIR)) {
  rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ── Tests ──────────────────────────────────────────────────

describe("G2: LoopEngine state machine", () => {
  before(() => {
  cleanup();
  mkdirSync(TEST_DIR, { recursive: true });
  });
  after(cleanup);

  it("TC-2-01: init() creates evidence JSON file", () => {
  const engine = new LoopEngine(makeConfig(), TEST_DIR, "test-topic");
  engine.init();
  assert.ok(existsSync(EVIDENCE_FILE), "evidence JSON file should exist after init()");

  const raw = readFileSync(EVIDENCE_FILE, "utf-8");
  const data = JSON.parse(raw);
  assert.strictEqual(data.loop, "test-loop", "evidence.loop should match config.name");
  assert.strictEqual(data.state.phase, "initializing", "initial phase should be 'initializing'");
  assert.strictEqual(data.state.totalItems, 0, "totalItems should be 0 before any items loaded");
  });

  it("TC-2-02: init() replaces {topicDir} in evidenceFile path", () => {
  const configWithPlaceholder = makeConfig({
    evidenceFile: join(TEST_DIR, "{topicDir}", "evidence.json"),
  });
  const engine = new LoopEngine(configWithPlaceholder, TEST_DIR, "my-topic");
  engine.init();

  // {topicDir} should be replaced with "my-topic"
  const resolved = engine.config.evidenceFile;
  assert.ok(!resolved.includes("{topicDir}"), "{topicDir} placeholder should be resolved");
  assert.ok(resolved.includes("my-topic"), "resolved path should contain the topic dir name");
  });

  it("TC-2-03: startRound() sets phase to in_round", () => {
  const engine = new LoopEngine(makeConfig(), TEST_DIR, "test-topic");
  engine.init();
  engine.startRound();

  assert.strictEqual(engine.state.phase, "in_round");
  assert.strictEqual(engine.state.currentRound, 1, "first round should be 1");
  });

  it("TC-2-04: onRoundComplete correctly counts completedItems (3/5 EXECUTED)", () => {
  const engine = new LoopEngine(makeConfig(), TEST_DIR, "test-topic");
  engine.init();
  engine.startRound();

  // Write a mock evidence file with 3 EXECUTED + 2 ERROR items
  const mockEvidence = {
    loop: "test-loop",
    state: { totalItems: 5, completedItems: 0, currentRound: 1, maxRounds: 5, phase: "in_round" },
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "EXECUTED", evidence: {} },
      { item_id: "t3", status: "ERROR", evidence: { error: "timeout" } },
      { item_id: "t4", status: "EXECUTED", evidence: {} },
      { item_id: "t5", status: "ERROR", evidence: { error: "crash" } },
    ],
    }],
  };
  writeFileSync(EVIDENCE_FILE, JSON.stringify(mockEvidence, null, 2), "utf-8");

  engine.onRoundComplete();

  assert.strictEqual(engine.state.completedItems, 3, "should count 3 EXECUTED items");
  assert.strictEqual(engine.state.currentRound, 1, "round should still be 1");
  });

  it("TC-2-05: all items EXECUTED transitions phase to verification", () => {
  const engine = new LoopEngine(makeConfig(), TEST_DIR, "test-topic");
  engine.init();
  engine.startRound();

  // All 3/3 items EXECUTED
  const mockEvidence = {
    loop: "test-loop",
    state: { totalItems: 3, completedItems: 0, currentRound: 1, maxRounds: 5, phase: "in_round" },
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "EXECUTED", evidence: {} },
      { item_id: "t3", status: "EXECUTED", evidence: {} },
    ],
    }],
  };
  writeFileSync(EVIDENCE_FILE, JSON.stringify(mockEvidence, null, 2), "utf-8");

  engine.onRoundComplete();

  assert.strictEqual(engine.state.completedItems, 3);
  assert.strictEqual(engine.state.phase, "verification", "phase should transition to 'verification' when all items complete");
  });

  it("TC-2-06: verification completed transitions phase to gate_check", () => {
  const engine = new LoopEngine(makeConfig(), TEST_DIR, "test-topic");
  engine.init();
  engine.state.phase = "verification";

  // Simulate verification round completion
  const mockEvidence = {
    loop: "test-loop",
    state: { totalItems: 3, completedItems: 3, currentRound: 1, maxRounds: 5, phase: "verification", verificationRoundCompleted: false },
    rounds: [{ round: 1, items: [
    { item_id: "t1", status: "EXECUTED", evidence: {} },
    { item_id: "t2", status: "EXECUTED", evidence: {} },
    { item_id: "t3", status: "EXECUTED", evidence: {} },
    ]}],
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
  writeFileSync(EVIDENCE_FILE, JSON.stringify(mockEvidence, null, 2), "utf-8");

  engine.onRoundComplete();

  assert.strictEqual(engine.state.phase, "gate_check", "phase should transition to 'gate_check' after verification round completes");
  });

  it("TC-2-07: maxRounds reached with incomplete items sets phase to failed", () => {
  const config = makeConfig({ maxRounds: 1 });
  const engine = new LoopEngine(config, TEST_DIR, "test-topic");
  engine.init();
  engine.startRound();

  // Round 1 with 1 ERROR item — and maxRounds=1
  const mockEvidence = {
    loop: "test-loop",
    state: { totalItems: 2, completedItems: 0, currentRound: 1, maxRounds: 1, phase: "in_round" },
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "ERROR", evidence: { error: "still broken" } },
    ],
    }],
  };
  writeFileSync(EVIDENCE_FILE, JSON.stringify(mockEvidence, null, 2), "utf-8");

  engine.onRoundComplete();

  assert.strictEqual(engine.state.phase, "failed", "phase should be 'failed' when maxRounds reached with incomplete items");
  });

  it("TC-2-08: getPrompt() replaces all template variables", () => {
  const engine = new LoopEngine(makeConfig(), TEST_DIR, "test-topic");
  engine.init();
  engine.state.phase = "in_round";
  engine.state.currentRound = 2;
  engine.state.maxRounds = 5;
  engine.state.totalItems = 10;
  engine.state.completedItems = 7;

  const prompt = engine.getPrompt();

  assert.ok(!prompt.includes("{phaseName}"), "{phaseName} should be replaced");
  assert.ok(!prompt.includes("{currentRound}"), "{currentRound} should be replaced");
  assert.ok(!prompt.includes("{maxRounds}"), "{maxRounds} should be replaced");
  assert.ok(!prompt.includes("{remainingItems}"), "{remainingItems} should be replaced");
  assert.ok(prompt.includes("in_round"), "prompt should contain the actual phase name");
  assert.ok(prompt.includes("3"), "prompt should contain remaining items count (10-7=3)");
  });

  it("TC-2-09: getIncompleteItems returns only non-completed items", () => {
  const engine = new LoopEngine(makeConfig(), TEST_DIR, "test-topic");
  engine.init();
  engine.state.phase = "in_round";

  const mockEvidence = {
    loop: "test-loop",
    state: { totalItems: 5, completedItems: 2, currentRound: 1, maxRounds: 5, phase: "in_round" },
    rounds: [{
    round: 1,
    items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "EXECUTED", evidence: {} },
      { item_id: "t3", status: "ERROR", evidence: { error: "fail" } },
      { item_id: "t4", status: "PENDING", evidence: {} },
      { item_id: "t5", status: "ERROR", evidence: { error: "fail" } },
    ],
    }],
  };
  writeFileSync(EVIDENCE_FILE, JSON.stringify(mockEvidence, null, 2), "utf-8");

  engine.onRoundComplete();
  const incomplete = engine.getIncompleteItems();

  assert.strictEqual(incomplete.length, 3, "should return 3 incomplete items (2 ERROR + 1 PENDING)");
  const ids = incomplete.map((item: { item_id: string }) => item.item_id);
  assert.ok(ids.includes("t3"), "t3 (ERROR) should be incomplete");
  assert.ok(ids.includes("t4"), "t4 (PENDING) should be incomplete");
  assert.ok(ids.includes("t5"), "t5 (ERROR) should be incomplete");
  });

  it("TC-2-10: verification mode returns ALL items (not just incomplete)", () => {
  const engine = new LoopEngine(makeConfig(), TEST_DIR, "test-topic");
  engine.init();
  engine.state.phase = "verification";

  const mockEvidence = {
    loop: "test-loop",
    state: { totalItems: 5, completedItems: 5, currentRound: 2, maxRounds: 5, phase: "verification" },
    rounds: [
    { round: 1, items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "EXECUTED", evidence: {} },
      { item_id: "t3", status: "EXECUTED", evidence: {} },
      { item_id: "t4", status: "EXECUTED", evidence: {} },
      { item_id: "t5", status: "EXECUTED", evidence: {} },
    ]},
    ],
  };
  writeFileSync(EVIDENCE_FILE, JSON.stringify(mockEvidence, null, 2), "utf-8");

  const items = engine.getIncompleteItems();
  assert.strictEqual(items.length, 5, "verification mode should return ALL items for re-verification");
  });

  it("TC-2-11: evidence file appends per round (does not overwrite)", () => {
  const engine = new LoopEngine(makeConfig(), TEST_DIR, "test-topic");
  engine.init();

  // Round 1
  engine.startRound();
  const round1Evidence = {
    loop: "test-loop",
    state: { totalItems: 2, completedItems: 0, currentRound: 1, maxRounds: 5, phase: "in_round" },
    rounds: [{ round: 1, items: [
    { item_id: "t1", status: "EXECUTED", evidence: {} },
    { item_id: "t2", status: "ERROR", evidence: { error: "fail" } },
    ]}],
  };
  writeFileSync(EVIDENCE_FILE, JSON.stringify(round1Evidence, null, 2), "utf-8");
  engine.onRoundComplete();

  // Round 2
  engine.startRound();
  const round2Evidence = {
    loop: "test-loop",
    state: { totalItems: 2, completedItems: 1, currentRound: 2, maxRounds: 5, phase: "in_round" },
    rounds: [
    { round: 1, items: [
      { item_id: "t1", status: "EXECUTED", evidence: {} },
      { item_id: "t2", status: "ERROR", evidence: { error: "fail" } },
    ]},
    { round: 2, items: [
      { item_id: "t2", status: "EXECUTED", evidence: {} },
    ]},
    ],
  };
  writeFileSync(EVIDENCE_FILE, JSON.stringify(round2Evidence, null, 2), "utf-8");
  engine.onRoundComplete();

  const raw = readFileSync(EVIDENCE_FILE, "utf-8");
  const data = JSON.parse(raw);
  assert.strictEqual(data.rounds.length, 2, "evidence should contain 2 rounds after 2 round trips");
  assert.strictEqual(data.rounds[0].round, 1, "first round entry should be round 1");
  assert.strictEqual(data.rounds[1].round, 2, "second round entry should be round 2");
  });
});
