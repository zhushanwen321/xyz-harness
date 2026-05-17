import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { PHASE_COUNT, PHASE_NAMES, createInitialState } from "./types.js";
import type { PhaseId, WorkflowState } from "./types.js";
import { getPhaseConfig, getStageList, isLastStage } from "./stages.js";
import {
  loadState,
  saveState,
  advanceStage,
  restartLoop,
  advancePhase,
  markRetrospectDone,
  setPlanComplexity,
  isV4State,
} from "./state-manager.js";
import { runGate } from "./gate-runner.js";

/** Discover project root by walking up for .xyz-harness directory or .git */
function findProjectRoot(cwd: string): string {
  let dir = cwd;
  while (true) {
    if (fs.existsSync(`${dir}/.xyz-harness`)) return dir;
    if (fs.existsSync(`${dir}/.git`)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}

function findTopicDir(projectRoot: string): string | null {
  const harDir = path.join(projectRoot, ".xyz-harness");
  if (!fs.existsSync(harDir)) return null;

  const entries = fs.readdirSync(harDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .filter((e) => /^\d{4}-\d{2}-\d{2}-/.test(e.name))
    .sort()
    .reverse();

  return dirs.length > 0 ? path.join(harDir, dirs[0].name) : null;
}

function buildPhaseKickoff(phaseId: PhaseId, state: WorkflowState): string {
  const phaseName = PHASE_NAMES[phaseId];
  const phase = getPhaseConfig(phaseId);
  const stages = phase.stages
    .map((s, i) => `  ${i + 1}. ${s.name}${s.runOnce ? " (仅首轮)" : ""}`)
    .join("\n");

  return (
    `Starting Phase ${phaseId}: ${phaseName}\n\n` +
    `Topic dir: ${state.topicDir}\n` +
    `Stages:\n${stages}\n\n` +
    `Each stage is part of a loop. At the end of the phase, a gate check will run.\n` +
    `If the gate fails, the loop restarts from stage 1.\n` +
    `When all stages are complete and gate passes, we'll do a retrospect and compress context.\n\n` +
    `Begin Stage 1: ${phase.stages[0].name}.`
  );
}

export default function (pi: ExtensionAPI) {
  // ========================================================================
  // Tool: harness_stage_complete
  // ========================================================================
  pi.registerTool({
    name: "harness_stage_complete",
    label: "Complete Stage",
    description:
      "Mark current harness stage as complete. Advances to next stage. " +
      "At last stage of a phase, runs gate check. On gate PASS, guides " +
      "through retrospect and compression.",
    parameters: Type.Object({
      summary: Type.String({
        description: "Summary of what was done in this stage",
      }),
      topicDir: Type.Optional(
        Type.String({
          description:
            "Optional override for topic directory (e.g. .xyz-harness/2026-05-16-topic)",
        })
      ),
      planComplexity: Type.Optional(
        Type.String({
          description: "Plan complexity level: L1 or L2 (only for Phase 2)",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = findProjectRoot(ctx.cwd);

      let state = loadState(projectRoot);
      if (!state) {
        const dir = params.topicDir || findTopicDir(projectRoot);
        if (!dir) {
          return {
            content: [
              {
                type: "text",
                text: "No harness workflow found. Use harness_init to start.",
              },
            ],
          };
        }
        state = createInitialState(dir);
        saveState(state, projectRoot);
      }

      const phase = getPhaseConfig(state.currentPhase);
      const stages = getStageList(state.currentPhase, state.loop.loopCount);

      // Store plan complexity if provided
      if (params.planComplexity && state.currentPhase === 2) {
        setPlanComplexity(state, params.planComplexity as "L1" | "L2", projectRoot);
        state.planComplexity = params.planComplexity as "L1" | "L2";
      }

      // Record phase start entry on first call of a new phase
      if (!state.phaseStartEntryId) {
        const leafId = ctx.sessionManager.getLeafId();
        if (leafId) {
          const { setPhaseStartEntry } = await import("./state-manager.js");
          setPhaseStartEntry(state, leafId, projectRoot);
        }
      }

      // Check if on last stage (needs gate)
      if (isLastStage(state.currentPhase, state.loop.currentStageIndex, state.loop.loopCount)) {
        const gateResult = await runGate(
          state.currentPhase,
          state.topicDir,
          projectRoot,
          state.planComplexity
        );

        if (!gateResult.passed) {
          const l1Errors = gateResult.l1.errors.join("\n  ");
          const l2Error = gateResult.l2?.error ? `\nL2 error: ${gateResult.l2.error}` : "";
          restartLoop(state, projectRoot);
          const loopStage = getStageList(state.currentPhase, state.loop.loopCount)[0];
          return {
            content: [
              {
                type: "text",
                text:
                  `Gate FAILED (loop ${state.loop.loopCount - 1}).\n` +
                  `L1 errors:\n  ${l1Errors}${l2Error}\n\n` +
                  `Restarting Phase ${state.currentPhase} at "${loopStage.name}". ` +
                  `Fix the issues and try again.`,
              },
            ],
          };
        }

        // Gate PASS: check retrospect
        if (!state.retrospectDone) {
          const phaseName = PHASE_NAMES[state.currentPhase];
          const retrospectPath = `${state.topicDir}/changes/reviews/${phaseName}_retrospect.md`;

          pi.sendUserMessage(
            `Phase ${state.currentPhase} (${phaseName}) gate PASSED.\n\n` +
              `Now dispatch the harness-retrospect subagent to produce:\n` +
              `${retrospectPath}\n\n` +
              `Input for the subagent:\n` +
              `- Phase: ${state.currentPhase} (${phaseName})\n` +
              `- Topic dir: ${state.topicDir}\n` +
              `- Gate result: L1=${gateResult.l1.passed}, L2=${gateResult.l2?.passed ?? "N/A"}\n` +
              `- Deliverables: ${state.topicDir}/\n\n` +
              `Cover both: (1) Phase execution review, (2) Harness usability issues.\n` +
              `After the retrospect file is written, call harness_stage_complete again.`,
            { deliverAs: "followUp" }
          );

          return {
            content: [
              {
                type: "text",
                text:
                  `Gate PASSED for Phase ${state.currentPhase} (${PHASE_NAMES[state.currentPhase]}).\n` +
                  `Next step: dispatch harness-retrospect subagent to write retrospect.`,
              },
            ],
          };
        }

        // Gate PASS + retrospect done
        if (state.currentPhase >= PHASE_COUNT) {
          state.completed = true;
          saveState(state, projectRoot);
          return {
            content: [
              {
                type: "text",
                text: "All phases complete. Workflow finished.",
              },
            ],
          };
        }

        // Trigger phase transition via slash command
        saveState(state, projectRoot);
        pi.sendUserMessage(`/harness-phase-transition`, { deliverAs: "followUp" });

        const nextPhase = (state.currentPhase + 1) as PhaseId;
        return {
          content: [
            {
              type: "text",
              text:
                `Phase ${state.currentPhase} complete. ` +
                `Transitioning to Phase ${nextPhase} (${PHASE_NAMES[nextPhase]}) with context compression...`,
            },
          ],
        };
      }

      // Normal stage advance
      advanceStage(state, projectRoot);
      const newStages = getStageList(state.currentPhase, state.loop.loopCount);
      const nextStage = newStages[state.loop.currentStageIndex];
      return {
        content: [
          {
            type: "text",
            text:
              `Advanced to Phase ${state.currentPhase} Stage ${state.loop.currentStageIndex + 1}/${newStages.length}: ${nextStage.name}\n` +
              `Loop iteration: ${state.loop.loopCount}`,
          },
        ],
      };
    },
  });

  // ========================================================================
  // Tool: harness_status
  // ========================================================================
  pi.registerTool({
    name: "harness_status",
    label: "Harness Status",
    description: "Show current harness workflow status.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const projectRoot = findProjectRoot(ctx.cwd);
      const state = loadState(projectRoot);
      if (!state) {
        return { content: [{ type: "text", text: "No harness workflow found." }] };
      }

      const phase = getPhaseConfig(state.currentPhase);
      const stages = getStageList(state.currentPhase, state.loop.loopCount);
      const current = stages[state.loop.currentStageIndex];

      return {
        content: [
          {
            type: "text",
            text:
              `Phase ${state.currentPhase}: ${phase.name}\n` +
              `Stage: ${current.name} (${state.loop.currentStageIndex + 1}/${stages.length})\n` +
              `Loop iteration: ${state.loop.loopCount}\n` +
              `Topic dir: ${state.topicDir}\n` +
              `Retrospect done: ${state.retrospectDone}\n` +
              `Completed: ${state.completed}`,
          },
        ],
      };
    },
  });

  // ========================================================================
  // Tool: harness_init
  // ========================================================================
  pi.registerTool({
    name: "harness_init",
    label: "Init Harness",
    description: "Initialize a new harness workflow for a topic.",
    parameters: Type.Object({
      topic: Type.String({
        description: "Topic identifier (e.g. 2026-05-16-feature-name)",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = findProjectRoot(ctx.cwd);
      const topicDir = path.join(projectRoot, ".xyz-harness", params.topic);

      for (const sub of ["", "/changes/evidence", "/changes/reviews"]) {
        const d = `${topicDir}${sub}`;
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      }

      const state = createInitialState(topicDir);
      saveState(state, projectRoot);

      return {
        content: [
          {
            type: "text",
            text:
              `Harness workflow initialized.\n` +
              `Topic: ${params.topic}\n` +
              `Directory: ${topicDir}\n\n` +
              `Phase 1 (spec) — begin with brainstorming.`,
          },
        ],
      };
    },
  });

  // ========================================================================
  // Command: /harness-phase-transition
  // ========================================================================
  pi.registerCommand("harness-phase-transition", {
    description: "Execute phase transition with context compression",
    handler: async (_args, ctx) => {
      const projectRoot = findProjectRoot(ctx.cwd);
      const state = loadState(projectRoot);
      if (!state) {
        ctx.ui.notify("No harness workflow found", "error");
        return;
      }

      const fromPhase = state.currentPhase;
      const nextPhase = (fromPhase + 1) as PhaseId;

      if (nextPhase > PHASE_COUNT) {
        ctx.ui.notify("Workflow already complete", "info");
        return;
      }

      const targetEntryId = state.phaseStartEntryId;
      if (!targetEntryId) {
        ctx.ui.notify("No phase start entry recorded, advancing without compression", "warn");
        advancePhase(state, projectRoot);
        pi.sendUserMessage(buildPhaseKickoff(nextPhase, state));
        return;
      }

      const phaseName = PHASE_NAMES[fromPhase];
      const compactPrompt =
        `Phase ${fromPhase} (${phaseName}) complete.\n\n` +
        `Summarize the key decisions and deliverables from this phase. ` +
        `The next phase is Phase ${nextPhase}: ${PHASE_NAMES[nextPhase]}.`;

      try {
        const result = await ctx.navigateTree(targetEntryId, {
          summarize: true,
          customInstructions: compactPrompt,
          label: `${phaseName}-summary`,
        });

        if (result.cancelled) {
          ctx.ui.notify("Tree navigation cancelled", "warn");
          return;
        }

        advancePhase(state, projectRoot);
        pi.sendUserMessage(buildPhaseKickoff(nextPhase, state));
      } catch (e) {
        ctx.ui.notify(`Phase transition failed: ${(e as Error).message}`, "error");
      }
    },
  });

  // ========================================================================
  // V4 state detection on startup
  // ========================================================================
  pi.on("session_start", async (_event, ctx) => {
    const projectRoot = findProjectRoot(ctx.cwd);
    if (isV4State(projectRoot)) {
      ctx.ui.notify(
        "V4 harness state detected. Run harness_init for V5 or remove .xyz-harness/gate/workflow-state.json.",
        "warn"
      );
    }
  });

  // ========================================================================
  // before_agent_start: inject phase context into system prompt
  // ========================================================================
  pi.on("before_agent_start", async (event, ctx) => {
    const projectRoot = findProjectRoot(ctx.cwd);
    const state = loadState(projectRoot);
    if (!state || state.completed) return;

    const phase = getPhaseConfig(state.currentPhase);
    const stages = getStageList(state.currentPhase, state.loop.loopCount);
    const current = stages[state.loop.currentStageIndex];

    const contextBlock =
      `\n\n## Current Harness State\n` +
      `Phase ${state.currentPhase}: ${phase.name} (loop ${state.loop.loopCount})\n` +
      `Current stage: ${current.name} (${state.loop.currentStageIndex + 1}/${stages.length})\n` +
      `${current.description}\n` +
      `Topic dir: ${state.topicDir}\n\n` +
      `When you complete this stage, call harness_stage_complete to advance.`;

    return {
      systemPrompt: event.systemPrompt + contextBlock,
    };
  });
}
