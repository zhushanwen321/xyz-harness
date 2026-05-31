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
import { runGateScript } from "./lib/gate-runner.js";
import { dispatchReviewSubagent, buildRetrospectFollowUp } from "./lib/review-dispatcher.js";

import * as yaml from "js-yaml";
import { SkillResolver } from "./lib/skill-resolver.js";

// ─── Module-level skill resolver ─────────────────────────

const skillResolver = new SkillResolver();

// ─── Phase definitions ───────────────────────────────────

interface PhaseConfig {
	phase: number;
	name: string;
	skillName: string;
	reviewPrefix: string | string[];
	retrospectPrefix: string;
	/** Phase-specific deliverable file paths (relative to topicDir) */
	deliverables: string[];
	/** Review mode description (used by task review in skills, not gate review) */
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
		deliverables: ["plan.md", "e2e-test-plan.md", "test_cases_template.json", "use-cases.md", "non-functional-design.md"],
		reviewMode: "模式一：计划评审（审查 plan 可行性）",
	},
	{
		phase: 3, name: "Dev", skillName: "xyz-harness-phase-dev",
		reviewPrefix: ["business_logic_review", "standards_review", "robustness_review", "integration_review", "taste_review"], retrospectPrefix: "dev_retrospect",
		deliverables: ["changes/evidence/test_results.md"],
		reviewMode: "模式二：编码评审（审查代码实现是否满足 spec）",
	},
	{
		phase: 4, name: "Test", skillName: "xyz-harness-phase-test",
		reviewPrefix: "", retrospectPrefix: "test_retrospect",
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
	gateInProgress: boolean;   // mutex: prevent concurrent gate calls
	gateRetryCount: number;    // per-phase gate retry counter
	compactRetryCount: number; // per-phase phase-start retry counter (compact failures)
	pendingInit: boolean;      // waiting for AI to generate slug and call init tool
	pendingRequirement: string; // requirement text waiting for init
}

const DEFAULT_STATE: WorkflowState = {
	isActive: false,
	currentPhase: 0,
	topicDir: "",
	topicName: "",
	phaseResults: {},
	gateInProgress: false,
	gateRetryCount: 0,
	compactRetryCount: 0,
	pendingInit: false,
	pendingRequirement: "",
};

const MAX_GATE_RETRIES = 10;  // per phase
const MAX_COMPACT_RETRIES = 3; // per phase-start

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
		pendingInit: state.pendingInit,
		pendingRequirement: state.pendingRequirement,
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
				// gateInProgress always reset on reconstruct — stale mutex from crash would block all gate calls
				state.gateInProgress = false;
				state.gateRetryCount = 0;
				state.compactRetryCount = data.compactRetryCount ?? 0;
				state.pendingInit = data.pendingInit ?? false;
				state.pendingRequirement = data.pendingRequirement ?? "";
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
	// Validate phaseResults consistency: all phases before currentPhase must be "passed"
	if (state.isActive && state.currentPhase > 1) {
		for (let p = 1; p < state.currentPhase; p++) {
			if (state.phaseResults[p] !== "passed") {
				// State is inconsistent — roll back to last consistent phase
				state.currentPhase = p;
				// Remove any phaseResults after the gap
				for (const key of Object.keys(state.phaseResults)) {
					if (Number(key) >= p) {
						delete state.phaseResults[Number(key)];
					}
				}
				break;
			}
		}
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
			if (state.pendingInit) {
				return {
					content: [{ type: "text", text: "Workflow is pending initialization. Call coding-workflow-init first to set the slug." }],
					isError: true,
				};
			}
			if (!state.isActive) {
				return {
					content: [{ type: "text", text: `No active workflow. Say /coding-workflow <topic> to start one.` }],
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

			// Verify ALL prior phases have passed
			for (let p = 1; p < state.currentPhase; p++) {
				if (state.phaseResults[p] !== "passed") {
					return {
						content: [{
							type: "text",
							text: `BLOCKED: Phase ${p} (${PHASES[p - 1]!.name}) has not passed yet. All prior phases must pass before this gate.`,
						}],
						isError: true,
					};
				}
			}

			// Verify ALL prior phases have review files (Phase 3+ only)
			if (state.currentPhase >= 3) {
				const missingReviews: string[] = [];
				for (let p = 1; p < state.currentPhase; p++) {
					const prevConfig = PHASES[p - 1]!;
					const prefixes = Array.isArray(prevConfig.reviewPrefix) ? prevConfig.reviewPrefix : prevConfig.reviewPrefix ? [prevConfig.reviewPrefix] : [];
					if (prefixes.length > 0) {
						const reviewsDir = path.join(state.topicDir, "changes", "reviews");
						if (fs.existsSync(reviewsDir)) {
							const files = fs.readdirSync(reviewsDir);
							for (const prefix of prefixes) {
								const hasReview = files.some(f =>
									f.startsWith(prefix + "_v") && f.endsWith(".md"),
								);
								if (!hasReview) {
									missingReviews.push(`Phase ${p} (${prevConfig.name}): no ${prefix}_v*.md found`);
								}
							}
						} else {
							missingReviews.push(`Phase ${p} (${prevConfig.name}): reviews/ directory not found`);
						}
					}
				}
				if (missingReviews.length > 0) {
					const fixInstructions = missingReviews.map((m) => `  - ${m}`).join("\n");
					return {
						content: [{
							type: "text",
							text:
								`BLOCKED: Reviews are mandatory and cannot be skipped.\n\n` +
								`Missing reviews:\n${fixInstructions}\n\n` +
								`All prior phases must have review files before proceeding.`,
						}],
						isError: true,
					};
				}
			}

			// Mutex: prevent concurrent gate calls
			if (state.gateInProgress) {
				return {
					content: [{
						type: "text",
						text: `Gate check is already in progress. Wait for it to finish before retrying.`,
					}],
					isError: true,
				};
			}

			// Retry limit
			if (state.gateRetryCount >= MAX_GATE_RETRIES) {
				return {
					content: [{
						type: "text",
							text:
							`Gate retry limit reached (${MAX_GATE_RETRIES}) for Phase ${params.phase}. ` +
							`This usually means there are persistent issues that need manual intervention.\n\n` +
							`Options:\n` +
							`1. Use /coding-workflow-abort to cancel and start over\n` +
							`2. Manually inspect the deliverables and fix the root cause`,
					}],
					isError: true,
				};
			}

			// Idempotency: if gate already passed, check retrospect status and guide accordingly
			if (state.phaseResults[params.phase] === "passed") {
				const phaseConfig = PHASES[params.phase - 1]!;
				const retrospectPath = path.join(
					state.topicDir, "changes", "reviews",
					`${phaseConfig.retrospectPrefix}.md`,
				);
				const retrospectExists = fs.existsSync(retrospectPath) && (() => {
					const content = fs.readFileSync(retrospectPath, "utf8");
					const fmFirst = content.indexOf("---");
					const fmSecond = content.indexOf("---", fmFirst + 3);
					if (fmFirst < 0 || fmSecond < 0) return false;
					try {
						const fmData = yaml.load(content.slice(fmFirst + 3, fmSecond)) as Record<string, unknown>;
						return typeof fmData?.verdict === "string";
					} catch { return false; }
				})();

				if (retrospectExists) {
					// Gate passed + retrospect done — just need phase-start
					return {
						content: [{
							type: "text",
							text: `Gate 已通过，复盘已存在（${retrospectPath}）。直接调用 coding-workflow-phase-start() 进入下一阶段。`,
						}],
					};
				} else {
					// Gate passed but retrospect missing (steer was lost) — re-send steer
					const retrospectFollowUp = buildRetrospectFollowUp(phaseConfig, state.topicDir, skillResolver, PHASES);
					pi.sendUserMessage(retrospectFollowUp, { deliverAs: "steer" });
					return {
						content: [{
							type: "text",
							text: `Gate 已通过，但复盘缺失。按 steer 指令写复盘，然后调用 coding-workflow-phase-start()。`,
						}],
					};
				}
			}

			state.gateInProgress = true;
			state.gateRetryCount += 1;
			persistState(pi, state);

			const phaseConfig = PHASES[params.phase - 1];

			// 1. Run gate script
			const gateResult = await runGateScript(GATE_SCRIPT_PATH, state.topicDir, params.phase);
			if (!gateResult.passed) {
				state.gateInProgress = false;
				persistState(pi, state);
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
				state.gateInProgress = false;
				persistState(pi, state);
				return {
					content: [{
						type: "text",
						text: `Failed to dispatch review subagent: ${msg}\n\nGate script passed. You can retry by calling coding-workflow-gate(phase=${params.phase}) again.`,
					}],
					isError: true,
				};
			}

			if (!reviewResult.success) {
				state.gateInProgress = false;
				persistState(pi, state);
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
				state.gateInProgress = false;
				persistState(pi, state);
				return {
					content: [{
						type: "text",
						text: `Gate PASSED. Review found issues (verdict=${verdict}, must_fix=${mustFix}).\n\nReview file: ${reviewResult.reviewPath}\n\n${reviewContent.slice(0, 4000)}\n\nFix the MUST_FIX issues above, then call coding-workflow-gate(phase=${params.phase}) again.`,
					}],
					isError: true,
				};
			}

			// 4. Retrospect is now done in main agent context — send steer
			//    State is updated after gate passes; retrospect file check happens in phase-start.

			// Guard: abort may have reset state during async operations
			if (!state.isActive) {
				state.gateInProgress = false;
				persistState(pi, state);
				return {
					content: [{ type: "text", text: "Workflow was aborted during gate check." }],
					isError: true,
				};
			}

			// 5. Update state — reset retry counters on success
			state.gateInProgress = false;
			state.gateRetryCount = 0;
			state.phaseResults[params.phase] = "passed";
			persistState(pi, state);
			updateWidget(ctx, state);

			const usageLine = reviewResult.result
				? formatUsageStats(reviewResult.result.usage, reviewResult.result.model)
				: "";

			// Send steer instructing main agent to write retrospect
			// (main agent has full conversation history for higher-quality retrospective)
			const retrospectFollowUp = buildRetrospectFollowUp(phaseConfig, state.topicDir, skillResolver, PHASES);

			if (params.phase >= 5) {
				pi.sendUserMessage(
					retrospectFollowUp + `\n\n这是最后一个 phase，写完复盘后工作流结束。`,
					{ deliverAs: "steer" },
				);
				return {
					content: [{
						type: "text",
						text: `Gate PASSED. All deliverables verified.${usageLine ? ` ${usageLine}` : ""}\n\n按 steer 指令写完复盘后，工作流结束。`,
					}],
				};
			}

			pi.sendUserMessage(retrospectFollowUp, { deliverAs: "steer" });
			return {
				content: [{
					type: "text",
					text: `Gate PASSED. Review: verdict=pass, must_fix=0.${usageLine ? ` ${usageLine}` : ""}\n\nIMPORTANT: 按 steer 指令写完复盘后，再调用 coding-workflow-phase-start() 进入下一阶段。`,
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

	// ── Tool: coding-workflow-init ────────────────────────────

	pi.registerTool({
		name: "coding-workflow-init",
		label: "Coding Workflow Init",
		description:
			"Initialize the coding workflow with a generated slug. " +
			"Call this after reviewing the requirement and generating an appropriate short slug. " +
			"This creates the workspace directory and starts Phase 1.",
		parameters: Type.Object({
			slug: Type.String({
				description:
					"A short, descriptive, English slug for the topic (e.g. 'cart-coupon', 'user-auth'). " +
					"Lowercase, hyphen-separated, max 60 chars. " +
					"Must accurately summarize the core requirement.",
			}),
		}),
		promptSnippet: "Initialize workflow with generated slug",
		promptGuidelines: [
			"Call coding-workflow-init AFTER reviewing the requirement and generating a slug",
			"The slug must be English, lowercase, hyphen-separated, concise",
			"Do NOT include date prefix — it is added automatically",
		],
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!state.pendingInit) {
				return {
					content: [{ type: "text", text: "No pending workflow initialization. Use /coding-workflow to start one." }],
					isError: true,
				};
			}

			// Validate slug format
			const slug = params.slug
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 60);

			if (!slug || slug.length < 2) {
				return {
					content: [{ type: "text", text: "Slug is too short or empty after normalization. Provide a meaningful English slug." }],
					isError: true,
				};
			}

			const today = new Date().toISOString().slice(0, 10);
			const topicName = `${today}-${slug}`;
			const topicDir = path.join(process.cwd(), ".xyz-harness", topicName);

			// Check for directory collision
			if (fs.existsSync(topicDir)) {
				return {
					content: [{ type: "text", text: `Directory already exists: ${topicDir}. Choose a different slug.` }],
					isError: true,
				};
			}

			// Create topic directory
			try {
				fs.mkdirSync(path.join(topicDir, "changes", "reviews"), { recursive: true });
				fs.mkdirSync(path.join(topicDir, "changes", "evidence"), { recursive: true });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Failed to create topic directory: ${msg}` }],
					isError: true,
				};
			}

			// Transition from pending to active
			state.pendingInit = false;
			state.pendingRequirement = "";
			state.isActive = true;
			state.currentPhase = 1;
			state.topicDir = topicDir;
			state.topicName = topicName;
			state.phaseResults = {};
			persistState(pi, state);
			updateWidget(ctx, state);

			ctx.ui.notify(`Coding workflow initialized: ${topicName}`, "info");

			return {
				content: [{
					type: "text",
					text:
						`Workflow initialized: ${topicName}\n` +
						`Workspace: ${topicDir}\n\n` +
						`Phase 1 skill instructions will be injected automatically. ` +
						`Follow the skill to produce spec.md, then call coding-workflow-gate(phase=1).`,
				}],
			};
		},

		renderCall(args, theme) {
			return new Text(
				theme.fg("toolTitle", theme.bold("coding-workflow-init ")) +
				theme.fg("accent", String(args.slug ?? "?")),
				0, 0,
			);
		},

		renderResult(result, _opts, theme) {
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			const icon = result.isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
			return new Text(`${icon} ${text.split("\n")[0]}`, 0, 0);
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
			if (state.pendingInit) {
				return {
					content: [{ type: "text", text: "Workflow is pending initialization. Call coding-workflow-init first to set the slug." }],
					isError: true,
				};
			}
			if (!state.isActive) {
				return {
					content: [{ type: "text", text: `No active workflow.` }],
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

			// Safety net: check ALL prior phases' retrospect files
			const missingRetrospects: string[] = [];
			for (let p = 1; p < state.currentPhase; p++) {
				const prevConfig = PHASES[p - 1]!;
				const retrospectPath = path.join(
					state.topicDir, "changes", "reviews",
					`${prevConfig.retrospectPrefix}.md`,
				);
				if (!fs.existsSync(retrospectPath)) {
					missingRetrospects.push(`Phase ${p} (${prevConfig.name}): ${retrospectPath}`);
				} else {
					const rContent = fs.readFileSync(retrospectPath, "utf8");
					const fmFirst = rContent.indexOf("---");
					const fmSecond = rContent.indexOf("---", fmFirst + 3);
					let hasValidVerdict = false;
					if (fmFirst >= 0 && fmSecond > fmFirst) {
						try {
							const fmData = yaml.load(rContent.slice(fmFirst + 3, fmSecond)) as Record<string, unknown>;
							hasValidVerdict = typeof fmData?.verdict === "string";
						} catch { /* treat as invalid */ }
					}
					if (!hasValidVerdict) {
						missingRetrospects.push(`Phase ${p} (${prevConfig.name}): frontmatter 缺少 verdict — ${retrospectPath}`);
					}
				}
			}
			if (missingRetrospects.length > 0) {
				const fixInstructions = missingRetrospects.map((m) => `  - ${m}`).join("\n");
				return {
					content: [{
						type: "text",
						text:
							`BLOCKED: Retrospect check failed. Missing or invalid:\n\n` +
							`${fixInstructions}\n\n` +
							`Read harness-retrospect skill, write the missing retrospects, then call coding-workflow-phase-start() again.`,
					}],
					isError: true,
				};
			}

			// Compact retry limit
			if (state.compactRetryCount >= MAX_COMPACT_RETRIES) {
				return {
					content: [{
						type: "text",
							text:
							`Phase-start retry limit reached (${MAX_COMPACT_RETRIES}). ` +
							`Compact keeps failing, context isolation cannot be guaranteed.\n\n` +
							`Options:\n` +
							`1. Use /coding-workflow-abort to cancel\n` +
							`2. Restart the Pi session manually and resume the workflow`,
					}],
					isError: true,
				};
			}

			// Advance phase
			state.compactRetryCount += 1;
			state.currentPhase += 1;
			persistState(pi, state);
			updateWidget(ctx, state);

			// Check if all phases done
			if (state.currentPhase > 5) {
				state.isActive = false;
				state.currentPhase = 0;
				state.phaseResults = {};
				state.gateInProgress = false;
				state.gateRetryCount = 0;
				state.compactRetryCount = 0;
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
					state.compactRetryCount = 0;
					persistState(pi, state);
					pi.sendUserMessage(
						`New task instructions injected. Read them, produce deliverables, then call coding-workflow-gate(phase=${state.currentPhase}).`,
						{ deliverAs: "steer" },
					);
				},
				onError: (error) => {
					console.warn(`[coding-workflow] Compact failed: ${error.message}`);
					// Rollback phase advancement — context isolation failed
					state.currentPhase -= 1;
					persistState(pi, state);
					updateWidget(ctx, state);
					pi.sendUserMessage(
						`Compact failed (attempt ${state.compactRetryCount}/${MAX_COMPACT_RETRIES}): ${error.message}\n\n` +
						`Gate 已通过，复盘已完成。只需调用 coding-workflow-phase-start() 重试 compact。\n` +
						`不需要重新做 phase 工作，也不需要重新调 gate。`,
						{ deliverAs: "steer" },
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

	/**
	 * Extract recent user messages from the current session branch.
	 * Returns up to 5 most recent user messages in chronological order.
	 */
	function extractRecentUserMessages(ctx: {
		sessionManager: { getBranch(): unknown[] };
	}): string[] {
		const branch = ctx.sessionManager.getBranch() as Array<{
			type: string;
			message?: {
				role: string;
				content: string | Array<{ type: string; text: string }>;
			};
		}>;
		const userMessages: string[] = [];

		for (const entry of branch) {
			if (entry.type === "message" && entry.message?.role === "user") {
				const content = entry.message.content;
				if (typeof content === "string") {
					userMessages.push(content);
				} else if (Array.isArray(content)) {
					const texts = content
						.filter((c) => c.type === "text")
						.map((c) => c.text);
					if (texts.length > 0) {
						userMessages.push(texts.join("\n"));
					}
				}
			}
		}

		// branch returns leaf\u2192root, reverse to get chronological, take last 5
		userMessages.reverse();
		return userMessages.slice(-5);
	}

	pi.registerCommand("coding-workflow", {
		description: "Start a coding workflow: /coding-workflow [requirement]. " +
			"With no args, extracts requirement from conversation context. " +
			"AI generates slug, then calls coding-workflow-init to finalize.",
		handler: async (args, ctx) => {
			if (state.isActive) {
				ctx.ui.notify(
					`Workflow "${state.topicName}" is already active (Phase ${state.currentPhase}/5). Use /coding-workflow-abort to cancel.`,
					"warning",
				);
				return;
			}

			if (state.pendingInit) {
				ctx.ui.notify(
					"A workflow initialization is already pending. Generate a slug and call coding-workflow-init.",
					"warning",
				);
				return;
			}

			const trimmed = args.trim();

			// No-args mode: verify conversation context exists before proceeding
			if (!trimmed) {
				const messages = extractRecentUserMessages(ctx);
				if (messages.length === 0) {
					ctx.ui.notify(
						"No conversation context found. Provide a requirement: /coding-workflow <requirement>",
						"warning",
					);
					return;
				}
			}

			// Store requirement, set pending state
			state.pendingInit = true;
			state.pendingRequirement = trimmed || "(from conversation context)";
			persistState(pi, state);

			ctx.ui.notify("Coding workflow: requirement captured, waiting for slug generation.", "info");

			// Build requirement context for AI
			// NOTE: command handler intercepts the original user input (input event is skipped),
			// so the AI never sees the raw requirement text in conversation history.
			// We must include it explicitly in the injected message.
			let requirementContext: string;
			if (trimmed) {
				requirementContext =
					`用户的需求如下：\n\n---\n${trimmed}\n---\n\n` +
					`请根据以上需求，生成一个简短的英文 slug（小写、连字符分隔，不超过 60 字符），\n` +
					`然后调用 coding-workflow-init(slug="你的slug") 完成初始化。`;
			} else {
				const messages = extractRecentUserMessages(ctx);
				const recentContext = messages.length > 0
					? `\n\n---\n以下是最近的用户消息摘要：\n${messages.map((m, i) => `[${i + 1}] ${m.slice(0, 500)}`).join("\n")}\n---\n`
					: "";
				requirementContext =
					`请根据之前对话中讨论的需求，生成一个简短的英文 slug。${recentContext}`;
			}

			// command handler runs while agent is idle — no deliverAs needed
			pi.sendUserMessage(
				`[CODING WORKFLOW] 需求已记录。\n\n` +
				requirementContext +
				`\n\nslug 要求：\n` +
				`- 简洁准确地概括需求核心\n` +
				`- 纯英文、小写、连字符分隔\n` +
				`- 例如：user-auth、cart-coupon、api-rate-limit\n` +
				`- 不要包含日期前缀（系统自动添加）`
			);
		},
	});

	// ── Command: /coding-workflow-status ───────────────────

	pi.registerCommand("coding-workflow-status", {
		description: "Show current coding workflow status",
		handler: async (_args, ctx) => {
			if (state.pendingInit) {
				ctx.ui.notify("Workflow pending initialization. Generate a slug and call coding-workflow-init.", "info");
				return;
			}
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
			if (state.pendingInit) {
				state.pendingInit = false;
				state.pendingRequirement = "";
				persistState(pi, state);
				ctx.ui.notify("Pending workflow initialization cancelled.", "info");
				return;
			}
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

// ── Helper: check project protection level ──────────────

function checkProjectProtection(projectRoot: string): string[] {
	const warnings: string[] = [];

	// Skip if project root doesn't look right
	if (!projectRoot || !fs.existsSync(projectRoot)) return warnings;

	// Check TypeScript strict
	const tsconfigPath = path.join(projectRoot, "tsconfig.json");
	if (fs.existsSync(tsconfigPath)) {
		try {
			const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
			if (!tsconfig.compilerOptions?.strict) {
				warnings.push("tsconfig.json 未开启 strict 模式");
			}
		} catch { /* ignore */ }
	}

	// Check ESLint (TS project)
	const hasEslint =
		fs.existsSync(path.join(projectRoot, "eslint.config.mjs")) ||
		fs.existsSync(path.join(projectRoot, "eslint.config.js")) ||
		fs.existsSync(path.join(projectRoot, ".eslintrc.json"));
	if (!hasEslint) {
		const pkgPath = path.join(projectRoot, "package.json");
		if (fs.existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
				const deps = { ...pkg.devDependencies, ...pkg.dependencies } as Record<string, string>;
				if (!deps.eslint) warnings.push("ESLint 未安装或未配置");
			} catch { /* ignore */ }
		}
	}

	// Check Ruff (Python project)
	const pyprojPath = path.join(projectRoot, "pyproject.toml");
	if (fs.existsSync(pyprojPath)) {
		try {
			const content = fs.readFileSync(pyprojPath, "utf-8");
			if (!content.includes("[tool.ruff]")) {
				warnings.push("pyproject.toml 缺少 [tool.ruff] 配置");
			}
		} catch { /* ignore */ }
	}

	// Check git hook
	const hookPath = path.join(projectRoot, ".git", "hooks", "pre-commit");
	if (!fs.existsSync(hookPath)) {
		warnings.push("Git pre-commit hook 未安装");
	}

	// Check CI
	const workflowsDir = path.join(projectRoot, ".github", "workflows");
	if (!fs.existsSync(workflowsDir) || fs.readdirSync(workflowsDir).length === 0) {
		warnings.push("CI pipeline 未配置（.github/workflows/）");
	}

	return warnings;
}

// ── Event: before_agent_start ──────────────────────────

	pi.on("before_agent_start", async (event, _ctx) => {
		if (!state.isActive || state.pendingInit) return;

		const phaseConfig = PHASES[state.currentPhase - 1];
		if (!phaseConfig) return;

		// Ingest skills for use by gate tool's dispatchReviewSubagent
		const loadedSkills = (event.systemPromptOptions?.skills ?? []) as Array<{
			name: string;
			filePath: string;
		}>;
		skillResolver.setSkills(loadedSkills);

		// Check if current phase has already passed gate — compact failed and rolled back
		if (state.phaseResults[state.currentPhase] === "passed") {
			// Intermediate state: gate passed, retrospect done (or pending), waiting for phase-start
			return {
				message: {
					customType: "coding-workflow-context",
					content:
						`[CODING WORKFLOW — WAITING]\n\n` +
						`Phase ${state.currentPhase} (${phaseConfig.name}) 的 gate 已通过。\n` +
						`当前目标：调用 coding-workflow-phase-start() 进入下一阶段。\n\n` +
						`不需要做其他事情。`,
					display: true,
				},
			};
		}

		// HARD BLOCK: check ALL prior phases' retrospects before allowing current phase
		const missingRetrospects: string[] = [];
		for (let p = 1; p < state.currentPhase; p++) {
			const prevConfig = PHASES[p - 1]!;
			const retrospectPath = path.join(
				state.topicDir, "changes", "reviews",
				`${prevConfig.retrospectPrefix}.md`,
			);
			if (!fs.existsSync(retrospectPath)) {
				missingRetrospects.push(`Phase ${p} (${prevConfig.name}): ${retrospectPath}`);
			} else {
				// Also validate frontmatter integrity
				const content = fs.readFileSync(retrospectPath, "utf8");
				const fmFirst = content.indexOf("---");
				const fmSecond = content.indexOf("---", fmFirst + 3);
				let hasValidVerdict = false;
				if (fmFirst >= 0 && fmSecond > fmFirst) {
					try {
						const fmData = yaml.load(content.slice(fmFirst + 3, fmSecond)) as Record<string, unknown>;
						hasValidVerdict = typeof fmData?.verdict === "string";
					} catch { /* treat as invalid */ }
				}
				if (!hasValidVerdict) {
					missingRetrospects.push(`Phase ${p} (${prevConfig.name}): frontmatter 缺少 verdict — ${retrospectPath}`);
				}
			}
		}
		if (missingRetrospects.length > 0) {
			const retrospectSkillPath = skillResolver.resolvePath("harness-retrospect");
			const fixInstructions = missingRetrospects.map((m) => `  - ${m}`).join("\n");
			return {
				message: {
					customType: "coding-workflow-context",
					content:
						`[CODING WORKFLOW BLOCKED]\n\n` +
						`Phase ${state.currentPhase} (${phaseConfig.name}) 无法启动。以下前置 phase 的复盘缺失或不完整：\n\n` +
						`${fixInstructions}\n\n` +
						`复盘是强制性的，不能跳过。按以下步骤补齐：\n` +
						`1. read ${retrospectSkillPath} 获取复盘方法论\n` +
						`2. 对每个缺失的复盘，基于该 phase 的产出文件编写 retrospect\n` +
						`3. YAML frontmatter 必须包含 verdict 字段\n` +
						`4. 所有复盘补齐后，重新开始当前 turn（状态会自动重新检查）`,
					display: true,
				},
			};
		}

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
			`- If gate returns PASS: follow the instructions in the gate result message exactly\n` +
			`- 每个阶段完成时，必须提交并推送所有代码和文档（特别是 .xyz-harness/ 和 docs/ 目录）。确保 git status --short 无未跟踪文件后再提交\n\n` +
			`--- Skill Instructions ---\n${skillContent}\n--- End Skill Instructions ---`;

		// Phase 5 special constraint
		if (state.currentPhase === 5) {
			injection +=
				`\n\nCRITICAL RULE:\n` +
				`- You MUST NOT merge the PR. Create it, verify CI, produce evidence — nothing more.`;
		}

		// Phase 3 (dev) — project protection pre-check
		if (state.currentPhase === 3) {
			const projectRoot = path.resolve(state.topicDir, "..", "..");
			const protectionWarnings = checkProjectProtection(projectRoot);
			if (protectionWarnings.length > 0) {
				injection +=
					`\n\n⚠ PROJECT PROTECTION CHECK:\n` +
					`以下防护未就位，可能导致代码不合规或 CI 失败：\n` +
					protectionWarnings.map((w) => `  - ${w}`).join("\n") +
					`\n建议：开始编码前先补齐基础防护，参考 xyz-harness-code-standard-protection skill。`;
			}
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
		if (!state.isActive || state.pendingInit) return;
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
