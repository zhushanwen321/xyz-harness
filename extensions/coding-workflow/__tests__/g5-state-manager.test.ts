// TDD RED phase — ALL tests expected to FAIL until T8 (state-manager loop support) is implemented
// Current StateManager has NO loop-specific methods:
//   - No initLoopState method
//   - No advanceLoopRound method
//   - No getLoopItem method
//   - No updateLoopItemStatus method
//   - advanceTo/rollback do not create or manage loopState
//
// Strategy: test methods/behaviors that don't exist yet.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { StateManager } from "../state-manager.js";
import type { WorkflowState } from "../types.js";

describe("G5: StateManager Loop support", () => {
  let tempDir: string;
  let sm: StateManager;

  beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "g5-test-"));
  sm = new StateManager(join(".xyz-harness", "workflow-state.json"));
  });

  afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  });

  // ── initLoopState: method does not exist ──────────────

  it("TC-5-01: initLoopState creates loopState on WorkflowState", () => {
  const state = sm.create("test init loop", tempDir);
  const items = [
    { id: "task-1", name: "Implement auth" },
    { id: "task-2", name: "Write tests" },
  ];
  const loopConfig = {
    maxRounds: 5,
    batchSize: 2,
    completedStatus: "EXECUTED",
  };

  // initLoopState does not exist on StateManager → TypeError
  sm.initLoopState(state, items, loopConfig);

  const ls = (state as Record<string, unknown>).loopState;
  assert.ok(ls, "loopState should be created");
  const lsObj = ls as Record<string, unknown>;
  assert.strictEqual(lsObj.currentRound, 0);
  const lsItems = lsObj.items as Array<Record<string, unknown>>;
  assert.strictEqual(lsItems.length, 2);
  assert.strictEqual(lsItems[0].status, "pending");
  });

  // ── advanceLoopRound: method does not exist ───────────

  it("TC-5-02: advanceLoopRound increments round and resets in-progress items", () => {
  const state = sm.create("test advance round", tempDir);
  sm.startStage(state, 13, 3 as 1 | 2);

  const injected = {
    ...state,
    loopState: {
    items: [
      { id: "task-1", name: "Auth", status: "in_progress", rounds: 1 },
      { id: "task-2", name: "Tests", status: "pending", rounds: 0 },
    ],
    currentRound: 1,
    maxRounds: 5,
    completedIds: [] as string[],
    },
  } as WorkflowState;

  // advanceLoopRound does not exist → TypeError
  sm.advanceLoopRound(injected);

  const ls = (injected as Record<string, unknown>).loopState as Record<string, unknown>;
  assert.strictEqual(ls.currentRound, 2, "Round should increment to 2");
  const items = ls.items as Array<Record<string, unknown>>;
  const inProgress = items.filter(i => i.status === "in_progress");
  assert.strictEqual(inProgress.length, 0, "No items should remain in_progress");
  });

  // ── getLoopItem: method does not exist ────────────────

  it("TC-5-03: getLoopItem retrieves a single item by id", () => {
  const state = sm.create("test get item", tempDir);
  const injected = {
    ...state,
    loopState: {
    items: [
      { id: "task-1", name: "Auth", status: "completed", rounds: 2 },
      { id: "task-2", name: "Tests", status: "in_progress", rounds: 1 },
    ],
    currentRound: 2,
    maxRounds: 5,
    completedIds: ["task-1"],
    },
  } as WorkflowState;

  // getLoopItem does not exist → TypeError
  const item = sm.getLoopItem(injected, "task-2");
  assert.ok(item, "Should find task-2");
  assert.strictEqual(item.id, "task-2");
  assert.strictEqual(item.status, "in_progress");
  assert.strictEqual(item.rounds, 1);
  });

  // ── updateLoopItemStatus: method does not exist ───────

  it("TC-5-04: updateLoopItemStatus changes item status and tracks rounds", () => {
  const state = sm.create("test update item", tempDir);
  const injected = {
    ...state,
    loopState: {
    items: [
      { id: "task-1", name: "Auth", status: "in_progress", rounds: 1 },
    ],
    currentRound: 1,
    maxRounds: 5,
    completedIds: [] as string[],
    },
  } as WorkflowState;

  // updateLoopItemStatus does not exist → TypeError
  sm.updateLoopItemStatus(injected, "task-1", "completed", "All tests pass");

  const ls = (injected as Record<string, unknown>).loopState as Record<string, unknown>;
  const items = ls.items as Array<Record<string, unknown>>;
  assert.strictEqual(items[0].status, "completed");
  const completedIds = ls.completedIds as string[];
  assert.ok(completedIds.includes("task-1"), "task-1 should be in completedIds");
  });

  // ── advanceTo into Phase 3 auto-initializes loopState ──

  it("TC-5-05: advanceTo into Phase 3 auto-initializes loopState", () => {
  const state = sm.create("test auto init loop", tempDir);

  sm.startStage(state, 12, 2);
  sm.completeStage(state, 12, "done");

  // advanceTo stage 13 (Phase 3) should auto-init loopState
  sm.advanceTo(state, 12, 13, 3 as 1 | 2, "Entering Phase 3 loop");

  // Current advanceTo does NOT create loopState
  const ls = (state as Record<string, unknown>).loopState;
  assert.ok(ls, "loopState should be auto-initialized when entering Phase 3");
  const lsObj = ls as Record<string, unknown>;
  assert.strictEqual(lsObj.currentRound, 0, "Should start at round 0");
  assert.ok(Array.isArray(lsObj.items), "Should have items array");
  });

  // ── Rollback from Phase 3 resets loop item statuses ───

  it("TC-5-06: rollback from Phase 3 to Phase 2 resets loop items to pending", () => {
  const state = sm.create("test rollback loop reset", tempDir);

  sm.startStage(state, 10, 2);
  sm.completeStage(state, 10, "done");
  sm.startStage(state, 13, 3 as 1 | 2);

  const injected = {
    ...state,
    loopState: {
    items: [
      { id: "task-1", status: "completed", rounds: 2 },
      { id: "task-2", status: "in_progress", rounds: 1 },
    ],
    currentRound: 2,
    maxRounds: 5,
    completedIds: ["task-1"],
    },
  } as WorkflowState;

  sm.rollback(injected, 10, 2, "Loop failed, rollback to Phase 2");

  // Current rollback does NOT reset loopState items
  const ls = (injected as Record<string, unknown>).loopState as Record<string, unknown> | undefined;
  assert.ok(ls, "loopState should still exist after rollback");
  const items = ls.items as Array<Record<string, unknown>>;
  for (const item of items) {
    assert.strictEqual(
    item.status, "pending",
    `Item ${item.id} should be reset to pending after rollback, got ${item.status}`
    );
  }
  const completedIds = ls.completedIds as string[];
  assert.strictEqual(completedIds.length, 0, "completedIds should be cleared after rollback");
  });
});
