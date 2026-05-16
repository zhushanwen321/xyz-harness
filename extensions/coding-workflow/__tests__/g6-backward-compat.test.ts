// TDD RED — Backward compatibility (implementation not yet exists)
import { describe, it } from "node:test";
import assert from "node:assert";

describe("G6: Backward compatibility", () => {
  it("TC-6-01: old 16-stage state JSON loads without error", async () => {
  // const state = stateMgr.load(legacyJson);
  // assert.ok(state !== null);
  });

  it("TC-6-02: old state detected as legacy mode", async () => {
  // const state = stateMgr.load(legacyJson);
  // assert.strictEqual(state.stages.length, 16);
  // assert.strictEqual(state.currentPhase, 2);
  });

  it("TC-6-03: legacy state advances to old E2E stage", async () => {
  // Mock advance to Stage 13 → still uses gate_12
  });
});
