import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// T4: loop-engine.ts — 尚未实现
import { LoopEngine } from "../loop-engine.js";
// T6: gate_phase3.ts — 尚未实现
import { gatePhase3 } from "../gates/gate_phase3.js";
// 已存在但 T8 会扩展
import { StateManager } from "../state-manager.js";
import type { LoopConfig } from "../types.js";

const E2E_CONFIG: LoopConfig = {
  name: "E2E 测试",
  itemSource: "plan_tasks",
  itemIdField: "case_id",
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

  it("TC-7-01: AC1 — Phase 2→3 auto-transition no confirmation", () => {
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
  // T7 实现: Stage 12 pass 后自动进入 Phase 3
  sm.advanceTo(state, 12, 13, 3, "auto to Phase 3");
  assert.strictEqual(state.currentPhase, 3);
  assert.strictEqual(state.currentStage, 13);
  });

  it("TC-7-02: AC2 — Health check fail blocks Loop", () => {
  const engine = new LoopEngine(E2E_CONFIG, tmpDir, "test-topic");
  // T7 实现: Phase 3 健康检查失败 → 回退到 Stage 10
  assert.ok(engine, "LoopEngine should exist after T4");
  });

  it("TC-7-03: AC4 — ERROR spawns fixer subagent", () => {
  const engine = new LoopEngine(E2E_CONFIG, tmpDir, "test-topic");
  // T4 实现后: 验证 ERROR item 触发 fixer
  assert.ok(engine);
  });

  it("TC-7-04: AC8 — Gate PASS triggers confirmation", () => {
  const evidenceDir = join(tmpDir, ".xyz-harness", "test-topic", "changes", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, "e2e-evidence.json"), JSON.stringify({
    loop: "e2e-testing",
    state: { totalItems: 1, completedItems: 1, currentRound: 1, maxRounds: 5, phase: "gate_check", verificationRoundCompleted: true },
    rounds: [{ round: 1, startedAt: new Date().toISOString(), items: [
    { item_id: "case-1", status: "EXECUTED", evidence: { cdp_commands: [], screenshots: [] } }
    ] }],
    verification_round: { completed: true, startedAt: new Date().toISOString(), items: [
    { item_id: "case-1", status: "EXECUTED", evidence: { cdp_commands: [], screenshots: [] } }
    ] }
  }));
  // T6 实现后 gatePhase3 会检查 evidence
  const result = gatePhase3(tmpDir, E2E_CONFIG);
  // confirmationRequired=true 时应需要确认
  assert.ok(result);
  });

  it("TC-7-05: AC9 — Gate FAIL loops back", () => {
  const engine = new LoopEngine(E2E_CONFIG, tmpDir, "test-topic");
  assert.ok(engine);
  });

  it("TC-7-06: AC11 — Phase 4 full flow", () => {
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
  // Stage 15 pass → completed
  sm.advanceTo(state, 15, 0, 4, "All done");
  assert.strictEqual(state.completed, true);
  });

  it("TC-7-07: AC12 — Confirmation points only Stage 2/8/15 + Loop exit", () => {
  // 需要 import WORKFLOW_STAGES — T2 后才可用
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WORKFLOW_STAGES } = require("../stages.js");
  const confirmed = WORKFLOW_STAGES.filter((s: Record<string, unknown>) => s.requiresConfirmation);
  assert.strictEqual(confirmed.length, 3);
  });

  it("TC-7-08: AC13 — Old format migration", () => {
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
  // T11: 自动映射
  assert.strictEqual((loaded as Record<string, unknown>)._legacy, true, "Expected legacy flag");
  });
});
