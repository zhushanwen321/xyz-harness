// Workflow Controller — Widget Manager
// 管理进度显示：Widget + Footer Status

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { StateManager } from "./state-manager.js";
import { WORKFLOW_STAGES } from "./stages.js";

export class WidgetManager {
  private pi: ExtensionAPI;
  private stateMgr: StateManager;

  constructor(pi: ExtensionAPI, stateMgr: StateManager) {
  this.pi = pi;
  this.stateMgr = stateMgr;
  }

  update(ctx: ExtensionContext): void {
  const state = this.stateMgr.load(ctx.cwd);
  if (!state) {
  this.clear(ctx);
  return;
  }

  // Footer status — 简洁摘要
  const stageDef = WORKFLOW_STAGES.find((s) => s.number === state.currentStage);
  const phaseLabel = `Phase ${state.currentPhase}`;
  const stageName = stageDef?.name ?? "?";
  ctx.ui.setStatus(
  "coding-workflow",
  ctx.ui.theme.fg("accent", `${phaseLabel} | Stage ${state.currentStage}: ${stageName}`)
  );

  // Widget — 阶段列表 + 当前 stage 展开 task
  const phaseStages = WORKFLOW_STAGES.filter((s) => s.phase === state.currentPhase);
  const lines: string[] = [];
  lines.push(ctx.ui.theme.fg("accent", `Stage ${state.currentStage}/${WORKFLOW_STAGES.length} · ${stageName}`));

  for (const def of phaseStages) {
  const stage = state.stages.find((s) => s.number === def.number);
  const status = stage?.status ?? "pending";
  const isActive = def.number === state.currentStage;

  // stage icon
  const icon =
  status === "pass"
    ? ctx.ui.theme.fg("success", "☑")
    : isActive
    ? ctx.ui.theme.fg("warning", "☐ ←")
    : ctx.ui.theme.fg("dim", "☐");

  let line = `${icon} ${def.number} ${def.name}`;
  if (stage && stage.tasks.length > 0) {
  const done = stage.tasks.filter((t) => t.status === "pass").length;
  line += ctx.ui.theme.fg("dim", ` (${done}/${stage.tasks.length})`);
  }
  lines.push(line);

  // 展开 active stage 的 task 列表
  if (isActive && stage && stage.tasks.length > 0) {
  for (const task of stage.tasks) {
    const taskIcon =
    task.status === "pass"
    ? ctx.ui.theme.fg("success", "  ✓")
    : task.status === "active"
    ? ctx.ui.theme.fg("warning", "  →")
    : ctx.ui.theme.fg("dim", "  ·");
    lines.push(`${taskIcon} ${task.name}`);
  }
  }
  }

  ctx.ui.setWidget("coding-workflow", lines);
  }

  clear(ctx: ExtensionContext): void {
  ctx.ui.setStatus("coding-workflow", undefined);
  ctx.ui.setWidget("coding-workflow", undefined);
  }
}
