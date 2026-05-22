/**
 * coding-workflow — Pi extension for 5-phase coding workflow orchestration.
 *
 * Restricts AI visibility to only the current phase, automatically runs
 * gate checks → review → retrospect → compact → next phase.
 *
 * Tools: coding-workflow-gate, coding-workflow-phase-start
 * Commands: /coding-workflow, /coding-workflow-status, /coding-workflow-abort
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChildProcess } from "node:child_process";
import { formatUsageStats } from "./lib/subagent.js";
import { runGateScript, type GateResult } from "./lib/gate-runner.js";
import { dispatchReviewSubagent, buildRetrospectFollowUp, type ReviewDispatchResult } from "./lib/review-dispatcher.js";

import * as yaml from "js-yaml";
import { SkillResolver } from "./lib/skill-resolver.js";

// ─── Module-level skill resolver ─────────────────────────

const skillResolver = new SkillResolver();

// ─── Phase definitions ───────────────────────────────────

interface PhaseConfig {
	phase: number;
	name: string;
	skillName: string;
	reviewPrefix: string;
	retrospectPrefix: string;
	/** Phase-specific deliverable file paths (relative to topicDir) */
	deliverables: string[];
	/** Review mode description for the expert-reviewer skill */
	reviewMode: string;
}

const PHASES: PhaseConfig[] = [
	{
		phase: 1, name: "Spec", skillName: "xyz-harness-brainstorming",
		reviewPrefix: "spec_review", retrospectPrefix: "spec_retrospect",
		deliverables: ["spec.md"],
		reviewMode: "模式一：计划评审（审查 spec 完整性）",
	},
	{
		phase: 2, name: "Plan", skillName: "xyz-harness-writing-plans",
		reviewPrefix: "plan_review", retrospectPrefix: "plan_retrospect",
		deliverables: ["plan.md", "e2e-test-plan.md", "test_cases_template.json"],
		reviewMode: "模式一：计划评审（审查 plan 可行性）",
	},
	{
		phase: 3, name: "Dev", skillName: "xyz-harness-phase-dev",
		reviewPrefix: "code_review", retrospectPrefix: "dev_retrospect",
		deliverables: ["changes/evidence/test_results.md"],
		reviewMode: "模式二：编码评审（审查代码实现是否满足 spec）",
	},
	{
		phase: 4, name: "Test", skillName: "xyz-harness-phase-test",
		reviewPrefix: "test_review", retrospectPrefix: "test_retrospect",
		deliverables: ["changes/evidence/test_execution.json"],
		reviewMode: "模式三：测试评审（审查测试覆盖度和质量）",
	},
	{
		phase: 5, name: "PR", skillName: "xyz-harness-phase-pr",
		reviewPrefix: "pr_review", retrospectPrefix: "overall_retrospect",
		deliverables: ["changes/evidence/pr_evidence.md", "changes/evidence/ci_results.md"],
		reviewMode: "编码评审（审查 PR 变更完整性和 CI 结果）",
	},
];

// Gate check script lives alongside this extension (resolved from this file's location)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GATE_SCRIPT_PATH = path.join(__dirname, "gate-check.py");

// ─── State ───────────────────────────────────────────────

interface WorkflowState {
	isActive: boolean;
	currentPhase: number; // 1-5
	topicDir: string;     // absolute path
	topicName: string;
	phaseResults: Record<number, "passed">;
}

const DEFAULT_STATE: WorkflowState = {
	isActive: false,
	currentPhase: 0,
	topicDir: "",
	topicName: "",
	phaseResults: {},
};

// Runtime state (not persisted)
const activeSubprocesses: ChildProcess[] = [];

// ─── Helpers ─────────────────────────────────────────────



function parseReviewVerdict(reviewPath: string): {
	verdict: string;
	mustFix: number;
} {
	if (!fs.existsSync(reviewPath)) {
		return { verdict: "fail", mustFix: -1 };
	}
	const content = fs.readFileSync(reviewPath, "utf8");
	const first = content.indexOf("---");
	const second = content.indexOf("---", first + 3);
	if (first === -1 || second === -1) {
		return { verdict: "fail", mustFix: -1 };
	}
	const yamlText = content.slice(first + 3, second).trim();
	try {
		const data = yaml.load(yamlText) as Record<string, unknown>;
		if (!data || typeof data !== "object") {
			return { verdict: "fail", mustFix: -1 };
		}

		// Extract verdict: check top-level, then review.verdict
		let verdict: string | undefined;
		if (typeof data.verdict === "string") {
			verdict = data.verdict;
		} else if (
			typeof data.review === "object" && data.review !== null &&
			typeof (data.review as Record<string, unknown>).verdict === "string"
		) {
			verdict = (data.review as Record<string, unknown>).verdict as string;
		}

		// Extract must_fix: check top-level, then statistics.must_fix
		let mustFix: number | undefined;
		if (typeof data.must_fix === "number") {
			mustFix = data.must_fix;
		} else if (
			typeof data.statistics === "object" && data.statistics !== null &&
			typeof (data.statistics as Record<string, unknown>).must_fix === "number"
		) {
			mustFix = (data.statistics as Record<string, unknown>).must_fix as number;
		}

		return {
			verdict: verdict ?? "fail",
			mustFix: mustFix ?? -1,
		};
	} catch {
		return { verdict: "fail", mustFix: -1 };
	}
}

// ─── Widget ──────────────────────────────────────────────

function updateWidget(ctx: ExtensionContext, state: WorkflowState): void {
	if (!state.isActive) {
		ctx.ui.setWidget("coding-workflow", undefined);
		ctx.ui.setStatus("coding-workflow", undefined);
		return;
	}

	const th = ctx.ui.theme;
	const lines: string[] = [];
	lines.push(th.fg("accent", `Coding Workflow: ${state.topicName}`));

	for (const p of PHASES) {
		const passed = state.phaseResults[p.phase] === "passed";
		const current = p.phase === state.currentPhase;
		let icon: string;
		if (passed) icon = th.fg("success", "✓");
		else if (current) icon = th.fg("accent", "→");
		else icon = th.fg("dim", "☐");

		const name = passed
			? th.fg("dim", p.name)
			: current
				? th.fg("text", p.name)
				: th.fg("dim", p.name);
		lines.push(
			`  ${icon} Phase ${p.phase}: ${name}${current ? " (current)" : ""}`,
		);
	}

	ctx.ui.setWidget("coding-workflow", lines);
	ctx.ui.setStatus(
		"coding-workflow",
		th.fg("accent", `Phase ${state.currentPhase}/5`),
	);
}

// ─── State persistence ───────────────────────────────────

function persistState(pi: ExtensionAPI, state: WorkflowState): void {
	pi.appendEntry("coding-workflow", {
		isActive: state.isActive,
		currentPhase: state.currentPhase,
		topicDir: state.topicDir,
		topicName: state.topicName,
		phaseResults: state.phaseResults,
	});
}

function reconstructState(ctx: ExtensionContext, state: WorkflowState): void {
	Object.assign(state, { ...DEFAULT_STATE });
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (
			entry.type === "custom" &&
			"customType" in entry &&
			(entry as any).customType === "coding-workflow"
		) {
			const data = (entry as any).data as WorkflowState | undefined;
			if (data) {
				state.isActive = data.isActive ?? false;
				state.currentPhase = data.currentPhase ?? 0;
				state.topicDir = data.topicDir ?? "";
				state.topicName = data.topicName ?? "";
				state.phaseResults = data.phaseResults ?? {};
			}
			break;
		}
	}
	// Validate restored state
	if (state.currentPhase < 0 || state.currentPhase > 5) {
		state.currentPhase = 0;
	}
	if (state.isActive && (!state.topicDir || !fs.existsSync(state.topicDir))) {
		state.isActive = false;
		state.currentPhase = 0;
		state.phaseResults = {};
	}
}

// ─── Extension entry ─────────────────────────────────────

export default function codingWorkflowExtension(pi: ExtensionAPI) {
	const state: WorkflowState = { ...DEFAULT_STATE };

	// ── Tool: coding-workflow-gate ──────────────────────────

	pi.registerTool({
		name: "coding-workflow-gate",
		label: "Coding Workflow Gate",
		description:
			"Submit your phase deliverables for validation. " +
			"Returns either PASS (with next-step instructions) or FAIL (with specific items to fix). " +
			"Keep retrying until PASS.",
		parameters: Type.Object({
			phase: Type.Number({ description: "The phase token shown in your current instructions" }),
		}),
		promptSnippet: "Submit phase deliverables for gate check",
		promptGuidelines: [
			"Call coding-workflow-gate ONLY when your phase deliverables are complete",
			"Pass the phase token exactly as shown in your instructions",
			"If gate returns FAIL: read the failure items, fix them, then call coding-workflow-gate again",
			"If gate returns PASS: follow the next-step instructions in the gate result message",
			"Do NOT call any other tools between gate PASS and following the gate result instructions",
		],
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			if (!state.isActive) {
				return {
					text: `No active workflow. Say /coding-workflow <topic> to start one.`,
					isError: true,
				};
			}
			if (params.phase !== state.currentPhase) {
				return {
					content: [{
						type: "text",
						text: `Wrong phase token. Use the phase token from your current instructions.`,
					}],
					isError: true,
				};
			}

			const phaseConfig = PHASES[params.phase - 1];

			// 1. Run gate script
			const gateResult = await runGateScript(GATE_SCRIPT_PATH, state.topicDir, params.phase);
			if (!gateResult.passed) {
				return {
					content: [{
						type: "text",
						text: `Gate FAILED. The following issues must be fixed:\n\n${gateResult.output}\n\nFix each item above, then call coding-workflow-gate(phase=${params.phase}) again.`,
					}],
					isError: true,
				};
			}

			// 2. Dispatch review subagent
			let reviewResult;
			try {
				reviewResult = await dispatchReviewSubagent(
					phaseConfig, state.topicDir,
					skillResolver, signal, onUpdate,
					activeSubprocesses,
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{
						type: "text",
						text: `Failed to dispatch review subagent: ${msg}\n\nGate script passed. You can retry by calling coding-workflow-gate(phase=${params.phase}) again.`,
					}],
					isError: true,
				};
			}

			if (!reviewResult.success) {
				return {
					content: [{
						type: "text",
						text: `Review subagent failed: ${reviewResult.error}\n\nGate script passed. You can retry by calling coding-workflow-gate(phase=${params.phase}) again.`,
					}],
					isError: true,
				};
			}

			// 3. Parse review verdict
			const { verdict, mustFix } = parseReviewVerdict(reviewResult.reviewPath);
			if (mustFix > 0 || verdict !== "pass") {
				let reviewContent = "";
				try {
					reviewContent = fs.readFileSync(reviewResult.reviewPath, "utf8");
				} catch { /* ignore */ }
				return {
					content: [{
						type: "text",
						text: `Gate PASSED. Review found issues (verdict=${verdict}, must_fix=${mustFix}).\n\nReview file: ${reviewResult.reviewPath}\n\n${reviewContent.slice(0, 4000)}\n\nFix the MUST_FIX issues above, then call coding-workflow-gate(phase=${params.phase}) again.`,
					}],
					isError: true,
				};
			}

			// 4. Retrospect is now done in main agent context — send followUp
			//    State is updated after gate passes; retrospect file check happens in phase-start.

			// Guard: abort may have reset state during async operations
			if (!state.isActive) {
				return {
					content: [{ type: "text", text: "Workflow was aborted during gate check." }],
					isError: true,
				};
			}

			// 5. Update state
			state.phaseResults[params.phase] = "passed";
			persistState(pi, state);
			updateWidget(ctx, state);

			const usageLine = reviewResult.result
				? formatUsageStats(reviewResult.result.usage, reviewResult.result.model)
				: "";

			// Send followUp instructing main agent to write retrospect
			// (main agent has full conversation history for higher-quality retrospective)
			const retrospectFollowUp = buildRetrospectFollowUp(phaseConfig, state.topicDir, skillResolver, PHASES);

			if (params.phase >= 5) {
				pi.sendUserMessage(
					retrospectFollowUp + `\n\n这是最后一个 phase，写完复盘后工作流结束。`,
					{ deliverAs: "followUp" },
				);
				return {
					content: [{
						type: "text",
						text: `Gate PASSED. All deliverables verified.${usageLine ? ` ${usageLine}` : ""}\n\n按 followUp 指令写完复盘后，工作流结束。`,
					}],
				};
			}

			pi.sendUserMessage(retrospectFollowUp, { deliverAs: "followUp" });
			return {
				content: [{
					type: "text",
					text: `Gate PASSED. Review: verdict=pass, must_fix=0.${usageLine ? ` ${usageLine}` : ""}\n\nIMPORTANT: 按 followUp 指令写完复盘后，再调用 coding-workflow-phase-start() 进入下一阶段。`,
				}],
			};
		},

		renderCall(args, theme) {
			const phaseConfig = PHASES[(args.phase as number) - 1];
			return new Text(
				theme.fg("toolTitle", theme.bold("coding-workflow-gate ")) +
				theme.fg("accent", `Phase ${args.phase} (${phaseConfig?.name ?? "?"})`) +
				theme.fg("muted", ` ${state.topicDir || ""}`),
				0, 0,
			);
		},

		renderResult(result, _opts, theme) {
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			const icon = result.isError
				? theme.fg("error", "✗")
				: theme.fg("success", "✓");
			const preview = text.split("\n").slice(0, 10).join("\n");
			return new Text(`${icon} ${preview}`, 0, 0);
		},
	});

	// ── Tool: coding-workflow-phase-start ──────────────────

	pi.registerTool({
		name: "coding-workflow-phase-start",
		label: "Coding Workflow Phase Start",
		description:
			"Proceed after gate check passes. No parameters. " +
			"Call this ONLY when the gate result message explicitly tells you to.",
		parameters: Type.Object({}),
		promptSnippet: "Proceed after gate check passes",
		promptGuidelines: [
			"Call coding-workflow-phase-start ONLY when the gate result message says to do so",
			"No parameters needed",
			"Do NOT call this if gate returned FAIL — fix issues and retry gate instead",
		],
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (!state.isActive) {
				return {
					text: `No active workflow.`,
					isError: true,
				};
			}

			if (state.phaseResults[state.currentPhase] !== "passed") {
				return {
					content: [{
						type: "text",
						text: `Gate check has not passed yet. Call coding-workflow-gate(phase=${state.currentPhase}) first.`,
					}],
					isError: true,
				};
			}

			// Safety net: check that the retrospect file was created
			const prevPhaseConfig = PHASES[state.currentPhase - 1];
			if (prevPhaseConfig) {
				const retrospectPath = path.join(
					state.topicDir, "changes", "reviews",
					`${prevPhaseConfig.retrospectPrefix}.md`,
				);
				if (!fs.existsSync(retrospectPath)) {
					return {
						content: [{
							type: "text",
							text:
								`BLOCKED: Phase ${state.currentPhase} retrospect file not found:\n` +
								`  ${retrospectPath}\n\n` +
								`This means the retrospect was not written during the previous step.\n` +
								`Options:\n` +
								`1. Read the harness-retrospect skill and write the retrospect now, then call coding-workflow-phase-start() again\n` +
								`2. Create retrospect file manually, then call coding-workflow-phase-start() again`,
						}],
						isError: true,
					};
				}
			}

			// Advance phase
			state.currentPhase += 1;
			persistState(pi, state);
			updateWidget(ctx, state);

			// Check if all phases done
			if (state.currentPhase > 5) {
				state.isActive = false;
				state.currentPhase = 0;
				state.phaseResults = {};
				persistState(pi, state);
				updateWidget(ctx, state);
				return {
					content: [{ type: "text", text: "Workflow complete. No further action needed." }],
				};
			}

			const nextPhaseConfig = PHASES[state.currentPhase - 1];
			const customInstructions =
				`Transitioning to Phase ${state.currentPhase}: ${nextPhaseConfig.name}. ` +
				`Topic directory: ${state.topicDir}. ` +
				`Previous phase deliverables are in ${state.topicDir}.`;

			ctx.compact({
				customInstructions,
				onComplete: () => {
					pi.sendUserMessage(
						`New task instructions injected. Read them, produce deliverables, then call coding-workflow-gate(phase=${state.currentPhase}).`,
						{ deliverAs: "followUp" },
					);
				},
				onError: (error) => {
					console.warn(`[coding-workflow] Compact failed: ${error.message}`);
					pi.sendUserMessage(
						`New task instructions injected. Read them, produce deliverables, then call coding-workflow-gate(phase=${state.currentPhase}).`,
						{ deliverAs: "followUp" },
					);
				},
			});

			return {
				content: [{
					type: "text",
					text: `Proceeding to next task. New instructions will arrive shortly.`,
				}],
			};
		},

		renderCall(_args, theme) {
			return new Text(
				theme.fg("toolTitle", theme.bold("coding-workflow-phase-start ")) +
				theme.fg("accent", `Phase ${state.currentPhase} → ${state.currentPhase + 1}`),
				0, 0,
			);
		},

		renderResult(result, _opts, theme) {
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			const icon = result.isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
			return new Text(`${icon} ${text}`, 0, 0);
		},
	});

	// ── Command: /coding-workflow ──────────────────────────

	pi.registerCommand("coding-workflow", {
		description: "Start a coding workflow: /coding-workflow <topic>",
		handler: async (args, ctx) => {
			if (state.isActive) {
				ctx.ui.notify(
					`Workflow "${state.topicName}" is already active (Phase ${state.currentPhase}/5). Use /coding-workflow-abort to cancel.`,
					"warning",
				);
				return;
			}

			const topic = args.trim();
			if (!topic) {
				ctx.ui.notify("Usage: /coding-workflow <topic>", "warning");
				return;
			}

			// Generate topic slug
			const today = new Date().toISOString().slice(0, 10);
			const slug = topic
				.replace(/[^\w\s-]/g, "")
				.split(/\s+/)
				.slice(0, 5)
				.join("-")
				.toLowerCase()
				.slice(0, 60);
			const topicName = `${today}-${slug}`;

			// Create topic directory
			const topicDir = path.join(process.cwd(), ".xyz-harness", topicName);
			try {
				fs.mkdirSync(path.join(topicDir, "changes", "reviews"), { recursive: true });
				fs.mkdirSync(path.join(topicDir, "changes", "evidence"), { recursive: true });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Failed to create topic directory: ${msg}`, "error");
				return;
			}

			// Initialize state
			state.isActive = true;
			state.currentPhase = 1;
			state.topicDir = topicDir;
			state.topicName = topicName;
			state.phaseResults = {};
			persistState(pi, state);
			updateWidget(ctx, state);

			ctx.ui.notify(`Coding workflow started: ${topicName}`, "info");

			pi.sendUserMessage(
				`Workflow "${topicName}" initialized. Workspace: ${topicDir}\n\n` +
				`Task instructions will be injected shortly. Read them, produce deliverables, ` +
				`then call coding-workflow-gate(phase=1).`,
				{ deliverAs: "followUp" },
			);
		},
	});

	// ── Command: /coding-workflow-status ───────────────────

	pi.registerCommand("coding-workflow-status", {
		description: "Show current coding workflow status",
		handler: async (_args, ctx) => {
			if (!state.isActive) {
				ctx.ui.notify("No active coding workflow.", "info");
				return;
			}
			const passed = Object.keys(state.phaseResults)
				.map(Number)
				.sort();
			const lines = [
				`Workflow: ${state.topicName}`,
				`Current Phase: ${state.currentPhase}/5 (${PHASES[state.currentPhase - 1]?.name ?? "?"})`,
				`Topic Dir: ${state.topicDir}`,
				`Passed Phases: ${passed.length > 0 ? passed.join(", ") : "none"}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// ── Command: /coding-workflow-abort ────────────────────

	pi.registerCommand("coding-workflow-abort", {
		description: "Abort current coding workflow, kill subprocesses, reset state",
		handler: async (_args, ctx) => {
			if (!state.isActive) {
				ctx.ui.notify("No active coding workflow.", "info");
				return;
			}

			// Kill all active subprocesses
			for (const proc of activeSubprocesses) {
				try {
					proc.kill("SIGTERM");
				} catch { /* already dead */ }
			}
			activeSubprocesses.length = 0;

			// Reset state
			Object.assign(state, { ...DEFAULT_STATE });
			persistState(pi, state);
			updateWidget(ctx, state);
			ctx.ui.notify("Coding workflow aborted.", "info");
		},
	});

	// ── Event: before_agent_start ──────────────────────────

	pi.on("before_agent_start", async (event, _ctx) => {
		if (!state.isActive) return;

		const phaseConfig = PHASES[state.currentPhase - 1];
		if (!phaseConfig) return;

		// Ingest skills for use by gate tool's dispatchReviewSubagent
		skillResolver.setSkills(
			(event.systemPromptOptions?.skills ?? []) as Array<{
				name: string;
				filePath: string;
			}>,
		);

		let skillContent: string;
		try {
			skillContent = skillResolver.resolve(phaseConfig.skillName);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				message: {
					customType: "coding-workflow-context",
					content: `[CODING WORKFLOW ERROR] Cannot load skill "${phaseConfig.skillName}": ${msg}. Check skill installation.`,
					display: false,
				},
			};
		}

		let injection =
			`[CODING WORKFLOW]\n\n` +
			`Current Task: ${phaseConfig.name}\n` +
			`Workspace: ${state.topicDir}\n\n` +
			`YOUR GOAL:\n` +
			`1. Read the skill instructions below carefully\n` +
			`2. Produce all required deliverables\n` +
			`3. Call coding-workflow-gate(phase=${state.currentPhase}) to submit\n\n` +
			`RULES:\n` +
			`- ONLY do what the skill below tells you to do\n` +
			`- Do NOT skip ahead, plan ahead, or do anything outside the skill scope\n` +
			`- If gate returns FAIL: fix the specific items listed, then retry\n` +
			`- If gate returns PASS: follow the instructions in the gate result message exactly\n\n` +
			`--- Skill Instructions ---\n${skillContent}\n--- End Skill Instructions ---`;

		// Phase 5 special constraint
		if (state.currentPhase === 5) {
			injection +=
				`\n\nCRITICAL RULE:\n` +
				`- You MUST NOT merge the PR. Create it, verify CI, produce evidence — nothing more.`;
		}

		return {
			message: {
				customType: "coding-workflow-context",
				content: injection,
				display: false,
			},
		};
	});

	// ── Event: session_start ───────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		reconstructState(ctx, state);
		updateWidget(ctx, state);
	});

	// ── Event: turn_end ────────────────────────────────────

	pi.on("turn_end", async (_event, ctx) => {
		if (!state.isActive) return;
		updateWidget(ctx, state);
	});

	// ── Message renderer ───────────────────────────────────

	pi.registerMessageRenderer(
		"coding-workflow-context",
		(message, _options, theme) => {
			return new Text(
				theme.fg("accent", "[CODING WORKFLOW] ") +
				theme.fg("dim", "Phase instructions injected"),
				0, 0,
			);
		},
	);
}
