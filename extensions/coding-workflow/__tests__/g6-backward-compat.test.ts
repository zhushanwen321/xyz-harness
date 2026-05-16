import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StateManager } from "../state-manager.js";

describe("G6: Backward compatibility", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "compat-test-")); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it("TC-6-01: legacy 16-stage state JSON loads", () => {
  const legacyState = {
    version: 1, requirement: "old req", topicDir: "old-topic",
    projectRoot: tmpDir, currentPhase: 2, currentStage: 13,
    completed: false, startedAt: "2026-01-01T00:00:00Z",
    stages: Array.from({ length: 16 }, (_, i) => ({
    number: i + 1, name: `Stage ${i+1}`, status: i < 12 ? "pass" as const : "pending" as const,
    startedAt: null, completedAt: null, gateResult: null, gateOutput: null, tasks: []
    })),
    rollbackHistory: []
  };
  const sm = new StateManager(join(".xyz-harness", "workflow-state.json"));
  const stateDir = join(tmpDir, ".xyz-harness");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "workflow-state.json"), JSON.stringify(legacyState));

  const loaded = sm.load(tmpDir);
  assert.ok(loaded);
  assert.strictEqual(loaded!.stages.length, 16);
  });

  it("TC-6-02: legacy state detected as legacy mode", () => {
  const legacyState = {
    version: 1, requirement: "", topicDir: "", projectRoot: tmpDir,
    currentPhase: 2, currentStage: 9, completed: false, startedAt: "",
    stages: Array.from({ length: 16 }, (_, i) => ({
    number: i + 1, name: `S${i+1}`, status: "pending" as const,
    startedAt: null, completedAt: null, gateResult: null, gateOutput: null, tasks: []
    })),
    rollbackHistory: []
  };
  const sm = new StateManager(join(".xyz-harness", "workflow-state.json"));
  const stateDir = join(tmpDir, ".xyz-harness");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "workflow-state.json"), JSON.stringify(legacyState));

  const loaded = sm.load(tmpDir);
  assert.ok(loaded);
  // T11: legacy detection
  assert.strictEqual((loaded as any)._legacy, true, "Expected _legacy flag on 16-stage state");
  });

  it("TC-6-03: legacy state Stage 13 uses old gate_12 logic", () => {
  // T11: 旧 state 推进到旧 Stage 13（E2E）时仍用旧 gate_12
  assert.fail("TC-6-03: needs T11 implementation for legacy gate dispatch");
  });
});
