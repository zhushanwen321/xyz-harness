// Workflow Controller Extension — 类型定义

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ── Workflow State ────────────────────────────────────────────

export interface WorkflowState {
  version: number;
  requirement: string;
  topicDir: string;
  projectRoot: string;
  currentPhase: 1 | 2 | 3 | 4;
  currentStage: number;
  completed: boolean;       // workflow 全部完成标记
  startedAt: string;
  stages: StageState[];
  rollbackHistory: RollbackRecord[];
  loopState?: LoopState;    // Phase 3 Loop 状态（可选，向后兼容）
  legacy?: boolean;         // 旧格式 state 标记
}

export interface StageState {
  number: number;
  name: string;
  status: "pending" | "active" | "pass" | "fail";
  startedAt: string | null;
  completedAt: string | null;
  gateResult: "pass" | "fail" | null;
  gateOutput: string | null;
  tasks: TaskState[];
}

export interface TaskState {
  id: string;
  name: string;
  status: "pending" | "active" | "pass";
  completedAt: string | null;
  summary: string | null;
}

export interface RollbackRecord {
  from: number;
  to: number;
  reason: string;
  timestamp: string;
}

// ── Workflow Stage Definition ─────────────────────────────────

export interface StageDefinition {
  number: number;
  name: string;
  phase: 1 | 2 | 3 | 4;
  type: "interactive" | "automated";
  gateScript?: string;          // L1 gate-script.sh stage number (e.g. "03")
  gateScripts?: string[];       // Multiple gates (e.g. ["07", "08", "09"])
  requiresConfirmation: boolean;
  prompt: string;               // Injected into system prompt for this stage
  allowedTools?: string[];      // If set, restrict tools via setActiveTools
  deliverables: DeliverableCheck[]; // Stage 推进时必须验证的交付物
}

export interface DeliverableCheck {
  path: string;                 // 相对于 projectRoot，支持 {topicDir} 占位符和 * 通配符
  label: string;                // 人类可读名称，如 "spec.md"
  required: boolean;            // true = 不存在则阻止推进
  contentChecks?: ContentCheck[];
}

export type ContentCheck =
  | { type: "must_not_match"; pattern: string; message: string }
  | { type: "yaml_verdict"; message: string };

// ── Loop Types (Phase 3) ──────────────────────────────────────

export interface LoopConfig {
  name: string;
  itemSource: string;           // "plan_tasks" or future sources
  itemIdField: string;          // e.g. "case_id"
  allowedStatuses: string[];    // e.g. ["EXECUTED", "ERROR"]
  completedStatus: string;      // e.g. "EXECUTED"
  maxRounds: number;
  batchSize: number;
  requireVerificationRound: boolean;
  evidenceFile: string;         // relative path, may contain {topicDir}
  roundPrompt: string;          // template identifier
  gateScript: string;           // gate script identifier
  gateChecks: GateCheck[];
  confirmationRequired: boolean;
}

export interface GateCheck {
  name: string;                 // predefined check name or custom
  type: "L1" | "L2";
}

export interface LoopState {
  round: number;
  maxRounds: number;
  items: LoopItem[];
  verificationRoundCompleted: boolean;
  phase: "initializing" | "in_round" | "verification" | "gate_check" | "done" | "failed";
}

export interface LoopItem {
  item_id: string;
  plan_ref: string;
  completed: boolean;
  firstCompletedRound: number | null;
}

// ── Evidence JSON 结构 (Phase 3) ───────────────────────────────

export interface EvidenceRound {
  round: number;
  startedAt: string;
  items: EvidenceItemRecord[];
}

export interface EvidenceItemRecord {
  item_id: string;
  status: string;
  plan_ref: string;
  output_path: string;
  executed_at: string;
  evidence?: {
  cdp_commands?: string[];
  screenshots?: string[];
  error?: string | null;
  fix_commit?: string | null;
  };
}

export interface EvidenceState {
  totalItems: number;
  completedItems: number;
  currentRound: number;
  maxRounds: number;
  phase: string;
  verificationRoundCompleted: boolean;
}

export interface EvidenceVerificationRound {
  completed: boolean;
  startedAt: string | null;
  items: EvidenceItemRecord[];
}

export interface EvidenceFile {
  loop: string;
  state: EvidenceState;
  rounds: EvidenceRound[];
  verification_round: EvidenceVerificationRound;
}

// ── Tool Parameters ───────────────────────────────────────────

export interface StageCompleteParams {
  summary: string;
}

export interface LoopRoundCompleteParams {
  // No params — engine reads evidence JSON from disk
}

export interface LoopExitParams {
  reason: string;
}

export interface RegisterTasksParams {
  tasks: Array<{ id: string; name: string }>;
}

export interface TaskCompleteParams {
  taskId: string;
  summary: string;
}

export interface RollbackParams {
  targetStage: number;
  reason: string;
}
