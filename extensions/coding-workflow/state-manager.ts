// Workflow Controller — State Manager
// 负责 workflow 状态的文件读写、阶段推进、回退、task 管理

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { WorkflowState, StageState, RollbackRecord } from "./types.js";

export class StateManager {
  constructor(private readonly stateFile: string) {}

  // ── 文件读写 ─────────────────────────────────────────

  load(projectRoot: string): WorkflowState | null {
  const path = join(projectRoot, this.stateFile);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as WorkflowState;
  } catch (err) {
    // 文件损坏：备份而非静默丢弃 (#1)
    const backupPath = path + ".bak." + Date.now();
    try {
    renameSync(path, backupPath);
    } catch {
    // rename 失败时继续抛出原始错误
    }
    throw new Error(
    `Workflow state file corrupted: ${path}. ` +
      `Backed up to ${backupPath}. Fix manually or start a new workflow. ` +
      `Parse error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  }

  save(state: WorkflowState, projectRoot: string): void {
  const path = join(projectRoot, this.stateFile);
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  // 原子写：先写临时文件再 rename (#2)
  const tmpPath = path + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf8");
  renameSync(tmpPath, path);
  }

  // ── 创建新 workflow ──────────────────────────────────

  create(requirement: string, projectRoot: string): WorkflowState {
  const now = new Date().toISOString();
  const topicDir = this.buildTopicDir(requirement, now);
  const state: WorkflowState = {
    version: 1,
    requirement,
    topicDir,
    projectRoot,
    currentPhase: 1,
  currentStage: 0,
  completed: false,
  startedAt: now,
    stages: [],
    rollbackHistory: [],
  };
  this.save(state, projectRoot);
  return state;
  }

  // ── 阶段操作 ─────────────────────────────────────────

  startStage(state: WorkflowState, stageNumber: number, phase: 1 | 2, stageName?: string): void {
  const now = new Date().toISOString();
  let stage = state.stages.find((s) => s.number === stageNumber);
  if (!stage) {
  stage = {
  number: stageNumber,
  name: stageName ?? "",
    status: "active",
    startedAt: now,
    completedAt: null,
    gateResult: null,
    gateOutput: null,
    tasks: [],
    };
    state.stages.push(stage);
  } else {
    stage.status = "active";
    stage.startedAt = now;
    stage.completedAt = null;
  }
  state.currentStage = stageNumber;
  state.currentPhase = phase; // (#13) 由调用方传入，不硬编码推算
  }

  completeStage(
  state: WorkflowState,
  stageNumber: number,
  _summary: string
  ): void {
  const stage = state.stages.find((s) => s.number === stageNumber);
  if (stage) {
    stage.status = "pass";
    stage.completedAt = new Date().toISOString();
    stage.gateResult = "pass";
  }
  }

  // 原子推进：complete current + start next 在同一次 save (#7)
  advanceTo(
  state: WorkflowState,
  completedStage: number,
  nextStage: number,
  nextPhase: 1 | 2,
  summary: string,
  nextStageName?: string
  ): void {
  this.completeStage(state, completedStage, summary);
  this.startStage(state, nextStage, nextPhase, nextStageName);
  }

  updateStage(
  state: WorkflowState,
  stageNumber: number,
  updates: Partial<Pick<StageState, "status" | "gateResult" | "gateOutput">>
  ): void {
  const stage = state.stages.find((s) => s.number === stageNumber);
  if (stage) {
    if (updates.status !== undefined) stage.status = updates.status;
    if (updates.gateResult !== undefined) stage.gateResult = updates.gateResult;
    if (updates.gateOutput !== undefined) stage.gateOutput = updates.gateOutput;
  }
  }

  // ── Task 操作 ────────────────────────────────────────

  registerTasks(
  state: WorkflowState,
  stageNumber: number,
  tasks: Array<{ id: string; name: string }>
  ): void {
  const stage = state.stages.find((s) => s.number === stageNumber);
  if (!stage) {
    throw new Error(
    `Cannot register tasks: stage ${stageNumber} not found. Start the stage first.`
    );
  }

  // 禁止覆盖已有已完成 task 的列表 (#4)
  const completedCount = stage.tasks.filter((t) => t.status === "pass").length;
  if (completedCount > 0) {
    throw new Error(
    `Cannot re-register tasks: stage ${stageNumber} already has ${completedCount} completed task(s). ` +
      `Register tasks only once at the start of a stage.`
    );
  }

  stage.tasks = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    status: "pending" as const,
    completedAt: null,
    summary: null,
  }));
  }

  completeTask(
  state: WorkflowState,
  stageNumber: number,
  taskId: string,
  summary: string
  ): void {
  const stage = state.stages.find((s) => s.number === stageNumber);
  if (!stage) {
    throw new Error(
    `Cannot complete task: stage ${stageNumber} not found.`
    );
  }

  const task = stage.tasks.find((t) => t.id === taskId);
  if (!task) {
    // (#3) 不存在的 taskId 必须报错
    const knownIds = stage.tasks.map((t) => t.id).join(", ");
    throw new Error(
    `Task "${taskId}" not found in stage ${stageNumber}. ` +
      `Known tasks: [${knownIds || "(none registered)"}]`
    );
  }

  task.status = "pass";
  task.completedAt = new Date().toISOString();
  task.summary = summary;
  }

  // ── 回退 ─────────────────────────────────────────────

  rollback(
  state: WorkflowState,
  targetStage: number,
  targetPhase: 1 | 2,
  reason: string
  ): void {
  state.rollbackHistory.push({
    from: state.currentStage,
    to: targetStage,
    reason,
    timestamp: new Date().toISOString(),
  });

  // 重置目标 stage 及之后所有 stage
  for (const stage of state.stages) {
    if (stage.number >= targetStage) {
    stage.status = "pending";
    stage.startedAt = null;
    stage.completedAt = null;
    stage.gateResult = null;
    stage.gateOutput = null;
    for (const task of stage.tasks) {
      task.status = "pending";
      task.completedAt = null;
      task.summary = null;
    }
    }
  }

  // (#12) startStage 确保目标 stage 有记录并设为 active
  this.startStage(state, targetStage, targetPhase, /* name from WORKFLOW_STAGES */ undefined);
  }

  // ── 工具方法 ─────────────────────────────────────────

  private buildTopicDir(requirement: string, isoDate: string): string {
  const date = isoDate.slice(0, 10); // YYYY-MM-DD
  // (#18) 只保留 ASCII slug，避免中文路径兼容性问题
  const slug = requirement
    .toLowerCase()
    // 先把常见分隔符和标点替换为空格
    .replace(/[/\\:;,.!?()[\]{}"'|]+/g, " ")
    // 去除非 ASCII 字母数字和空格
    .replace(/[^a-z0-9 ]+/g, "")
    // 空格转横线
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/(^-|-$)/g, "");
  return `${date}-${slug || "untitled"}`;
  }

  getIncompleteTaskCount(
  state: WorkflowState,
  stageNumber: number
  ): number {
  const stage = state.stages.find((s) => s.number === stageNumber);
  if (!stage) return 0;
  return stage.tasks.filter((t) => t.status !== "pass").length;
  }
}
