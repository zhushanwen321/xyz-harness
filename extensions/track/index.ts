/**
 * track — 需求沟通阶段任务追踪器
 *
 * 固定 6 步模板，强制 AI 按序执行需求沟通流程。
 * 与 loop 不同：不强制循环，每步由用户驱动推进。
 *
 * 产出物：spec.md + plan.md + summary.md（交付给 Phase 2 的 agent）
 */
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import * as fs from "fs";

// ── Fixed Step Template ────────────────────────────────

interface TrackStep {
	id: number;
	name: string;
	description: string;
	/** 这一步必须产出的文件（相对于 .xyz-harness/{主题}/） */
	requiredOutputs: string[];
	/** 是否需要用户确认才能推进 */
	requiresConfirmation: boolean;
}

const STEPS: TrackStep[] = [
	{
		id: 1,
		name: "需求讨论",
		description: "与用户讨论需求，澄清目标、范围、约束。逐一提问确认，提出 2-3 个方案及 trade-off。",
		requiredOutputs: [],
		requiresConfirmation: false,
	},
	{
		id: 2,
		name: "Spec 编写",
		description:
			"基于讨论结果编写 spec.md。必须包含：目标、架构决策、验收标准(AC)、数据流(如涉及数据存储)、受影响文件列表。" +
			"**关键**：你的产出将交付给另一个 agent 执行，务必自包含、详细，将所有需要的文件路径都写进去。",
		requiredOutputs: ["spec.md"],
		requiresConfirmation: false,
	},
	{
		id: 3,
		name: "引用扫描",
		description:
			"运行 spec-ref-scan.sh 验证 spec 中的代码引用完整性。如发现问题，修复 spec 后重新扫描。",
		requiredOutputs: [],
		requiresConfirmation: false,
	},
	{
		id: 4,
		name: "Plan 编写",
		description:
			"基于 spec 编写 plan.md。必须包含：Task 拆分（每个 Task 粒度适中、独立可执行）、依赖关系、涉及文件列表。" +
			"**关键**：plan 是给执行 agent 的指令，每个 Task 必须包含足够的上下文（要改什么、怎么改、为什么改）。",
		requiredOutputs: ["plan.md"],
		requiresConfirmation: false,
	},
	{
		id: 5,
		name: "计划评审",
		description:
			"派遣 reviewer subagent 对 spec + plan 进行独立评审。评审报告写入 changes/reviews/plan_review_v1.md。" +
			"如有 MUST FIX，修复后重新评审（最多 3 轮）。",
		requiredOutputs: ["changes/reviews/plan_review_v1.md"],
		requiresConfirmation: false,
	},
	{
		id: 6,
		name: "用户确认",
		description:
			"向用户展示最终 spec 和 plan，等待确认。确认前必须先调用 validate_outputs 检查产出物完整性。" +
			"**自包含检查**：另一个 agent 单凭 spec.md + plan.md + 代码库，不需要任何会话上下文就能完成实现。" +
			"如果某个文件/函数/接口在 spec 中被引用但路径不完整，必须补充完整。" +
			"确认后输出完整的 Phase 2 启动指令，包含 spec.md 和 plan.md 路径，以及 6 阶段流程描述",
		requiredOutputs: ["changes/summary.md"],
		requiresConfirmation: true,
	},
];

// ── State ──────────────────────────────────────────────

interface TrackState {
	isActive: boolean;
	currentStep: number; // 1-based, 0 = not started
	completedSteps: number[]; // step ids that are done
	stallCount: number;
	requirementSummary: string; // one-line requirement description
	topicDir: string; // .xyz-harness/{yyyy-MM-dd}-{topic}/
}

const DEFAULT_STATE: TrackState = {
	isActive: false,
	currentStep: 0,
	completedSteps: [],
	stallCount: 0,
	requirementSummary: "",
	topicDir: "",
};

// ── Helpers ────────────────────────────────────────────

function ensureOutputDir(topicDir: string): string {
	const baseDir = process.cwd() + "/.xyz-harness/" + topicDir;
	try {
		fs.mkdirSync(baseDir + "/changes/reviews", { recursive: true });
	} catch (_e) {
		// non-critical, agent can create dirs via write tool
	}
	return baseDir;
}

function writeInitialSummary(topicDir: string, requirementSummary: string): void {
	const baseDir = process.cwd() + "/.xyz-harness/" + topicDir;
	const summaryPath = baseDir + "/changes/summary.md";
	if (fs.existsSync(summaryPath)) return;
	try {
		const lines: string[] = [
			"# " + requirementSummary,
			"",
			"开始时间: " + new Date().toISOString(),
			"状态: 进行中",
			"阶段: Phase 1 (需求沟通)",
			"",
			"## 产出物",
			"- [ ] spec.md",
			"- [ ] plan.md",
			"- [ ] changes/reviews/plan_review_v1.md",
			"",
			"## 交付物",
			"<!-- Phase 2 完成后更新 -->",
			"- [ ] 代码实现",
			"- [ ] 单元测试",
			"- [ ] 代码评审",
			"- [ ] 接口测试",
			"- [ ] 测试评审",
			"- [ ] 部署",
		];
		fs.writeFileSync(summaryPath, lines.join("\n"));
	} catch (_e) {
		// non-critical
	}
}

/** Build the Phase 2 launch command shown when all 6 steps complete */
function buildPhase2LaunchCommand(topicDir: string, requirement: string): string {
	const td = ".xyz-harness/" + topicDir;
	return [
		"",
		"",
		"=== Phase 1 完成 ===",
		"",
		"产出物：",
		"- spec.md: " + td + "/spec.md",
		"- plan.md: " + td + "/plan.md",
		"- 需求: " + requirement,
		"",
		"启动 Phase 2（开发交付）：",
		"1. /new 创建新 session",
		"2. 在新 session 中执行：/loop --max 20 基于以下文档继续开发需求",
		"",
		"需求: " + requirement,
		"Spec: " + td + "/spec.md",
		"Plan: " + td + "/plan.md",
		"Phase 1 产出目录: " + td + "/",
		"Phase 2 写回目录: " + td + "/changes/",
		"",
		"按以下 6 阶段流程执行(详见 skills/xyz-harness-phase2-dev/SKILL.md)：",
		"Stage 1: 编码实现 (TDD + 按 plan Task 逐个完成)",
		"Stage 2: 编码评审 (reviewer ≤2轮)",
		"Stage 3: 测试编写 (Change-driven Testing)",
		"Stage 4: 测试评审 (reviewer ≤2轮)",
		"Stage 5: 推送 + CI + 部署",
		"Stage 6: 自动复盘 (写回 Phase 1 目录)",
		"注意：每个阶段运行 harness-state.sh advance → gate-script.sh → harness-state.sh pass",
	].join("\n");
}

// ── Extension ─────────────────────────────────────────

export default function trackExtension(pi: ExtensionAPI) {
	const state: TrackState = { ...DEFAULT_STATE };

	// ── Tool: track_step ───────────────────────────────

	const TrackStepParams = Type.Object({
		action: StringEnum(["complete_step", "list_steps", "start", "validate_outputs"] as const),
		stepId: Type.Optional(Type.Number({ description: "Step ID for complete_step (1-6)" })),
		requirementSummary: Type.Optional(Type.String({ description: "Requirement summary for start" })),
		topicDir: Type.Optional(Type.String({ description: "Topic directory name (e.g. 2026-05-10-my-feature)" })),
	});

	pi.registerTool({
		name: "track_step",
		label: "Track Step Tracker",
		description:
			"管理 /track 模式的固定步骤清单。6 个步骤按序执行，完成一步标记一步。" +
			"使用 start 初始化，complete_step 标记完成，list_steps 查看进度。" +
			"只在 /track 模式激活时可用。",
		promptSnippet: "管理需求沟通阶段的固定步骤追踪",
		promptGuidelines: [
			"使用 track_step 的 start 初始化步骤追踪",
			"完成每个步骤后必须调用 track_step 的 complete_step 标记",
			"使用 track_step 的 list_steps 查看当前进度和下一步",
			"所有步骤按固定顺序执行，不可跳步",
			"你的产出(spec.md/plan.md)将交付给另一个 agent 执行开发——它没有你的会话上下文，所以文档必须自包含、详细，所有文件路径/函数名/接口/依赖关系都要写清楚",
			"在标记 Step 2(Spec)和 Step 4(Plan)完成前，检查文档是否自包含：另一个 agent 能否单凭这份文档+代码就完成实现，不需要提问",
		],
		parameters: TrackStepParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			switch (params.action) {
				case "start": {
					if (state.isActive) {
						return {
							content: [{ type: "text", text: "Track 已激活，无需重复初始化。当前步骤: " + state.currentStep }],
						};
					}
					state.isActive = true;
					state.currentStep = 1;
					state.completedSteps = [];
					state.stallCount = 0;
					state.requirementSummary = params.requirementSummary || "";
					state.topicDir = params.topicDir || "";

					if (state.topicDir) {
						ensureOutputDir(state.topicDir);
						writeInitialSummary(state.topicDir, state.requirementSummary);
					}

					const stepList = STEPS.map((s) => {
						const icon = s.id === 1 ? "→" : "☐";
						return icon + " Step " + s.id + ": " + s.name + " — " + s.description.slice(0, 80) + "...";
					}).join("\n");

					return {
						content: [{
							type: "text",
							text: "Track 已启动。固定 6 步流程：\n" + stepList + "\n\n当前: Step 1 — 从需求讨论开始。",
						}],
					};
				}

				case "complete_step": {
					if (!state.isActive) {
						return { content: [{ type: "text", text: "Track 未激活。使用 /track <需求描述> 启动。" }] };
					}
					if (params.stepId === undefined) {
						throw new Error("complete_step requires stepId");
					}
					const step = STEPS.find((s) => s.id === params.stepId);
					if (!step) {
						throw new Error("Step " + params.stepId + " not found. Valid: 1-6");
					}
					if (state.completedSteps.includes(params.stepId)) {
						return { content: [{ type: "text", text: "Step " + params.stepId + ": " + step.name + " 已完成。" }] };
					}
					if (params.stepId !== state.currentStep) {
						return {
							content: [{
								type: "text",
								text: "不能跳步。当前步骤是 Step " + state.currentStep + ": " + STEPS[state.currentStep - 1]!.name + "。请先完成当前步骤。",
							}],
						};
					}

					state.completedSteps.push(params.stepId);
					if (params.stepId < STEPS.length) {
						state.currentStep = params.stepId + 1;
					}

					const nextStep = STEPS.find((s) => s.id === params.stepId + 1);
					let msg = "✓ Step " + params.stepId + ": " + step.name + " 已完成。";
					if (nextStep) {
						msg += "\n\n下一步: Step " + nextStep.id + ": " + nextStep.name + "\n" + nextStep.description;
					} else {
						msg += buildPhase2LaunchCommand(state.topicDir, state.requirementSummary);
					}

					return { content: [{ type: "text", text: msg }] };
				}

				case "list_steps": {
					if (!state.isActive) {
						return { content: [{ type: "text", text: "Track 未激活。使用 /track <需求描述> 启动。" }] };
					}
					const lines: string[] = [];
					lines.push("需求: " + (state.requirementSummary || "(未设置)"));
					lines.push("产出目录: " + (state.topicDir || "(未设置)"));
					lines.push("");
					for (const s of STEPS) {
						const done = state.completedSteps.includes(s.id);
						const current = s.id === state.currentStep;
						let icon = "☐";
						if (done) icon = "✓";
						else if (current) icon = "→";
						const name = done ? s.name : (current ? "**" + s.name + "**" : s.name);
						lines.push(icon + " Step " + s.id + ": " + name);
						if (s.requiresConfirmation && current) {
							lines.push("   ⚠ 此步骤需要用户确认");
						}
					}
					lines.push("");
					lines.push("进度: " + state.completedSteps.length + "/" + STEPS.length);

					return { content: [{ type: "text", text: lines.join("\n") }] };
				}

				case "validate_outputs": {
					if (!state.isActive) {
						return { content: [{ type: "text", text: "Track 未激活。使用 /track <需求描述> 启动。" }] };
					}
					if (params.stepId === undefined) {
						throw new Error("validate_outputs requires stepId");
					}
					const vStep = STEPS.find((s) => s.id === params.stepId);
					if (!vStep) {
						throw new Error("Step " + params.stepId + " not found. Valid: 1-6");
					}

					const missing: string[] = [];
					const dir = state.topicDir;
					if (!dir) {
						return { content: [{ type: "text", text: "产出目录未设置。请先调用 start 初始化。" }] };
					}

					for (const output of vStep.requiredOutputs) {
						const fullPath = process.cwd() + "/.xyz-harness/" + dir + "/" + output;
						if (!fs.existsSync(fullPath)) {
							missing.push(output + " (不存在)");
						} else {
							const stat = fs.statSync(fullPath);
							if (stat.size === 0) {
								missing.push(output + " (文件为空)");
							}
						}
					}

					if (missing.length > 0) {
						return {
							content: [{ type: "text", text: "❌ Step " + params.stepId + " 缺少必要产出物：\n" + missing.join("\n") }],
						};
					}

					return {
						content: [{ type: "text", text: "✓ Step " + params.stepId + " 产出物完整性检查通过。" }],
					};
				}

				default:
					throw new Error("Unknown action: " + params.action);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("track_step ")) + theme.fg("muted", args.action);
			if (args.stepId !== undefined) text += " " + theme.fg("accent", "Step " + args.stepId);
			return new Text(text, 0, 0);
		},

		renderResult(result, _opts, theme) {
			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "", 0, 0);
		},
	});

	// ── State persistence ───────────────────────────────

	function persistState(): void {
		pi.appendEntry("track", {
			isActive: state.isActive,
			currentStep: state.currentStep,
			completedSteps: state.completedSteps,
			stallCount: state.stallCount,
			requirementSummary: state.requirementSummary,
			topicDir: state.topicDir,
		});
	}

	function reconstructState(ctx: ExtensionContext): void {
		Object.assign(state, { ...DEFAULT_STATE });
		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (
				entry.type === "custom" &&
				"customType" in entry &&
				(entry as any).customType === "track"
			) {
				const data = (entry as any).data as TrackState | undefined;
				if (data) {
					state.isActive = data.isActive ?? false;
					state.currentStep = data.currentStep ?? 0;
					state.completedSteps = data.completedSteps ?? [];
					state.stallCount = data.stallCount ?? 0;
					state.requirementSummary = data.requirementSummary ?? "";
					state.topicDir = data.topicDir ?? "";
				}
				break;
			}
		}
	}

	function updateWidget(ctx: ExtensionContext): void {
		if (!state.isActive) {
			ctx.ui.setWidget("track", undefined);
			ctx.ui.setStatus("track", undefined);
			return;
		}

		const th = ctx.ui.theme;
		const completed = state.completedSteps.length;
		const total = STEPS.length;

		ctx.ui.setStatus("track", th.fg("accent", "📋 " + completed + "/" + total + " 步骤"));

		const lines: string[] = [];
		lines.push(th.fg("accent", "📋 Track: " + completed + "/" + total + " 步骤"));
		for (const s of STEPS) {
			const done = state.completedSteps.includes(s.id);
			const current = s.id === state.currentStep;
			let icon: string;
			if (done) icon = th.fg("success", "✓");
			else if (current) icon = th.fg("accent", "→");
			else icon = th.fg("dim", "☐");
			const desc = done ? th.fg("dim", s.name) : (current ? th.fg("text", s.name) : th.fg("dim", s.name));
			lines.push(icon + " " + th.fg("accent", "Step " + s.id) + " " + desc);
		}
		ctx.ui.setWidget("track", lines);
	}

	// ── Command: /track ─────────────────────────────────

	pi.registerCommand("track", {
		description: "需求沟通阶段追踪：/track <需求描述> | /track status | /track abort | /track resume | /track redo <stepId>",

		handler: async (args, ctx) => {
			const trimmed = args.trim().toLowerCase();

			if (trimmed === "status") {
				if (!state.isActive) {
					ctx.ui.notify("Track 模式未激活。使用 /track <需求描述> 启动。", "info");
					return;
				}
				const lines: string[] = [
					"状态: 📋 活跃",
					"需求: " + state.requirementSummary,
					"产出目录: " + state.topicDir,
					"当前步骤: Step " + state.currentStep + ": " + (STEPS[state.currentStep - 1]?.name || "完成"),
					"进度: " + state.completedSteps.length + "/" + STEPS.length,
				];
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}

			if (trimmed === "resume") {
				if (!state.isActive) {
					ctx.ui.notify("Track 未激活。请先使用 /track <需求描述> 启动。", "warning");
					return;
				}
				const resumeStep = STEPS.find((s) => s.id === state.currentStep);
				if (!resumeStep) {
					ctx.ui.notify("所有步骤已完成，无需恢复。请启动 Phase 2。", "info");
					return;
				}
				ctx.ui.notify("从 Step " + state.currentStep + ": " + resumeStep.name + " 恢复", "info");
				pi.sendUserMessage(
					"Track 已恢复。继续执行 Phase 1 需求沟通。\n\n" +
					"1. 使用 track_step 的 list_steps 查看当前进度\n" +
					"2. 从当前步骤继续: Step " + state.currentStep + ": " + resumeStep.name + "\n" +
					"3. 你的产出将交付给另一个 agent 执行，务必自包含、详细\n\n" +
					"产出目录: .xyz-harness/" + state.topicDir + "/"
				);
				return;
			}

			const redoMatch = trimmed.match(/^redo\s+(\d+)$/);
			if (redoMatch) {
				if (!state.isActive) {
					ctx.ui.notify("Track 未激活。请先使用 /track <需求描述> 启动。", "warning");
					return;
				}
				const redoStepId = parseInt(redoMatch[1]!, 10);
				if (redoStepId < 1 || redoStepId > STEPS.length) {
					ctx.ui.notify("无效步骤: " + redoStepId + "。合法范围: 1-" + STEPS.length, "warning");
					return;
				}
				if (redoStepId > state.currentStep || !state.completedSteps.includes(redoStepId)) {
					ctx.ui.notify("Step " + redoStepId + " 还未完成（当前在 Step " + state.currentStep + "），无法回退", "warning");
					return;
				}
				state.completedSteps = state.completedSteps.filter((id) => id < redoStepId);
				state.currentStep = redoStepId;
				persistState();
				updateWidget(ctx);
				ctx.ui.notify("回退到 Step " + redoStepId + ": " + STEPS[redoStepId - 1]!.name, "info");
				pi.sendUserMessage(
					"Track 已回退到 Step " + redoStepId + ": " + STEPS[redoStepId - 1]!.name + "。\n\n" +
					"请重新执行此步骤。完成后调用 track_step 的 complete_step 标记 (stepId: " + redoStepId + ")。"
				);
				return;
			}

			if (trimmed === "abort") {
				if (!state.isActive) {
					ctx.ui.notify("Track 模式未激活", "info");
					return;
				}
				state.isActive = false;
				state.currentStep = 0;
				state.completedSteps = [];
				persistState();
				updateWidget(ctx);
				ctx.ui.notify("Track 已中止", "info");
				return;
			}

			if (!args.trim()) {
				ctx.ui.notify("用法: /track <需求描述> | /track status | /track abort | /track resume | /track redo <stepId>", "warning");
				return;
			}

			// 启动 track 模式
			const requirement = args.trim();
			const today = new Date().toISOString().slice(0, 10);
			const topicSlug = requirement
				.replace(/[^\w\s\u4e00-\u9fa5]/g, "")
				.split(/\s+/)
				.slice(0, 4)
				.join("-")
				.toLowerCase()
				.slice(0, 50);

			state.isActive = true;
			state.currentStep = 1;
			state.completedSteps = [];
			state.stallCount = 0;
			state.requirementSummary = requirement;
			state.topicDir = today + "-" + topicSlug;

			ensureOutputDir(state.topicDir);
			writeInitialSummary(state.topicDir, requirement);

			persistState();
			updateWidget(ctx);
			ctx.ui.notify("Track 已启动: " + requirement, "info");

			pi.sendUserMessage(
				"开始需求沟通阶段。需求: " + requirement + "\n\n" +
				"你的产出将交付给另一个 agent（Phase 2）执行开发，因此所有文档必须：\n" +
				"1. 自包含 — 不依赖你的会话上下文\n" +
				"2. 详细 — 每个文件路径、函数名、接口变更都要写清楚\n" +
				"3. 可验证 — 每个验收标准都能被测试或检查\n\n" +
				"产出目录: .xyz-harness/" + state.topicDir + "/\n\n" +
				"从 Step 1: 需求讨论开始。向我提问澄清需求。"
			);
		},
	});

	// ── Events ──────────────────────────────────────────

	pi.on("before_agent_start", async (_event, ctx) => {
		if (!state.isActive) return;

		const currentStep = STEPS.find((s) => s.id === state.currentStep);
		if (!currentStep) return;

		return {
			message: {
				customType: "track-context",
				content:
					"[TRACK ACTIVE — 你必须严格遵守以下规则]\n\n" +
					"1. 当前步骤: Step " + state.currentStep + ": " + currentStep.name + "\n" +
					"   " + currentStep.description + "\n\n" +
					"2. 完成后必须调用 track_step 的 complete_step 标记 (stepId: " + state.currentStep + ")\n\n" +
					"3. 进度: " + state.completedSteps.length + "/" + STEPS.length + " 已完成\n" +
					"   已完成: " + (state.completedSteps.length > 0 ? state.completedSteps.map((id) => "Step " + id).join(", ") : "无") + "\n\n" +
					"4. 产出目录: .xyz-harness/" + state.topicDir + "/\n\n" +
					"5. 关键警告：你的产出将交付给另一个 agent 执行开发，务必自包含、详细。" +
					"   另一个 agent 没有你的会话上下文，对话历史会全部丢失。你的文档就是对方的「完整指令集」，" +
					"   不是补充参考而是唯一信息源。每个文件路径必须完整（从项目根开始），" +
					"   每个函数/接口必须写明签名和位置。在标记 Step 2/Step 4 完成前，" +
					"   自包含检查：另一个 agent 能否单凭这份文档 + 代码库完成实现？如果不行，补充细节。\n\n" +
					"6. 使用 track_step 的 list_steps 查看全部步骤和当前进度。",
				display: false,
			},
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		reconstructState(ctx);
		updateWidget(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		if (!state.isActive) return;
		updateWidget(ctx);
	});

	// ── Message Renderers ───────────────────────────────

	pi.registerMessageRenderer("track-context", (message, _options, theme) => {
		return new Text(theme.fg("accent", "[TRACK] ") + theme.fg("dim", message.content), 0, 0);
	});
}
