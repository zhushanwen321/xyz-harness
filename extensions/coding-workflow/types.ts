// Workflow Controller Extension — 类型定义

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ── Workflow State ────────────────────────────────────────────

export interface WorkflowState {
  version: number;
  requirement: string;
  topicDir: string;
  projectRoot: string;
  currentPhase: 1 | 2;
  currentStage: number;
  completed: boolean;       // workflow 全部完成标记
  startedAt: string;
  stages: StageState[];
  rollbackHistory: RollbackRecord[];
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
  phase: 1 | 2;
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

export interface ContentCheck {
  type: "must_not_match";
  pattern: string;              // RegExp 字符串
  message: string;              // 检查失败时的错误提示
}

// ── Tool Parameters ───────────────────────────────────────────

export interface StageCompleteParams {
  summary: string;
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
