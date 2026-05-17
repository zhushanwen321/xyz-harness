// ============================================================================
// Harness V5: Core Type Definitions
// ============================================================================

/** Phase identifier */
export type PhaseId = 1 | 2 | 3 | 4 | 5;

export const PHASE_COUNT = 5;

/** Phase display names */
export const PHASE_NAMES: Record<PhaseId, string> = {
  1: "spec",
  2: "plan",
  3: "dev",
  4: "test",
  5: "pr",
};

/** Stage definition within a phase */
export interface StageConfig {
  name: string;
  description: string;
  /** Execute only on first loop iteration */
  runOnce: boolean;
}

/** L1 gate check result */
export interface GateL1Result {
  passed: boolean;
  errors: string[];
}

/** L2 gate check result from LLM subagent */
export interface GateL2Result {
  passed: boolean;
  error?: string;
  /** Raw response from LLM for debugging */
  raw?: string;
}

/** Combined gate result */
export interface GateResult {
  l1: GateL1Result;
  l2?: GateL2Result;
  passed: boolean;
}

/** Loop state for a single phase */
export interface LoopState {
  phaseNumber: PhaseId;
  loopCount: number;
  currentStageIndex: number;
}

/** Overall workflow state persisted to disk */
export interface WorkflowState {
  /** Current phase (1-5) */
  currentPhase: PhaseId;
  /** Loop state for current phase */
  loop: LoopState;
  /** Topic directory path (e.g. .xyz-harness/2026-05-16-topic) */
  topicDir: string;
  /** Entry ID when current phase started (for tree navigation) */
  phaseStartEntryId: string | null;
  /** Whether retrospect for current phase has been completed */
  retrospectDone: boolean;
  /** Plan complexity level (set during Phase 2) */
  planComplexity?: "L1" | "L2";
  /** Overall workflow completed flag */
  completed: boolean;
}

/** Default workflow state for Phase 1 start */
export function createInitialState(topicDir: string): WorkflowState {
  return {
    currentPhase: 1,
    loop: { phaseNumber: 1, loopCount: 0, currentStageIndex: 0 },
    topicDir,
    phaseStartEntryId: null,
    retrospectDone: false,
    completed: false,
  };
}

/** Phase transition state (stored temporarily for retrospect flow) */
export interface PhaseTransitionState {
  phaseId: PhaseId;
  gateResult: GateResult;
  retrospectPath: string;
  nextPhase: PhaseId;
}
