import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  loadState,
  saveState,
  advanceStage,
  restartLoop,
  advancePhase,
  markRetrospectDone,
  isV4State,
} from "../state-manager.js";
import { getPhaseConfig, getStageList, isLastStage } from "../stages.js";
import { createInitialState } from "../types.js";
import type { WorkflowState } from "../types.js";

let tmpDir: string;
let projectRoot: string;
let topicDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-test-"));
  projectRoot = tmpDir;
  topicDir = path.join(tmpDir, ".xyz-harness", "2026-05-16-test");
  fs.mkdirSync(path.join(tmpDir, ".xyz-harness", "gate"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function cleanState(): WorkflowState {
  return createInitialState(topicDir);
}

describe("Phase Loop — Stage Advancement", () => {
  it("should advance through stages in order", () => {
    const state = cleanState();
    assert.equal(state.loop.currentStageIndex, 0);
    assert.equal(state.loop.loopCount, 0);

    // Phase 1 has 3 stages: brainstorming, write spec, review spec
    const r1 = advanceStage(state, projectRoot);
    assert.equal(r1.state.loop.currentStageIndex, 1);
    assert.equal(r1.shouldCheckGate, false);

    const r2 = advanceStage(state, projectRoot);
    assert.equal(r2.state.loop.currentStageIndex, 2);
    assert.equal(r2.shouldCheckGate, false);

    // At last stage, advanceStage signals gate check without advancing further
    const r3 = advanceStage(state, projectRoot);
    assert.equal(r3.state.loop.currentStageIndex, 2);
    assert.equal(r3.shouldCheckGate, true);
  });

  it("should detect last stage correctly", () => {
    assert.equal(isLastStage(1, 0, 0), false); // brainstorming
    assert.equal(isLastStage(1, 1, 0), false); // write spec
    assert.equal(isLastStage(1, 2, 0), true);  // review spec
  });

  it("should skip runOnce stages after first loop", () => {
    const stages0 = getStageList(1, 0);
    assert.equal(stages0.length, 3);
    assert.equal(stages0[0].name, "brainstorming");

    const stages1 = getStageList(1, 1);
    assert.equal(stages1.length, 2);
    assert.equal(stages1[0].name, "写 spec");
    assert.equal(stages1[1].name, "review spec");
  });

  it("should restart loop on gate failure", () => {
    const state = cleanState();
    state.loop.currentStageIndex = 2;
    state.loop.loopCount = 0;

    const restarted = restartLoop(state, projectRoot);
    assert.equal(restarted.loop.loopCount, 1);
    assert.equal(restarted.loop.currentStageIndex, 1); // back to loopStartIndex=1
  });

  it("should advance phase and reset loop on completion", () => {
    const state = cleanState();
    markRetrospectDone(state, projectRoot);
    assert.equal(state.retrospectDone, true);

    const next = advancePhase(state, projectRoot);
    assert.notEqual(next, null);
    assert.equal(next!.currentPhase, 2);
    assert.equal(next!.loop.loopCount, 0);
    assert.equal(next!.loop.currentStageIndex, 0);
    assert.equal(next!.retrospectDone, false);
  });

  it("should complete workflow after Phase 5", () => {
    const state = cleanState();
    state.currentPhase = 5;
    state.retrospectDone = true;

    const next = advancePhase(state, projectRoot);
    assert.equal(next, null);
    assert.equal(state.completed, true);
  });

  it("should detect V4 state format", () => {
    const v4Path = path.join(tmpDir, ".xyz-harness", "gate", "workflow-state.json");
    fs.writeFileSync(
      v4Path,
      JSON.stringify({ currentPhase: 2, stages: [{ number: 1, status: "pass" }] })
    );
    assert.equal(isV4State(projectRoot), true);
  });

  it("should reject V4 state in loadState", () => {
    const v4Path = path.join(tmpDir, ".xyz-harness", "gate", "workflow-state.json");
    fs.writeFileSync(
      v4Path,
      JSON.stringify({ currentPhase: 2, stages: [{ number: 1, status: "pass" }] })
    );
    const loaded = loadState(projectRoot);
    assert.equal(loaded, null);
  });
});
