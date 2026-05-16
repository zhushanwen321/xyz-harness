// Workflow Controller Extension — 主入口

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, readdirSync, statSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { WORKFLOW_STAGES } from "./stages.js";
import { StateManager } from "./state-manager.js";
import { GateRunner } from "./gate-runner.js";
import { verifyGateL2 } from "./gate-verifier.js";
import { WidgetManager } from "./widget.js";
import {
  type StageCompleteParams,
  type RegisterTasksParams,
  type TaskCompleteParams,
  type RollbackParams,
  type StageDefinition,
} from "./types.js";
import { checkYamlVerdict } from "./gates/common.js";

const STATE_FILE = ".xyz-harness/workflow-state.json";
// GateRunner 从扩展自身目录查找 scripts/，无需 SCRIPTS_DIR
const MAX_SUMMARY_LENGTH = 500; // (#20)

export default function workflowController(pi: ExtensionAPI) {
  const stateMgr = new StateManager(STATE_FILE);
  const gateRunner = new GateRunner();
  const widgetMgr = new WidgetManager(pi, stateMgr);
  let compactInProgress = false; // (#17) compact 去重标志
  let sessionActive = false; // session 维度激活，/new 后自动重置

  // ── 工具方法 ─────────────────────────────────────────

  function findStageDef(stageNumber: number) {
  return WORKFLOW_STAGES.find((s) => s.number === stageNumber);
  }

  function findNextStageDef(currentStageNumber: number) {
  // (#11) 按数组索引顺序查找，不依赖 number 比较
  const idx = WORKFLOW_STAGES.findIndex((s) => s.number === currentStageNumber);
  if (idx < 0) return undefined;
  return WORKFLOW_STAGES[idx + 1]; // undefined if last
  }

  // ── 交付物验证 ─────────────────────────────────────────────

  /**
   * 验证 Stage 的交付物。
   * @returns 错误消息数组（空 = 全部通过）
   */
  function validateDeliverables(
  stageDef: StageDefinition,
  topicDir: string,
  projectRoot: string
  ): string[] {
  const errors: string[] = [];

  for (const d of stageDef.deliverables) {
  if (!d.required) continue;

  // 解析路径：替换 {topicDir} 占位符
  const pattern = d.path.replace("{topicDir}", topicDir);
  const fullPath = resolve(projectRoot, pattern);

  // glob 匹配（支持 * 通配符）
  const matched = globMatch(fullPath, projectRoot);

  if (matched.length === 0) {
  errors.push(`${d.label}: file not found (pattern: ${pattern})`);
  continue;
  }

  // 取最新匹配的文件（如果有多个版本）
  const target = matched.sort().reverse()[0];

  // 检查文件非空
  const stat = statSync(target);
  if (stat.size === 0) {
  errors.push(`${d.label}: file is empty (${target})`);
  continue;
  }

  // 内容检查
  if (d.contentChecks && d.contentChecks.length > 0) {
  const content = readFileSync(target, "utf-8");
  for (const check of d.contentChecks) {
  if (check.type === "must_not_match") {
  const regex = new RegExp(check.pattern);
  if (regex.test(content)) {
  errors.push(`${d.label}: ${check.message} (${target})`);
  }
  } else if (check.type === "yaml_verdict") {
  const result = checkYamlVerdict(content);
  if (result === null) {
  errors.push(`${d.label}: missing YAML frontmatter (${target})`);
  } else if (!result.ok) {
  errors.push(`${d.label}: ${check.message} (${target})`);
  }
  }
  }
  }
  }

  return errors;
  }

  /**
   * 简单 glob 匹配：处理路径中的 * 通配符。
   * 只支持文件名级的通配符（如 spec_review_*.md），不支持目录级通配。
   */
  function globMatch(pattern: string, projectRoot: string): string[] {
  // 无通配符 → 直接检查
  if (!pattern.includes("*")) {
  return existsSync(pattern) ? [pattern] : [];
  }

  // 分离目录和文件名模式
  const lastSlash = pattern.lastIndexOf("/");
  const dir = pattern.substring(0, lastSlash);
  const filePattern = pattern.substring(lastSlash + 1);

  if (!existsSync(dir)) return [];

  // 将 glob * 转为正则
  const regexStr = "^" + filePattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
  const regex = new RegExp(regexStr);

  try {
  return readdirSync(dir)
  .filter((name) => regex.test(name))
  .map((name) => join(dir, name))
  .filter((p) => statSync(p).isFile());
  } catch {
  return [];
  }
  }

  // ── 注册工具 ────────────────────────────────────────────

  pi.registerTool({
  name: "harness_stage_complete",
  label: "Harness Stage Complete",
  description:
    "Declare the current workflow stage as complete. The extension validates L1 gates, " +
    "requests user confirmation if needed, and advances to the next stage. " +
    "Call this when you have finished all work for the current stage.",
  parameters: Type.Object({
    summary: Type.String({
    description: "One-line summary of what was accomplished (max 500 chars)",
    }),
  }),
  async execute(toolCallId, params: StageCompleteParams, signal, onUpdate, ctx) {
    // (#20) 限制 summary 长度
    const summary = params.summary.length > MAX_SUMMARY_LENGTH
    ? params.summary.slice(0, MAX_SUMMARY_LENGTH) + "..."
    : params.summary;

    const state = stateMgr.load(ctx.cwd);
    if (!state) {
    throw new Error("No active workflow. Start with /coding-workflow design or /coding-workflow dev.");
    }

  const currentStageDef = findStageDef(state.currentStage);
  if (!currentStageDef) {
  throw new Error(`Unknown stage: ${state.currentStage}`);
  }

  // 前置检查：如果当前阶段已经标记为 gate 失败，清除状态后重新验证
  // 不拒绝推进 — gate 会再次运行，如果问题未修复会再次失败
  const preCheck = state.stages.find((s) => s.number === state.currentStage);
  if (preCheck?.status === "fail") {
  stateMgr.updateStage(state, state.currentStage, {
    status: "active",
    gateResult: undefined,
    gateOutput: undefined,
  });
  stateMgr.save(state, ctx.cwd);
  }

  onUpdate?.({
  content: [
    { type: "text", text: `Validating stage ${state.currentStage}: ${currentStageDef.name}...` },
  ],
  details: undefined,
  });

    // 1. 检查 task 完成度
    const stageState = state.stages.find((s) => s.number === state.currentStage);
    if (stageState) {
    const incomplete = stageState.tasks.filter((t) => t.status !== "pass");
    if (incomplete.length > 0) {
      throw new Error(
      `Cannot complete stage: ${incomplete.length} task(s) not finished: ` +
        incomplete.map((t) => `${t.id}: ${t.name}`).join(", ")
      );
    }
    }

  // 2. 交付物验证（在用户确认和 gate 之前，最早失败）
  const deliverableErrors = validateDeliverables(currentStageDef, state.topicDir, ctx.cwd);
  if (deliverableErrors.length > 0) {
  throw new Error(
    `Stage ${state.currentStage} deliverables not satisfied:\n` +
    deliverableErrors.map((e) => `  - ${e}`).join("\n")
  );
  }

  // 3. 用户确认（移到 L1 gate 之前，避免确认拒绝时 gate 副作用）(#6)
  const nextStageDef = findNextStageDef(state.currentStage);
  if (currentStageDef.requiresConfirmation) {
  const nextName = nextStageDef ? nextStageDef.name : "(end)";
  const ok = await ctx.ui.confirm(
    `Stage ${state.currentStage}: ${currentStageDef.name}`,
    `Stage complete: ${summary}\n\nProceed to ${nextName}?`
  );
  if (!ok) {
    throw new Error("User declined stage advancement.");
  }
  }

  // 4. L1 Gate 检查
  const gateScripts =
  currentStageDef.gateScripts ??
  (currentStageDef.gateScript ? [currentStageDef.gateScript] : []);
  const gateResults: Array<{ passed: boolean; output: string }> = [];
  for (const gateNum of gateScripts) {
  const gateResult = await gateRunner.run(gateNum, ctx.cwd, signal);
  gateResults.push(gateResult);
  if (!gateResult.passed) {
    stateMgr.updateStage(state, state.currentStage, {
    status: "fail",
    gateResult: "fail",
    gateOutput: gateResult.output,
    });
    stateMgr.save(state, ctx.cwd);
    throw new Error(`L1 Gate ${gateNum} failed:\n${gateResult.output}`);
  }
  }

  // 4b. L2 Gate 验证（防伪造检查）— L1 全部通过后执行，检查所有已完成 stage 的交付物
  if (gateResults.length > 0) {
  const deliverablesForL2: Array<{ path: string; content: string }> = [];
  // 收集所有已完成 stage 的交付物（不只是当前 stage）
  for (const ss of state.stages) {
  if (ss.status !== "pass" && ss.number !== state.currentStage) continue;
  const sd = findStageDef(ss.number);
  if (!sd?.deliverables) continue;
  for (const d of sd.deliverables) {
  if (!d.required) continue;
  const pattern = d.path.replace("{topicDir}", state.topicDir);
  const fullPath = resolve(ctx.cwd, pattern);
  // glob 模式支持 * 通配符，取最新匹配的文件
  const matched = globMatch(fullPath, ctx.cwd);
  if (matched.length === 0) continue;
  const target = matched.sort().reverse()[0];
  try {
  const content = readFileSync(target, "utf-8").slice(0, 3000);
  deliverablesForL2.push({ path: pattern, content });
  } catch { /* skip unreadable files */ }
  }
  }

  const gateOutput = gateResults.map((r) => r.output).join("\n---\n").slice(0, 4000);

  try {
    const l2Result = await verifyGateL2(
    gateScripts[gateScripts.length - 1],
    currentStageDef.name,
    gateOutput,
    deliverablesForL2,
    signal,
    );
    if (!l2Result.passed) {
    throw new Error(
    `L2 Gate verification failed — possible fabrication detected:\n${l2Result.output}\n\nRe-run the stage with actual execution (not code inspection).`
    );
    }
  } catch (e: unknown) {
    // L2 验证的明确 FAIL 才抛出；网络错误/超时等降级通过
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("fabrication") || msg.includes("L2 Gate")) {
    throw e;
    }
    // 其他异常（网络/超时）静默降级
  }
  }

  // 5. 最后一个 stage？
    if (!nextStageDef) {
  stateMgr.completeStage(state, state.currentStage, summary);
  state.completed = true;
  stateMgr.save(state, ctx.cwd);
  sessionActive = false;
  widgetMgr.clear(ctx);

  pi.sendMessage(
    {
    customType: "harness-complete",
    content: `All workflow stages complete! Requirement: ${state.requirement}`,
    display: true,
    },
    { triggerTurn: false }
  );
  return {
    content: [{ type: "text", text: "All stages complete. Workflow finished." }],
    details: { currentStage: state.currentStage },
    terminate: true,
  };
    }

  // 6. 原子推进：complete + start 在同一次 save (#7)
  stateMgr.advanceTo(
  state,
  state.currentStage,
  nextStageDef.number,
  nextStageDef.phase,
  summary,
  nextStageDef.name
  );
    stateMgr.save(state, ctx.cwd);
    widgetMgr.update(ctx);

  // 7. 自动推进到下一 stage
    pi.sendMessage(
    {
      customType: "harness-stage-start",
      content: `[STAGE ${nextStageDef.number}/${WORKFLOW_STAGES.length}: ${nextStageDef.name}]\n${nextStageDef.prompt}`,
      display: true,
    },
    { triggerTurn: true }
    );

    return {
    content: [
      {
      type: "text",
      text: `Stage ${currentStageDef.name} passed. Advanced to ${nextStageDef.name}.`,
      },
    ],
    details: { newStage: nextStageDef.number },
    };
  },
  });

  pi.registerTool({
  name: "harness_register_tasks",
  label: "Harness Register Tasks",
  description:
    "Register tasks for the current workflow stage. Call this at the start of a stage " +
    "that has multiple tasks (e.g., coding implementation with tasks from plan.md). " +
    "All tasks must be completed before harness_stage_complete can succeed. " +
    "Can only be called once per stage (before any tasks are completed).",
  parameters: Type.Object({
    tasks: Type.Array(
    Type.Object({
      id: Type.String({ description: "Unique task identifier" }),
      name: Type.String({ description: "Human-readable task name" }),
    })
    ),
  }),
  async execute(_toolCallId, params: RegisterTasksParams, _signal, _onUpdate, ctx) {
    const state = stateMgr.load(ctx.cwd);
    if (!state) {
    throw new Error("No active workflow.");
    }

    stateMgr.registerTasks(state, state.currentStage, params.tasks);
    stateMgr.save(state, ctx.cwd);
    widgetMgr.update(ctx);

    return {
    content: [
      {
      type: "text",
      text: `Registered ${params.tasks.length} tasks for stage ${state.currentStage}.`,
      },
    ],
    details: { taskCount: params.tasks.length },
    };
  },
  });

  pi.registerTool({
  name: "harness_task_complete",
  label: "Harness Task Complete",
  description: "Mark a task as completed within the current workflow stage.",
  parameters: Type.Object({
    taskId: Type.String({ description: "The task identifier to mark as complete" }),
    summary: Type.String({ description: "One-line summary of task result" }),
  }),
  async execute(_toolCallId, params: TaskCompleteParams, _signal, _onUpdate, ctx) {
    const state = stateMgr.load(ctx.cwd);
    if (!state) {
    throw new Error("No active workflow.");
    }

    stateMgr.completeTask(state, state.currentStage, params.taskId, params.summary);
    stateMgr.save(state, ctx.cwd);
    widgetMgr.update(ctx);

    return {
    content: [{ type: "text", text: `Task ${params.taskId} completed.` }],
    details: { taskId: params.taskId },
    };
  },
  });

  pi.registerTool({
  name: "harness_rollback",
  label: "Harness Rollback",
  description:
    "Roll back the workflow to a previous stage. Clears all stage pass records from the target onward.",
  parameters: Type.Object({
    targetStage: Type.Number({ description: "Stage number to roll back to" }),
    reason: Type.String({ description: "Reason for rollback" }),
  }),
  async execute(_toolCallId, params: RollbackParams, _signal, _onUpdate, ctx) {
    const state = stateMgr.load(ctx.cwd);
    if (!state) {
    throw new Error("No active workflow.");
    }

    const targetDef = findStageDef(params.targetStage);
    if (!targetDef) {
    throw new Error(`Unknown target stage: ${params.targetStage}`);
    }

    stateMgr.rollback(state, params.targetStage, targetDef.phase, params.reason);
    stateMgr.save(state, ctx.cwd);
    widgetMgr.update(ctx);

    return {
    content: [
      {
      type: "text",
      text: `Rolled back to stage ${params.targetStage}: ${targetDef.name}. Reason: ${params.reason}`,
      },
    ],
    details: { targetStage: params.targetStage },
    };
  },
  });

  // ── 注册命令 ────────────────────────────────────────────

  pi.registerCommand("coding-workflow", {
  description: "Coding workflow: /coding-workflow design <req> | /coding-workflow dev <topicDir>",
  handler: async (args, ctx) => {
    // Parse subcommand
    const parts = (args?.trim() || "").split(/\s+/);
    const subcommand = parts[0]?.toLowerCase();
    const subargs = parts.slice(1).join(" ").trim();

    switch (subcommand) {
      case "design":
      case "d": {
    const requirement = subargs;
    if (!requirement) {
      ctx.ui.notify("Usage: /coding-workflow design <requirements description>", "warning");
      return;
    }

    const state = stateMgr.create(requirement, ctx.cwd);
    const firstStage = WORKFLOW_STAGES[0];
    stateMgr.startStage(state, firstStage.number, firstStage.phase, firstStage.name);
  stateMgr.save(state, ctx.cwd);
  sessionActive = true;
  widgetMgr.update(ctx);

  pi.sendMessage(
  {
    customType: "coding-workflow-start",
    content: `[STAGE 1/${WORKFLOW_STAGES.length}: ${firstStage.name}]\n${firstStage.prompt}\n\nRequirement: ${requirement}`,
    display: true,
  },
  { triggerTurn: true }
  );
  break;
    }
    case "dev": {
    const topicDir = subargs;
    const state = stateMgr.load(ctx.cwd);
    if (!state) {
      ctx.ui.notify("No active workflow. Use /coding-workflow design first.", "error");
      return;
    }

    // (#19) 验证 Phase 1 产出物存在
    const { existsSync: exists } = await import("node:fs");
    const { join } = await import("node:path");
    const specPath = join(ctx.cwd, ".xyz-harness", state.topicDir, "spec.md");
    const planPath = join(ctx.cwd, ".xyz-harness", state.topicDir, "plan.md");
  const missing: string[] = [];
    if (!exists(specPath)) missing.push("spec.md");
    if (!exists(planPath)) missing.push("plan.md");
    if (missing.length > 0) {
      ctx.ui.notify(
        `Phase 1 deliverables not found: ${missing.join(", ")}. Complete Phase 1 first.`,
        "error"
      );
      return;
    }

    if (topicDir && topicDir !== state.topicDir) {
      state.topicDir = topicDir;
    }

    const firstPhase2Stage = WORKFLOW_STAGES.find((s) => s.phase === 2);
    if (!firstPhase2Stage) {
      ctx.ui.notify("No Phase 2 stages defined.", "error");
      return;
    }

  stateMgr.startStage(state, firstPhase2Stage.number, firstPhase2Stage.phase, firstPhase2Stage.name);
  stateMgr.save(state, ctx.cwd);
  sessionActive = true;
  widgetMgr.update(ctx);

  pi.sendMessage(
  {
    customType: "coding-workflow-start",
    content: `[STAGE ${firstPhase2Stage.number}/${WORKFLOW_STAGES.length}: ${firstPhase2Stage.name}]\n${firstPhase2Stage.prompt}`,
    display: true,
  },
  { triggerTurn: true }
  );
  break;
      }

      default:
    ctx.ui.notify(
      "Usage: /coding-workflow design <requirements> | /coding-workflow dev <topicDir>",
      "warning"
    );
    }
  },
});
pi.registerCommand("harness-status", {
  description: "Show current workflow status",
  handler: async (_args, ctx) => {
  const state = stateMgr.load(ctx.cwd);
  if (!state) {
  ctx.ui.notify("No active workflow.", "info");
  return;
  }

  sessionActive = true;
  widgetMgr.update(ctx);

  const lines = [
    `Phase ${state.currentPhase} | Stage ${state.currentStage}/${WORKFLOW_STAGES.length}`,
    `Requirement: ${state.requirement}`,
    `Topic: ${state.topicDir}`,
    `Rollbacks: ${state.rollbackHistory.length}`,
    "",
    ...WORKFLOW_STAGES.map((def) => {
      const stage = state.stages.find((s) => s.number === def.number);
      const status = stage?.status ?? "pending";
      const icon =
      status === "pass" ? "☑" : status === "active" ? "☐ ←" : "☐";
      const taskInfo =
      stage && stage.tasks.length > 0
        ? ` (${stage.tasks.filter((t) => t.status === "pass").length}/${stage.tasks.length})`
        : "";
      return `${icon} ${def.number} ${def.name}${taskInfo}`;
    }),
    ];

    if (state.rollbackHistory.length > 0) {
    lines.push("", "Rollback History:");
    for (const rb of state.rollbackHistory) {
      lines.push(`  ${rb.from} → ${rb.to}: ${rb.reason}`);
    }
    }

    ctx.ui.notify(lines.join("\n"), "info");
  },
  });

  // ── 事件处理 ────────────────────────────────────────────

  // session_start: 只在 reload/resume 时恢复，new/startup/fork 保持静默
  pi.on("session_start", async (event, ctx) => {
  // 清理旧版 widget key，避免升级后残留
  ctx.ui.setWidget("harness-workflow", undefined);
  ctx.ui.setStatus("harness-workflow", undefined);

  // 非 reload/resume 的 session 启动不激活 workflow
  if (event.reason !== "reload" && event.reason !== "resume") return;

  let state: ReturnType<typeof stateMgr.load> = null;
  try {
  state = stateMgr.load(ctx.cwd);
  } catch {
  // 文件损坏时不阻塞 session 启动
  return;
  }
  if (!state) return;
  if (state.completed) return;

  sessionActive = true;
  widgetMgr.update(ctx);

  const stageDef = findStageDef(state.currentStage);
  if (stageDef) {
  const stageState = state.stages.find((s) => s.number === state.currentStage);
  if (stageState?.status === "active") {
    pi.sendMessage(
    {
    customType: "coding-workflow-resume",
    content: `[CODING WORKFLOW RESUMED — Stage ${state.currentStage}/${WORKFLOW_STAGES.length}: ${stageDef.name}]\n${stageDef.prompt}\n\nWhen this stage is complete, call harness_stage_complete with a summary.`,
    display: true,
    },
    { triggerTurn: true }
    );
  }
  }
  });

  // before_agent_start: 注入当前 stage prompt
  pi.on("before_agent_start", async (event, ctx) => {
  if (!sessionActive) return;
  let state: ReturnType<typeof stateMgr.load> = null;
  try {
  state = stateMgr.load(ctx.cwd);
  } catch {
  return;
  }
  if (!state) return;
  if (state.completed) return;

  const stageDef = findStageDef(state.currentStage);
  if (!stageDef) return;

  // 检查前驱阶段的交付物是否就绪（检测跳阶段行为）
  let prevWarning = "";
  const prevStageDef = findStageDef(state.currentStage - 1);
  if (prevStageDef && prevStageDef.deliverables.some((d) => d.required)) {
  const prevErrors = validateDeliverables(prevStageDef, state.topicDir, ctx.cwd);
  if (prevErrors.length > 0) {
  prevWarning = `\n\nWARNING: Previous stage (${prevStageDef.name}) deliverables not found: ${prevErrors.join("; ")}. This suggests a stage was skipped. Call harness_stage_complete for each stage in order.`;
  }
  }

  const stageState = state.stages.find((s) => s.number === state.currentStage);
  const stageStatus = stageState?.status ?? "active";
  const gateFailed = stageStatus === "fail";
  const gateFailedMsg = gateFailed
    ? `\n\nWARNING: Stage ${state.currentStage} FAILED gate check. You MUST fix the issues before calling harness_stage_complete again. Failure: ${stageState?.gateOutput ?? "unknown"}`
    : "";

  // 构建 task 进度段
  let taskBlock = "";
  if (stageState && stageState.tasks.length > 0) {
  const done = stageState.tasks.filter((t) => t.status === "pass");
  const remaining = stageState.tasks.filter((t) => t.status !== "pass");
  const nextTask = remaining[0];
  const taskLines = stageState.tasks.map((t) => {
  const mark = t.status === "pass" ? "done" : "todo";
  return `  [${mark}] ${t.name}${t.summary ? " — " + t.summary : ""}`;
  });
  taskBlock = `\n\nTask progress (${done.length}/${stageState.tasks.length}):\n${taskLines.join("\n")}${
  nextTask ? `\n\nNext task: ${nextTask.name}` : "\n\nAll tasks complete — call harness_stage_complete to advance."
  }`;
  }

  // Stage 13 的 E2E 测试强化规则
  let e2eWarning = "";
  if (stageDef.number === 13) {
  e2eWarning = `\n\n**E2E TESTING CRITICAL RULES — READ BEFORE EXECUTING:**
1. You MUST dispatch harness-e2e-tester subagent (NOT a generic executor).
2. Every UI smoke test MUST be executed in a real browser using chrome-automation skill.
3. Screenshots are REQUIRED for every UI test case — save to evidence/ directory.
4. FABRICATION IS FORBIDDEN. Writing "代码已实现" or "code inspection passed" instead of actual execution will cause gate_12 to FAIL.
5. If Chrome/browser is not available, mark tests as SKIP with reason. Do not fabricate.`;
  }

  return {
  systemPrompt:
    event.systemPrompt +
  `\n\n[CODING WORKFLOW \u2014 Phase ${stageDef.phase}, Stage ${state.currentStage}/${WORKFLOW_STAGES.length}: ${stageDef.name}]\n${stageDef.prompt}${gateFailedMsg}${prevWarning}${taskBlock}${e2eWarning}\n\nStage management:\n  When this stage is complete, call harness_stage_complete with a summary.\n  ${stageDef.requiresConfirmation ? "This stage requires user confirmation — the extension will ask automatically." : "Call harness_stage_complete when done (no confirmation needed for this stage)."}\n  If harness_stage_complete returns an error, fix the issues and retry.`,
  };
  });


  // turn_end: 检查 context 使用率，触发 compact
  pi.on("turn_end", async (_event, ctx) => {
  if (!sessionActive) return;
  if (compactInProgress) return;

  let state: ReturnType<typeof stateMgr.load> = null;
  try {
  state = stateMgr.load(ctx.cwd);
  } catch {
  return;
  }
  if (!state) return;
  if (state.completed) return;

  const usage = ctx.getContextUsage();
  if (usage && usage.tokens !== null && usage.contextWindow > 0) {
    const ratio = usage.tokens / usage.contextWindow;
    if (ratio > 0.75) {
    compactInProgress = true;
    ctx.compact({
      customInstructions: `Preserve workflow state. Current stage: ${state.currentStage}. Requirement: ${state.requirement}`,
      onComplete: () => {
      compactInProgress = false;
      ctx.ui.notify("Context auto-compressed (was >75%)", "info");
      },
      onError: () => {
      compactInProgress = false;
      },
    });
    }
  }
  });
}
