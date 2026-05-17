import * as fs from "node:fs";
import * as path from "node:path";
import type { WorkflowState, PhaseId } from "./types.js";
import { getPhaseConfig, getStageList } from "./stages.js";

const STATE_FILENAME = "workflow-state.json";

function statePath(projectRoot: string): string {
  return path.join(projectRoot, ".xyz-harness", "gate", STATE_FILENAME);
}

function ensureGateDir(projectRoot: string): void {
  const dir = path.join(projectRoot, ".xyz-harness", "gate");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadState(projectRoot: string): WorkflowState | null {
  const p = statePath(projectRoot);
  if (!fs.existsSync(p)) return null;

  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as WorkflowState;

    // AC12: detect V4 format (has stages array, no loop field)
    if ("stages" in parsed && !("loop" in parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: WorkflowState, projectRoot: string): void {
  ensureGateDir(projectRoot);
  fs.writeFileSync(statePath(projectRoot), JSON.stringify(state, null, 2), "utf-8");
}

export function isV4State(projectRoot: string): boolean {
  const p = statePath(projectRoot);
  if (!fs.existsSync(p)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return "stages" in raw && typeof raw.stages === "object" && !("loop" in raw);
  } catch {
    return false;
  }
}

export function advanceStage(
  state: WorkflowState,
  projectRoot: string,
): { shouldCheckGate: boolean; state: WorkflowState } {
  const stages = getStageList(state.currentPhase, state.loop.loopCount);
  const isLast = state.loop.currentStageIndex >= stages.length - 1;

  if (isLast) {
    return { shouldCheckGate: true, state };
  }

  state.loop.currentStageIndex++;
  saveState(state, projectRoot);
  return { shouldCheckGate: false, state };
}

export function restartLoop(state: WorkflowState, projectRoot: string): WorkflowState {
  const phase = getPhaseConfig(state.currentPhase);
  state.loop.loopCount++;
  state.loop.currentStageIndex = phase.loopStartIndex;
  saveState(state, projectRoot);
  return state;
}

export function advancePhase(state: WorkflowState, projectRoot: string): WorkflowState | null {
  if (state.currentPhase >= 5) {
    state.completed = true;
    saveState(state, projectRoot);
    return null; // Workflow complete
  }

  const nextPhase = (state.currentPhase + 1) as PhaseId;
  state.currentPhase = nextPhase;
  state.loop = { phaseNumber: nextPhase, loopCount: 0, currentStageIndex: 0 };
  state.phaseStartEntryId = null;
  state.retrospectDone = false;
  saveState(state, projectRoot);
  return state;
}

export function markRetrospectDone(state: WorkflowState, projectRoot: string): void {
  state.retrospectDone = true;
  saveState(state, projectRoot);
}

export function setPhaseStartEntry(state: WorkflowState, entryId: string, projectRoot: string): void {
  state.phaseStartEntryId = entryId;
  saveState(state, projectRoot);
}

export function setPlanComplexity(state: WorkflowState, complexity: "L1" | "L2", projectRoot: string): void {
  state.planComplexity = complexity;
  saveState(state, projectRoot);
}
