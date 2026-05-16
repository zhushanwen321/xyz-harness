// TDD RED — State Manager Loop support (implementation not yet exists)
import { describe, it } from "node:test";
import assert from "node:assert";

describe("G5: StateManager Loop support", () => {
  it("TC-5-01: save/load LoopState round-trip", async () => {
  // const state = { ... };
  // stateMgr.save(state, cwd);
  // const loaded = stateMgr.load(cwd);
  // assert.deepStrictEqual(loaded.loopState, state.loopState);
  });

  it("TC-5-02: old state JSON without loopState does not throw", async () => {
  // load legacy JSON → no exception → loopState is undefined
  });

  it("TC-5-03: advanceTo Phase 3 → Phase 4", async () => {
  // stateMgr.advanceTo(state, 13, 14, 4, "summary");
  // assert.strictEqual(state.currentStage, 14);
  // assert.strictEqual(state.currentPhase, 4);
  });

  it("TC-5-04: rollback Phase 3 → Phase 2", async () => {
  // stateMgr.rollback(state, 10);
  // assert.strictEqual(state.currentStage, 10);
  });

  it("TC-5-05: startStage creates Phase 3 stage record", async () => {
  // stateMgr.startStage(state, 13, 3);
  // const s13 = state.stages.find(s => s.number === 13);
  // assert.strictEqual(s13?.status, "active");
  });
});
