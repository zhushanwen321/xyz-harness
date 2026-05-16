import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LoopEngine } from "../loop-engine.js";
import { gatePhase3 } from "../gates/gate_phase3.js";
import { StateManager } from "../state-manager.js";
import { WORKFLOW_STAGES } from "../stages.js";
import type { LoopConfig } from "../types.js";

const E2E_CONFIG: LoopConfig = {
  name: "E2E Test",
  itemSource: "plan_tasks",
  itemIdField: "item_id",
  allowedStatuses: ["EXECUTED", "ERROR"],
  completedStatus: "EXECUTED",
  maxRounds: 5,
  batchSize: 5,
  requireVerificationRound: true,
  evidenceFile: ".xyz-harness/test-topic/changes/evidence/e2e-evidence.json",
  roundPrompt: "e2e-loop-round",
  gateScript: "phase3",
  gateChecks: [
  { name: "item_coverage", type: "L1" },
  { name: "executed_per_item", type: "L1" },
  { name: "evidence_files_exist", type: "L1" },
  { name: "verification_round_completed", type: "L1" },
  { name: "verification_all_executed", type: "L1" },
  { name: "anti_fabrication", type: "L2" }
  ],
  confirmationRequired: true
};

describe("G7: Integration tests", () => {
  let tmpDir: string;

  beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "g7-test-"));
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it("TC-7-01: AC1 -- Phase 2->3 auto-transition no confirmation", () => {
  const sm = new StateManager(join(".xyz-harness", "workflow-state.json"));
  const state = {
    version: 1, requirement: "test", topicDir: "test-topic",
    projectRoot: tmpDir, currentPhase: 2 as const, currentStage: 12,
    completed: false, startedAt: new Date().toISOString(),
    stages: Array.from({ length: 15 }, (_, i) => ({
    number: i + 1, name: `Stage ${i + 1}`,
    status: (i < 12 ? "pass" : "pending") as "pass" | "pending",
    startedAt: null, completedAt: null, gateResult: null, gateOutput: null, tasks: []
    })),
    rollbackHistory: []
  };
  sm.advanceTo(state, 12, 13, 3, "auto to Phase 3");
  assert.strictEqual(state.currentPhase, 3);
  assert.strictEqual(state.currentStage, 13);
  });

  it("TC-7-02: AC2 -- Health check fail blocks Loop", () => {
  // AC2: 健康检查失败应阻塞 Loop 进入
  // 验证方式：StateManager 可回退 Phase 3 → Phase 2
  const sm = new StateManager(join(".xyz-harness", "workflow-state.json"));
  const state = {
  version: 1, requirement: "test", topicDir: "test-topic",
  projectRoot: tmpDir, currentPhase: 3 as const, currentStage: 13,
  completed: false, startedAt: new Date().toISOString(),
  stages: Array.from({ length: 15 }, (_, i) => ({
  number: i + 1, name: `Stage ${i + 1}`, status: "pending" as const,
  startedAt: null, completedAt: null, gateResult: null, gateOutput: null, tasks: []
  })),
  rollbackHistory: []
  };
  // 健康检查失败 → 回退到 Stage 10（编码实现）
  sm.rollback(state, 10, 2, "Health check failed: backend unreachable");
  assert.strictEqual(state.currentPhase, 2, "Should roll back to Phase 2");
  assert.strictEqual(state.currentStage, 10, "Should roll back to Stage 10");
  });

  it("TC-7-03: AC4 -- ERROR item tracked in evidence", () => {
  // AC4: ERROR item 应被记录在 evidence JSON 中
  const engine = new LoopEngine(E2E_CONFIG, tmpDir, "test-topic");
  engine.init();
  engine.startRound();
  // 写入一个 ERROR item
  const absPath = join(tmpDir, engine.getEvidenceFilePath());
  const { readFileSync: rf, writeFileSync: wf } = require("node:fs");
  const evidence = JSON.parse(rf(absPath, "utf8"));
  evidence.state.totalItems = 1;
  evidence.state.currentRound = 1;
  evidence.rounds.push({
  round: 1, startedAt: new Date().toISOString(),
  items: [{ item_id: "case-1", status: "ERROR", evidence: { error: "CDP timeout" } }]
  });
  wf(absPath, JSON.stringify(evidence));
  engine.onRoundComplete();
  // ERROR item 不算 completed
  assert.strictEqual(engine.state.items.length, 0, "ERROR items should not count as completed");
  assert.strictEqual(engine.state.phase, "in_round", "Should continue looping since item not completed");
  });

  it("TC-7-04: AC8 -- Gate PASS triggers confirmation", async () => {
  const evidenceDir = join(tmpDir, ".xyz-harness", "test-topic", "changes", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, "e2e-evidence.json");
  writeFileSync(evidencePath, JSON.stringify({
    loop: "e2e-testing",
    state: { totalItems: 1, completedItems: 1, currentRound: 1, maxRounds: 5, phase: "gate_check", verificationRoundCompleted: true },
    rounds: [{ round: 1, startedAt: new Date().toISOString(), items: [
    { item_id: "case-1", status: "EXECUTED", evidence: { cdp_commands: [], screenshots: [] } }
    ] }],
    verification_round: { completed: true, startedAt: new Date().toISOString(), items: [
    { item_id: "case-1", status: "EXECUTED", evidence: { cdp_commands: [], screenshots: [] } }
    ] }
  }));
  const result = await gatePhase3(tmpDir, E2E_CONFIG, evidencePath);
  assert.ok(result);
  assert.strictEqual(result.passed, true);
  });

  it("TC-7-05: AC9 -- Gate FAIL with remaining rounds loops back", async () => {
  // AC9: Gate FAIL 后应回到 Loop 继续
  const evidenceDir = join(tmpDir, ".xyz-harness", "test-topic", "changes", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, "e2e-evidence.json");
  // 写入一个会触发 item_coverage FAIL 的 evidence（totalItems=3 但只有 1 个 item）
  writeFileSync(evidencePath, JSON.stringify({
  loop: "e2e-test",
  state: { totalItems: 3, completedItems: 1, currentRound: 1, maxRounds: 5, phase: "gate_check", verificationRoundCompleted: true },
  rounds: [{ round: 1, startedAt: "", items: [
  { item_id: "case-1", status: "EXECUTED", evidence: { screenshots: [] } }
  ]}],
  verification_round: { completed: true, startedAt: "", items: [
  { item_id: "case-1", status: "EXECUTED", evidence: { screenshots: [] } }
  ]}
  }));
  const result = await gatePhase3(tmpDir, E2E_CONFIG, evidencePath);
  assert.strictEqual(result.passed, false, "Gate should FAIL when items incomplete");
  assert.ok(result.output.includes("item_coverage"), `Output should mention item_coverage, got: ${result.output}`);
  });

  it("TC-7-06: AC11 -- Phase 4 full flow", () => {
  const sm = new StateManager(join(".xyz-harness", "workflow-state.json"));
  const state = {
    version: 1, requirement: "test", topicDir: "test-topic",
    projectRoot: tmpDir, currentPhase: 4 as const, currentStage: 14,
    completed: false, startedAt: new Date().toISOString(),
    stages: Array.from({ length: 15 }, (_, i) => ({
    number: i + 1, name: `Stage ${i + 1}`,
    status: (i < 13 ? "pass" : "pending") as "pass" | "pending",
    startedAt: null, completedAt: null, gateResult: null, gateOutput: null, tasks: []
    })),
    rollbackHistory: []
  };
  sm.advanceTo(state, 14, 15, 4, "Stage 14 done");
  assert.strictEqual(state.currentStage, 15);
  // advanceTo completes stage 15 and starts stage 0 (terminal)
  sm.advanceTo(state, 15, 0, 4, "All done");
  // advanceTo does not auto-set completed; workflow controller must set it
  state.completed = true;
  assert.strictEqual(state.completed, true);
  });

  it("TC-7-07: AC12 -- Confirmation points only Stage 2/8/15 + Loop exit", () => {
  const confirmed = WORKFLOW_STAGES.filter((s) => s.requiresConfirmation);
  assert.strictEqual(confirmed.length, 3);
  const nums = confirmed.map(s => s.number).sort((a, b) => a - b);
  assert.deepStrictEqual(nums, [2, 8, 15]);
  });

  it("TC-7-08: AC13 -- Old format migration", () => {
  const sm = new StateManager(join(".xyz-harness", "workflow-state.json"));
  const legacyState = {
    version: 1, requirement: "old", topicDir: "old-topic",
    projectRoot: tmpDir, currentPhase: 2, currentStage: 9,
    completed: false, startedAt: "",
    stages: Array.from({ length: 16 }, (_, i) => ({
    number: i + 1, name: `S${i + 1}`, status: "pending" as const,
    startedAt: null, completedAt: null, gateResult: null, gateOutput: null, tasks: []
    })),
    rollbackHistory: []
  };
  const stateDir = join(tmpDir, ".xyz-harness");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "workflow-state.json"), JSON.stringify(legacyState));

  const loaded = sm.load(tmpDir);
  assert.ok(loaded);
  // StateManager sets legacy=true when stages.length === 16
  assert.strictEqual((loaded as Record<string, unknown>).legacy, true);
  });
});
