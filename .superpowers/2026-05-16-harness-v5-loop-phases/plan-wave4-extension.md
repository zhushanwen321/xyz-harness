# Wave 4: Extension — 主入口、工具注册、Slash Command

## Task 4.1: index.ts — 类型、工具函数、状态初始化

**文件：**
- 创建：`extensions/coding-workflow/index.ts`

- [ ] **步骤 1：写入 import 和工具函数**

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { PHASE_COUNT, PHASE_NAMES, createInitialState } from "./types.js";
import type {
  PhaseId,
  WorkflowState,
} from "./types.js";
import { getPhaseConfig, getStageList, isLastStage } from "./stages.js";
import {
  loadState,
  saveState,
  advanceStage,
  restartLoop,
  advancePhase,
  markRetrospectDone,
  setPhaseStartEntry,
  setPlanComplexity,
  isV4State,
  createInitialState as newState,
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
```

- [ ] **步骤 2：写入 harness_stage_complete 工具**

```typescript
export default function (pi: ExtensionAPI) {
  // ==========================================================================
  // Tool: harness_stage_complete — 核心控制工具
  // ==========================================================================
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
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
      ctx
    ) {
      const projectRoot = findProjectRoot(ctx.cwd);

      // Load or create state
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
      const currentStage = stages[state.loop.currentStageIndex];

      // Store plan complexity if provided
      if (params.planComplexity && state.currentPhase === 2) {
        setPlanComplexity(
          state,
          params.planComplexity as "L1" | "L2",
          projectRoot
        );
        state.planComplexity = params.planComplexity as "L1" | "L2";
      }

      // Check if on last stage (needs gate)
      if (isLastStage(state.currentPhase, state.loop.currentStageIndex, state.loop.loopCount)) {
        // === GATE CHECK ===
        const gateResult = await runGate(
          state.currentPhase,
          state.topicDir,
          projectRoot,
          state.planComplexity
        );

        if (!gateResult.passed) {
          // Gate FAIL: loop back
          const l1Errors = gateResult.l1.errors.join("\n  ");
          const l2Error = gateResult.l2?.error
            ? `\nL2 error: ${gateResult.l2.error}`
            : "";
          restartLoop(state, projectRoot);
          const loopStage = getStageList(
            state.currentPhase,
            state.loop.loopCount
          )[0];
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
          // Need retrospect
          const phaseName = PHASE_NAMES[state.currentPhase];
          const retrospectPath = `${state.topicDir}/changes/reviews/${phaseName}_retrospect.md`;

          // Trigger retrospect subagent dispatch (AI reads this and acts)
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

        // Gate PASS + retrospect done → transition to next phase
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
        const nextPhase = (state.currentPhase + 1) as PhaseId;
        state.completed = true; // Mark complete before compression
        saveState(state, projectRoot);

        pi.sendUserMessage(
          `/harness-phase-transition ${state.currentPhase}`,
          { deliverAs: "followUp" }
        );

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

      // === Normal stage advance (not last stage) ===
      const { shouldCheckGate } = advanceStage(state, projectRoot);

      if (shouldCheckGate) {
        // Shouldn't happen since we checked isLastStage above
        return {
          content: [{ type: "text", text: "Gate check pending..." }],
        };
      }

      const newStages = getStageList(
        state.currentPhase,
        state.loop.loopCount
      );
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
```

- [ ] **步骤 3：写入辅助函数**

```typescript
  // ==========================================================================
  // Helper functions
  // ==========================================================================
  function findTopicDir(projectRoot: string): string | null {
    const harDir = path.join(projectRoot, ".xyz-harness");
    if (!fs.existsSync(harDir)) return null;

    // Find most recent topic directory
    const entries = fs.readdirSync(harDir, { withFileTypes: true });
    const dirs = entries
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .filter((e: { name: string }) => /^\d{4}-\d{2}-\d{2}-/.test(e.name))
      .sort()
      .reverse();

    return dirs.length > 0 ? path.join(harDir, dirs[0].name) : null;
  }
```

- [ ] **步骤 4：类型检查 + 提交**

```bash
cd extensions/coding-workflow && npx tsc --noEmit index.ts 2>&1
```
预期：部分类型错误（缺少 slash command、其他工具，继续 Task 4.2）

```bash
git add extensions/coding-workflow/index.ts
git commit -m "feat: add V5 harness_stage_complete tool with gate+loop logic"
```

---

## Task 4.2: index.ts — Slash Command + 辅助工具

**文件：**
- 修改：`extensions/coding-workflow/index.ts`

- [ ] **步骤 1：注册 harness_status 工具**

在 `harness_stage_complete` 注册后追加：

```typescript
  // ==========================================================================
  // Tool: harness_status — 查询当前状态
  // ==========================================================================
  pi.registerTool({
    name: "harness_status",
    label: "Harness Status",
    description: "Show current harness workflow status (phase, stage, loop count).",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const projectRoot = findProjectRoot(ctx.cwd);
      const state = loadState(projectRoot);

      if (!state) {
        return {
          content: [{ type: "text", text: "No harness workflow found." }],
        };
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
```

- [ ] **步骤 2：注册 /harness-phase-transition 命令**

```typescript
  // ==========================================================================
  // Command: /harness-phase-transition — Phase 间压缩
  // ==========================================================================
  pi.registerCommand("harness-phase-transition", {
    description: "Execute phase transition with context compression",
    handler: async (args, ctx) => {
      const projectRoot = findProjectRoot(ctx.cwd);
      const state = loadState(projectRoot);
      if (!state) {
        ctx.ui.notify("No harness workflow found", "error");
        return;
      }

      // Determine phase that just completed
      const fromPhase = state.currentPhase;
      const nextPhase = (fromPhase + 1) as PhaseId;

      if (nextPhase > PHASE_COUNT) {
        ctx.ui.notify("Workflow already complete", "info");
        return;
      }

      // Get phase start entry for tree navigation
      const targetEntryId = state.phaseStartEntryId;
      if (!targetEntryId) {
        // Fallback: navigate to root and continue
        ctx.ui.notify("No phase start entry recorded, skipping compression", "warn");
        advancePhase(state, projectRoot);
        const kickoff = buildPhaseKickoff(nextPhase, state);
        pi.sendUserMessage(kickoff);
        return;
      }

      // Navigate tree → generate branch summary → compress context
      const phaseName = PHASE_NAMES[fromPhase];
      const compactPrompt =
        `Phase ${fromPhase} (${phaseName}) complete.\n\n` +
        `Summarize the key decisions and deliverables from this phase:\n` +
        `- Spec decisions and scope decisions\n` +
        `- Plan architecture decisions and task breakdown\n` +
        `- Dev challenges and key code changes\n` +
        `- Test results and remaining issues\n` +
        `- Retrospect findings\n\n` +
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

        // Advance to next phase
        advancePhase(state, projectRoot);

        // Kick off next phase
        const kickoff = buildPhaseKickoff(nextPhase, state);
        pi.sendUserMessage(kickoff);
      } catch (e) {
        ctx.ui.notify(
          `Phase transition failed: ${(e as Error).message}`,
          "error"
        );
      }
    },
  });

  function buildPhaseKickoff(phaseId: PhaseId, state: WorkflowState): string {
    const phaseName = PHASE_NAMES[phaseId];
    const phase = getPhaseConfig(phaseId);
    const stages = phase.stages.map((s, i) => `  ${i + 1}. ${s.name}${s.runOnce ? " (仅首轮)" : ""}`).join("\n");

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
```

- [ ] **步骤 3：注册 harness_init 工具**

```typescript
  // ==========================================================================
  // Tool: harness_init — 初始化新 workflow
  // ==========================================================================
  pi.registerTool({
    name: "harness_init",
    label: "Init Harness",
    description:
      "Initialize a new harness workflow for a topic. Creates topic directory and state file.",
    parameters: Type.Object({
      topic: Type.String({
        description: "Topic identifier (e.g. 2026-05-16-feature-name)",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = findProjectRoot(ctx.cwd);
      const topicDir = path.join(projectRoot, ".xyz-harness", params.topic);

      // Create directories
      for (const sub of [
        "",
        "/changes/evidence",
        "/changes/reviews",
      ]) {
        const d = `${topicDir}${sub}`;
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      }

      // Initialize state
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
```

- [ ] **步骤 4：V4 状态检测 + 事件处理**

```typescript
  // ==========================================================================
  // V4 state detection on startup
  // ==========================================================================
  pi.on("session_start", async (_event, ctx) => {
    const projectRoot = findProjectRoot(ctx.cwd);

    if (isV4State(projectRoot)) {
      ctx.ui.notify(
        "V4 harness state detected. Use harness_init to start a V5 workflow, or remove .xyz-harness/gate/workflow-state.json to reset.",
        "warn"
      );
    }
  });

  // ==========================================================================
  // before_agent_start: inject phase context
  // ==========================================================================
  pi.on("before_agent_start", async (event, ctx) => {
    const projectRoot = findProjectRoot(ctx.cwd);
    const state = loadState(projectRoot);
    if (!state) return;

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
```

- [ ] **步骤 5：类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit index.ts 2>&1
```
预期：无错误

- [ ] **步骤 6：提交**

```bash
git add extensions/coding-workflow/index.ts
git commit -m "feat: add V5 harness_status, harness_init, phase-transition command"
```
