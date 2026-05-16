// TDD GREEN — State Manager + Loop Engine interaction
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StateManager } from "../state-manager.js";
import { LoopEngine } from "../loop-engine.js";
import { E2E_LOOP_CONFIG } from "../stages.js";
import type { WorkflowState } from "../types.js";

function createTestState(tmpDir: string): WorkflowState {
  return {
  version: 1, requirement: "test", topicDir: "2026-05-16-test",
  projectRoot: tmpDir, currentPhase: 2, currentStage: 12,
  completed: false, startedAt: new Date().toISOString(),
  stages: Array.from({ length: 15 }, (_, i) => ({
    number: i + 1, name: `Stage ${i + 1}`, status: "pending" as const,
    startedAt: null, completedAt: null, gateResult: null, gateOutput: null, tasks: []
  })),
  rollbackHistory: [],
  };
}

describe("G5: State Manager + Loop Engine", () => {
  let tmpDir: string;
  let sm: StateManager;

  beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sm-test-"));
  sm = new StateManager(join(".xyz-harness", "workflow-state.json"));
  const state = createTestState(tmpDir);
  const stateDir = join(tmpDir, ".xyz-harness");
  mkdirSync(stateDir, { recursive: true });
  sm.save(state, tmpDir);
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it("TC-5-01: save/load loopState round-trip", () => {
  const state = sm.load(tmpDir)!;
  state.loopState = {
    round: 2, maxRounds: 5, items: [],
    verificationRoundCompleted: false, phase: "in_round",
  };
  sm.save(state, tmpDir);
  const loaded = sm.load(tmpDir)!;
  assert.deepStrictEqual(loaded.loopState, state.loopState);
  });

  it("TC-5-02: old state without loopState loads fine", () => {
  const state = sm.load(tmpDir)!;
  assert.strictEqual(state.loopState, undefined);
  });

  it("TC-5-03: advanceTo Phase 3→4", () => {
  const state = sm.load(tmpDir)!;
  state.currentPhase = 3;
  state.currentStage = 13;
  sm.advanceTo(state, 13, 14, 4, "Loop complete");
  assert.strictEqual(state.currentStage, 14);
  assert.strictEqual(state.currentPhase, 4);
  });

  it("TC-5-04: rollback Phase 3→2", () => {
  const state = sm.load(tmpDir)!;
  state.currentPhase = 3;
  state.currentStage = 13;
  sm.rollback(state, 10, 2, "health check failed");
  assert.strictEqual(state.currentStage, 10);
  assert.strictEqual(state.currentPhase, 2);
  });

  it("TC-5-05: startStage creates Phase 3 stage record", () => {
  const state = sm.load(tmpDir)!;
  sm.startStage(state, 13, 3, "集成健康检查");
  const s13 = state.stages.find(s => s.number === 13);
  assert.ok(s13);
  assert.strictEqual(s13!.status, "active");
  });

  it("TC-5-06: LoopEngine init creates evidence file", () => {
  const engine = new LoopEngine(E2E_LOOP_CONFIG, tmpDir, "2026-05-16-test");
  engine.init();
  const evidencePath = engine.getEvidenceFilePath();
  const absPath = join(tmpDir, evidencePath);
  assert.ok(existsSync(absPath), `Evidence file should exist at ${absPath}`);
  const content = JSON.parse(readFileSync(absPath, "utf8"));
  assert.deepStrictEqual(content.rounds, []);
  });

  it("TC-5-07: LoopEngine state round-trip", () => {
  const engine = new LoopEngine(E2E_LOOP_CONFIG, tmpDir, "2026-05-16-test");
  engine.init();
  engine.startRound();
  assert.strictEqual(engine.state.phase, "in_round");
  assert.strictEqual(engine.state.round, 1);
  });
});
