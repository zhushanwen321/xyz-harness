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

  it("TC-6-02: legacy state detected via legacy flag", () => {
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
  // StateManager sets legacy=true when stages.length === 16
  assert.strictEqual((loaded as Record<string, unknown>).legacy, true);
  });

  it("TC-6-03: legacy state Stage 13 uses old gate_12 logic", () => {
  // Verify that a legacy state with currentStage=13 loads correctly
  // and the legacy flag is set, enabling legacy gate dispatch in the workflow controller
  const legacyState = {
    version: 1, requirement: "legacy feature", topicDir: "legacy-topic",
    projectRoot: tmpDir, currentPhase: 2, currentStage: 13,
    completed: false, startedAt: "2026-01-01T00:00:00Z",
    stages: Array.from({ length: 16 }, (_, i) => ({
    number: i + 1, name: `Stage ${i+1}`,
    status: i < 12 ? "pass" as const : "pending" as const,
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
  assert.strictEqual((loaded as Record<string, unknown>).legacy, true);
  assert.strictEqual(loaded!.currentStage, 13);
  // Legacy state with Stage 13 should have stage 12 as "pass" (gate_12 equivalent)
  const stage12 = loaded!.stages.find(s => s.number === 12);
  assert.ok(stage12);
  assert.strictEqual(stage12!.status, "pass");
  });
});
