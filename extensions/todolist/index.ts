/**
 * todolist — 需求沟通阶段任务追踪器
 *
 * 固定 7 步模板，强制 AI 按序执行需求沟通流程。
 * 与 loop 不同：不强制循环，每步由用户驱动推进。
 * 同时支持自由任务模式，供 Stage 1 编码实现时使用。
 *
 * 产出物：spec.md + plan.md + e2e-test-plan.md + summary.md（交付给 Phase 2 的 agent）
 */
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import * as fs from "fs";

// ── Fixed Step Template ────────────────────────────────

interface TodoStep {
	id: number;
	name: string;
	description: string;
	/** 这一步必须产出的文件（相对于 .xyz-harness/{主题}/） */
	requiredOutputs: string[];
	/** 是否需要用户确认才能推进 */
	requiresConfirmation: boolean;
}

const STEPS: TodoStep[] = [
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
		name: "E2E 测试计划",
		description:
			"基于 spec.md + plan.md 编写 e2e-test-plan.md（端到端测试计划）。" +
			"先由主 agent 生成整体方案框架（测试环境、分组策略、依赖关系图），" +
			"再通过 subagent 分组生成具体测试用例。" +
			"每个用例包含：测试目标、启动方式、操作步骤、期望结果、衡量方式（DOM/截图/数据库/日志）。" +
			"用例之间标注依赖关系，失败的用例会导致后置依赖用例跳过。" +
			"详见 skill: xyz-harness-e2e-test-plan。",
		requiredOutputs: ["e2e-test-plan.md"],
		requiresConfirmation: false,
	},
	{
		id: 6,
		name: "计划评审",
		description:
			"派遣 reviewer subagent 对 spec + plan + e2e-test-plan 进行独立评审。" +
			"评审报告写入 changes/reviews/plan_review_v1.md。" +
			"如有 MUST FIX，修复后重新评审（最多 3 轮）。",
		requiredOutputs: ["changes/reviews/plan_review_v1.md"],
		requiresConfirmation: false,
	},
	{
		id: 7,
		name: "用户确认",
		description:
			"向用户展示最终 spec、plan 和 e2e-test-plan，等待确认。确认前必须先调用 validate_outputs 检查产出物完整性。" +
			"**自包含检查**：另一个 agent 单凭 spec.md + plan.md + e2e-test-plan.md + 代码库，不需要任何会话上下文就能完成实现和 E2E 测试。" +
			"如果某个文件/函数/接口在 spec 中被引用但路径不完整，必须补充完整。" +
			"确认后输出完整的 Phase 2 启动指令（7 阶段流程）",
		requiredOutputs: ["changes/summary.md"],
		requiresConfirmation: true,
	},
];

// ── State ──────────────────────────────────────────────

interface TodoItem {
	id: number;
	description: string;
	completed: boolean;
	summary?: string; // 完成时的摘要
}

interface TodoState {
	isActive: boolean;
	// 固定步骤模式（Phase 1）
	currentStep: number; // 1-based, 0 = not started
	completedSteps: number[]; // step ids that are done
	stallCount: number;
	requirementSummary: string; // one-line requirement description
	topicDir: string; // .xyz-harness/{yyyy-MM-dd}-{topic}/
	// 自由任务模式（Stage 1 内部 Task）
	tasks: TodoItem[];
	mode: "fixed" | "free"; // fixed=固定步骤, free=自由任务
	memoryDir: string; // memory.md 所在目录（自由任务模式）
}

const DEFAULT_STATE: TodoState = {
	isActive: false,
	currentStep: 0,
	completedSteps: [],
	stallCount: 0,
	requirementSummary: "",
	topicDir: "",
	tasks: [],
	mode: "fixed",
	memoryDir: "",
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
			"- [ ] e2e-test-plan.md",
			"- [ ] changes/reviews/plan_review_v1.md",
			"",
			"## 交付物",
			"<!-- Phase 2 完成后更新 -->",
			"- [ ] 代码实现",
			"- [ ] 单元测试",
			"- [ ] 代码评审",
			"- [ ] E2E 测试执行报告",
			"- [ ] 测试评审",
			"- [ ] 部署",
		];
		fs.writeFileSync(summaryPath, lines.join("\n"));
	} catch (_e) {
		// non-critical
	}
}

/** 自由任务模式：初始化 memory.md 文件 */
function ensureMemoryFile(memoryDir: string): void {
	const dir = memoryDir.startsWith("/") ? memoryDir : process.cwd() + "/" + memoryDir;
	const memoryPath = dir + "/memory.md";
	if (fs.existsSync(memoryPath)) return;
	try {
		fs.mkdirSync(dir, { recursive: true });
		const content = [
			"# 工作记忆",
			"",
			"## 当前状态",
			"<!-- 由 todolist 自动更新 -->",
			"",
			"## 任务完成记录",
			"| 类型 | 摘要 | 时间 |",
			"|------|------|------|",
			"",
			"## 关键决策记录",
			"<!-- 由主 agent 通过 update_memory 追加 -->",
			"",
			"## 陷阱提醒",
			"<!-- 由主 agent 通过 update_memory 追加 -->",
			"",
			"## 手动笔记",
			"<!-- 由主 agent 通过 update_memory 追加 -->",
			"",
		].join("\n");
		fs.writeFileSync(memoryPath, content);
	} catch (_e) {
		// non-critical
	}
}

/** 自由任务模式：向 memory.md 追加任务完成记录 */
function appendMemoryEntry(memoryDir: string, taskId: number, summary: string): void {
	const dir = memoryDir.startsWith("/") ? memoryDir : process.cwd() + "/" + memoryDir;
	const memoryPath = dir + "/memory.md";
	try {
		ensureMemoryFile(memoryDir);
		const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
		const type = taskId === 0 ? "📝 笔记" : "✓ Task #" + taskId;
		const row = "| " + type + " | " + summary.replace(/\|/g, "\\|") + " | " + timestamp + " |\n";
		fs.appendFileSync(memoryPath, row);
	} catch (_e) {
		// non-critical
	}
}

/** Build the Phase 2 launch prompt shown when all 6 steps complete */
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
		"请在新的 agent session 中执行以下提示词启动 Phase 2（开发交付）：",
		"",
		"```",
		"/loop --max 20 " + requirement,
		"",
		"你正在执行 Phase 2（开发交付）。Phase 1（需求沟通）已完成。",
		"你不会继承 Phase 1 的会话上下文，所有信息在以下文档中：",
		"",
		"## 必读文件（按顺序阅读）",
		"1. 项目 CLAUDE.md（项目级编码规范和架构约束）",
		"2. " + td + "/spec.md（需求设计文档）",
		"3. " + td + "/plan.md（实现计划）",
		"",
		"## 加载 Skill",
		"- xyz-harness-phase2-dev（Phase 2 七阶段流程的完整指令）",
		"- xyz-harness-e2e-test-plan（E2E 测试计划编写规范，参考测试用例结构）",
		"- xyz-harness-subagent-driven-development（task 调度模式参考）",
		"- xyz-harness-coding-skill（分层编码规范，按需加载）",
		"- xyz-harness-unit-test-write（Change-driven Testing，阶段 3 使用）",
		"- xyz-harness-verification-before-completion（验证，阶段 6 使用）",
		"- xyz-harness-deploy-verify（部署验证，阶段 6 使用）",
		"",
		"## 7 阶段流程（使用 loop_task_tracker 管理进度）",
		"Stage 1: 编码实现 (TDD + 按 plan Task 逐个完成)",
		"Stage 2: 编码评审 (reviewer ≤2轮)",
		"Stage 3: 单元测试编写 (Change-driven Testing)",
		"Stage 4: E2E 测试执行 (按 e2e-test-plan.md 执行端到端测试)",
		"Stage 5: 测试评审 (reviewer ≤2轮，评审单元测试 + E2E 测试结果)",
		"Stage 6: 推送 + CI + 部署",
		"Stage 7: 自动复盘 (写回 Phase 1 目录)",
		"",
		"## 关键路径",
		"- Phase 1 产出目录: " + td + "/",
		"- Phase 2 写回目录: " + td + "/changes/",
		"- 门禁脚本: skills/xyz-harness-dev-flow/scripts/",
		"- 每个阶段运行: harness-state.sh advance → gate-script.sh → harness-state.sh pass",
		"",
		"## 启动步骤",
		"1. loop_task_tracker create_tasks 创建 7 个阶段任务",
		"2. 阅读 spec.md、plan.md 和 e2e-test-plan.md",
		"3. 从 Stage 1 编码实现开始，按 plan.md 的 Task 逐个 TDD 实现",
		"```",
	].join("\n");
}

// ── Extension ─────────────────────────────────────────

export default function todolistExtension(pi: ExtensionAPI) {
	const state: TodoState = { ...DEFAULT_STATE };

	// ── Tool: todolist ──────────────────────────────────

	const TodoParams = Type.Object({
		action: StringEnum([
			"start",              // 初始化固定步骤模式（Phase 1）
			"complete_step",      // 完成固定步骤
			"list_steps",         // 查看固定步骤进度
			"validate_outputs",   // 验证产出物
			"create_tasks",       // 创建自由任务列表（Stage 1）
			"complete_task",      // 完成自由任务 + 写 memory.md
			"list_tasks",         // 查看自由任务进度
			"update_memory",      // 手动追加 memory.md 条目（改进4）
			"rollback",           // 回退自由任务
		] as const),
		// start 模式参数
		stepId: Type.Optional(Type.Number({ description: "Step ID for complete_step (1-7)" })),
		requirementSummary: Type.Optional(Type.String({ description: "Requirement summary for start" })),
		topicDir: Type.Optional(Type.String({ description: "Topic directory name (e.g. 2026-05-10-my-feature)" })),
		// create_tasks 模式参数
		tasks: Type.Optional(Type.Array(Type.String({ description: "Task descriptions for create_tasks" }))),
		memoryDir: Type.Optional(Type.String({ description: "Directory for memory.md (used by free task mode)" })),
		// complete_task / rollback 模式参数
		taskId: Type.Optional(Type.Number({ description: "Task ID for complete_task / rollback" })),
		summary: Type.Optional(Type.String({ description: "Summary for complete_task (written to memory.md)" })),
		content: Type.Optional(Type.String({ description: "Content to append to memory.md for update_memory" })),
	});

	pi.registerTool({
		name: "todolist",
		label: "Todo Step Tracker",
		description:
			"管理 /track 模式的固定步骤清单和自由任务列表。" +
			"固定模式：7 个步骤按序执行，使用 start 初始化、complete_step 标记、list_steps 查看进度。" +
			"自由任务模式：使用 create_tasks 创建任务列表、complete_task 标记完成、list_tasks 查看进度。" +
			"complete_task 的 summary 会自动写入 memory.md。",
		promptSnippet: "管理需求沟通阶段的任务追踪",
		promptGuidelines: [
			"使用 todolist 的 start 初始化 Phase 1 固定步骤追踪",
			"完成每个步骤后必须调用 todolist 的 complete_step 标记",
			"使用 todolist 的 list_steps 查看当前进度和下一步",
			"所有步骤按固定顺序执行，不可跳步",
			"Stage 1 编码实现时，使用 todolist 的 create_tasks 创建 plan task 列表",
			"每完成一个 plan task，调用 todolist 的 complete_task 标记并传入 summary",
			"complete_task 的 summary 会自动写入 memory.md，供后续阶段和 /loop 轮次恢复上下文",
			"在 plan Task 执行过程中发现关键决策或陷阱时，使用 todolist 的 update_memory 追加到 memory.md",
		],
		parameters: TodoParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			switch (params.action) {
				// ── Fixed Step Mode ──────────────────────

				case "start": {
					if (state.isActive && state.mode === "fixed") {
						return {
							content: [{ type: "text", text: "Todo 已激活（固定步骤模式），无需重复初始化。当前步骤: " + state.currentStep }],
						};
					}
					state.isActive = true;
					state.mode = "fixed";
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
							text: "Todo 已启动（固定步骤模式）。固定 7 步流程：\n" + stepList + "\n\n当前: Step 1 — 从需求讨论开始。",
						}],
					};
				}

				case "complete_step": {
					if (!state.isActive || state.mode !== "fixed") {
						return { content: [{ type: "text", text: "固定步骤模式未激活。使用 /track <需求描述> 启动。" }] };
					}
					if (params.stepId === undefined) {
						throw new Error("complete_step requires stepId");
					}
					const step = STEPS.find((s) => s.id === params.stepId);
					if (!step) {
						throw new Error("Step " + params.stepId + " not found. Valid: 1-7");
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

					// 在高上下文消耗步骤完成后提示 compaction
					if (params.stepId === 1 || params.stepId === 2) {
						msg += "\n\n💡 建议现在执行 /compact 压缩对话历史。Step " + (params.stepId === 1 ? "1 的讨论内容已沉淀到需求理解中" : "2 的 Spec 已写入文件") + "，原始对话不再需要完整保留。";
					}

					if (nextStep) {
						msg += "\n\n下一步: Step " + nextStep.id + ": " + nextStep.name + "\n" + nextStep.description;
					} else {
						msg += buildPhase2LaunchCommand(state.topicDir, state.requirementSummary);
					}

					return { content: [{ type: "text", text: msg }] };
				}

				case "list_steps": {
					if (!state.isActive || state.mode !== "fixed") {
						return { content: [{ type: "text", text: "固定步骤模式未激活。使用 /track <需求描述> 启动。" }] };
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
					if (!state.isActive || state.mode !== "fixed") {
						return { content: [{ type: "text", text: "固定步骤模式未激活。使用 /track <需求描述> 启动。" }] };
					}
					if (params.stepId === undefined) {
						throw new Error("validate_outputs requires stepId");
					}
					const vStep = STEPS.find((s) => s.id === params.stepId);
					if (!vStep) {
						throw new Error("Step " + params.stepId + " not found. Valid: 1-7");
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

				// ── Free Task Mode ───────────────────────

				case "create_tasks": {
					if (!params.tasks || params.tasks.length === 0) {
						throw new Error("create_tasks requires non-empty tasks array");
					}
					// 如果固定步骤模式已激活，不允许使用自由任务模式
					if (state.isActive && state.mode === "fixed") {
						return {
							content: [{ type: "text", text: "当前处于固定步骤模式，不能创建自由任务。请先完成固定步骤或使用 /track abort 中止。" }],
						};
					}

					state.isActive = true;
					state.mode = "free";
					state.tasks = params.tasks.map((desc, idx) => ({
						id: idx + 1,
						description: desc,
						completed: false,
					}));
					state.memoryDir = params.memoryDir || "";

					if (state.memoryDir) {
						ensureMemoryFile(state.memoryDir);
					}

					const taskList = state.tasks.map((t) => "☐ #" + t.id + ": " + t.description).join("\n");
					return {
						content: [{
							type: "text",
							text: "已创建 " + state.tasks.length + " 个自由任务：\n" + taskList,
						}],
					};
				}

				case "complete_task": {
					if (!state.isActive || state.mode !== "free") {
						return { content: [{ type: "text", text: "自由任务模式未激活。请先使用 create_tasks 创建任务。" }] };
					}
					if (params.taskId === undefined) {
						throw new Error("complete_task requires taskId");
					}
					const task = state.tasks.find((t) => t.id === params.taskId);
					if (!task) {
						throw new Error("Task #" + params.taskId + " not found. Valid: 1-" + state.tasks.length);
					}
					if (task.completed) {
						return { content: [{ type: "text", text: "Task #" + task.id + ": " + task.description + " 已完成。" }] };
					}

					task.completed = true;
					if (params.summary) {
						task.summary = params.summary;
						// 写入 memory.md（如果配置了 memoryDir）
						if (state.memoryDir) {
							appendMemoryEntry(state.memoryDir, task.id, params.summary);
						}
					}

					const remaining = state.tasks.filter((t) => !t.completed).length;
					const total = state.tasks.length;
					const completedCount = total - remaining;
					let msg = "✓ Task #" + task.id + ": " + task.description + " 已完成。";
					if (params.summary) {
						msg += "\n摘要: " + params.summary;
					}
					msg += "\n进度: " + completedCount + "/" + total;
					msg += "\n\n提醒：如果 executor 返回了 spec_deviations，请将偏差追加到 spec.md 的\"实现偏差记录\"章节。";
					if (remaining === 0) {
						msg += "\n\n所有任务已完成！";
					}

					return { content: [{ type: "text", text: msg }] };
				}

				case "update_memory": {
					if (!state.isActive || state.mode !== "free") {
						return { content: [{ type: "text", text: "自由任务模式未激活。请先使用 create_tasks 创建任务。" }] };
					}
					if (!state.memoryDir) {
						return { content: [{ type: "text", text: "memoryDir 未设置，无法写入 memory.md。" }] };
					}
					if (!params.content) {
						throw new Error("update_memory requires content");
					}
					appendMemoryEntry(state.memoryDir, 0, params.content);
					return { content: [{ type: "text", text: "已追加到 memory.md。" }] };
				}

				case "list_tasks": {
					if (!state.isActive || state.mode !== "free") {
						return { content: [{ type: "text", text: "自由任务模式未激活。请先使用 create_tasks 创建任务。" }] };
					}
					const pending = state.tasks.filter((t) => !t.completed);
					const done = state.tasks.filter((t) => t.completed);
					const lines: string[] = [];

					if (pending.length > 0) {
						lines.push("未完成 (" + pending.length + "):");
						for (const t of pending) {
							lines.push("  ☐ #" + t.id + ": " + t.description);
						}
					}
					if (done.length > 0) {
						lines.push("已完成 (" + done.length + "):");
						for (const t of done) {
							const suffix = t.summary ? " — " + t.summary : "";
							lines.push("  ✓ #" + t.id + ": " + t.description + suffix);
						}
					}

					return { content: [{ type: "text", text: lines.join("\n") }] };
				}

				case "rollback": {
					if (!state.isActive || state.mode !== "free") {
						return { content: [{ type: "text", text: "自由任务模式未激活。请先使用 create_tasks 创建任务。" }] };
					}
					if (params.taskId === undefined) {
						throw new Error("rollback requires taskId");
					}
					const targetTask = state.tasks.find((t) => t.id === params.taskId);
					if (!targetTask) {
						throw new Error("Task #" + params.taskId + " not found. Valid: 1-" + state.tasks.length);
					}

					let rolledBack = 0;
					state.tasks = state.tasks.map((t) => {
						if (t.id >= params.taskId! && t.completed) {
							rolledBack++;
							return { ...t, completed: false, summary: undefined };
						}
						return t;
					});

					return {
						content: [{
							type: "text",
							text: "已回退 " + rolledBack + " 个任务（从 Task #" + params.taskId + " 开始）。",
						}],
					};
				}

				default:
					throw new Error("Unknown action: " + params.action);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("todolist ")) + theme.fg("muted", args.action);
			if (args.stepId !== undefined) text += " " + theme.fg("accent", "Step " + args.stepId);
			if (args.tasks) text += " " + theme.fg("dim", "(" + args.tasks.length + " tasks)");
			if (args.taskId !== undefined) text += " " + theme.fg("accent", "#" + args.taskId);
			if (args.content) text += " " + theme.fg("dim", "(" + (args.content as string).slice(0, 40) + "...)" );
			return new Text(text, 0, 0);
		},

		renderResult(result, _opts, theme) {
			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "", 0, 0);
		},
	});

	// ── State persistence ───────────────────────────────

	function persistState(): void {
		pi.appendEntry("todolist", {
			isActive: state.isActive,
			currentStep: state.currentStep,
			completedSteps: state.completedSteps,
			stallCount: state.stallCount,
			requirementSummary: state.requirementSummary,
			topicDir: state.topicDir,
			tasks: state.tasks,
			mode: state.mode,
			memoryDir: state.memoryDir,
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
				(entry as any).customType === "todolist"
			) {
				const data = (entry as any).data as TodoState | undefined;
				if (data) {
					state.isActive = data.isActive ?? false;
					state.currentStep = data.currentStep ?? 0;
					state.completedSteps = data.completedSteps ?? [];
					state.stallCount = data.stallCount ?? 0;
					state.requirementSummary = data.requirementSummary ?? "";
					state.topicDir = data.topicDir ?? "";
					state.tasks = data.tasks ?? [];
					state.mode = data.mode ?? "fixed";
					state.memoryDir = data.memoryDir ?? "";
				}
				break;
			}
		}
	}

	function updateWidget(ctx: ExtensionContext): void {
		if (!state.isActive) {
			ctx.ui.setWidget("todolist", undefined);
			ctx.ui.setStatus("todolist", undefined);
			return;
		}

		// Widget 只在固定步骤模式下显示
		if (state.mode !== "fixed") {
			ctx.ui.setWidget("todolist", undefined);
			// 自由任务模式：在 status bar 显示简要进度
			const completed = state.tasks.filter((t) => t.completed).length;
			const total = state.tasks.length;
			const th = ctx.ui.theme;
			ctx.ui.setStatus("todolist", th.fg("accent", "📋 " + completed + "/" + total + " tasks"));
			return;
		}

		const th = ctx.ui.theme;
		const completed = state.completedSteps.length;
		const total = STEPS.length;

		ctx.ui.setStatus("todolist", th.fg("accent", "📋 " + completed + "/" + total + " 步骤"));

		const lines: string[] = [];
		lines.push(th.fg("accent", "📋 Todo: " + completed + "/" + total + " 步骤"));
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
		ctx.ui.setWidget("todolist", lines);
	}

	// ── Command: /track ─────────────────────────────────

	pi.registerCommand("track", {
		description: "需求沟通阶段追踪：/track <需求描述> | /track status | /track abort | /track resume | /track redo <stepId>",

		handler: async (args, ctx) => {
			const trimmed = args.trim().toLowerCase();

			if (trimmed === "status") {
				if (!state.isActive) {
					ctx.ui.notify("Todo 模式未激活。使用 /track <需求描述> 启动。", "info");
					return;
				}
				if (state.mode === "free") {
					const completed = state.tasks.filter((t) => t.completed).length;
					const lines: string[] = [
						"状态: 📋 自由任务模式",
						"进度: " + completed + "/" + state.tasks.length,
						"memory.md: " + (state.memoryDir || "(未设置)"),
					];
					ctx.ui.notify(lines.join("\n"), "info");
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
					ctx.ui.notify("Todo 未激活。请先使用 /track <需求描述> 启动。", "warning");
					return;
				}
				if (state.mode === "free") {
					ctx.ui.notify("自由任务模式已激活。使用 todolist 的 list_tasks 查看进度。", "info");
					return;
				}
				const resumeStep = STEPS.find((s) => s.id === state.currentStep);
				if (!resumeStep) {
					ctx.ui.notify("所有步骤已完成，无需恢复。请启动 Phase 2。", "info");
					return;
				}
				ctx.ui.notify("从 Step " + state.currentStep + ": " + resumeStep.name + " 恢复", "info");
				pi.sendUserMessage(
					"Todo 已恢复。继续执行 Phase 1 需求沟通。\n\n" +
					"1. 使用 todolist 的 list_steps 查看当前进度\n" +
					"2. 从当前步骤继续: Step " + state.currentStep + ": " + resumeStep.name + "\n" +
					"3. 你的产出将交付给另一个 agent 执行，务必自包含、详细\n\n" +
					"产出目录: .xyz-harness/" + state.topicDir + "/"
				,
				{ deliverAs: "followUp" });
				return;
			}

			const redoMatch = trimmed.match(/^redo\s+(\d+)$/);
			if (redoMatch) {
				if (!state.isActive || state.mode !== "fixed") {
					ctx.ui.notify("固定步骤模式未激活。请先使用 /track <需求描述> 启动。", "warning");
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
					"Todo 已回退到 Step " + redoStepId + ": " + STEPS[redoStepId - 1]!.name + "。\n\n" +
					"请重新执行此步骤。完成后调用 todolist 的 complete_step 标记 (stepId: " + redoStepId + ")。"
				,
				{ deliverAs: "followUp" });
				return;
			}

			if (trimmed === "abort") {
				if (!state.isActive) {
					ctx.ui.notify("Todo 模式未激活", "info");
					return;
				}
				state.isActive = false;
				state.currentStep = 0;
				state.completedSteps = [];
				state.tasks = [];
				state.mode = "fixed";
				state.memoryDir = "";
				persistState();
				updateWidget(ctx);
				ctx.ui.notify("Todo 已中止", "info");
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
			state.mode = "fixed";
			state.currentStep = 1;
			state.completedSteps = [];
			state.stallCount = 0;
			state.requirementSummary = requirement;
			state.topicDir = today + "-" + topicSlug;
			state.tasks = [];
			state.memoryDir = "";

			ensureOutputDir(state.topicDir);
			writeInitialSummary(state.topicDir, requirement);

			persistState();
			updateWidget(ctx);
			ctx.ui.notify("Todo 已启动: " + requirement, "info");

			pi.sendUserMessage(
				"开始需求沟通阶段。需求: " + requirement + "\n\n" +
				"你的产出将交付给另一个 agent（Phase 2）执行开发，因此所有文档必须：\n" +
				"1. 自包含 — 不依赖你的会话上下文\n" +
				"2. 详细 — 每个文件路径、函数名、接口变更都要写清楚\n" +
				"3. 可验证 — 每个验收标准都能被测试或检查\n\n" +
				"产出目录: .xyz-harness/" + state.topicDir + "/\n\n" +
				"从 Step 1: 需求讨论开始。向我提问澄清需求。"
			,
			{ deliverAs: "followUp" });
		},
	});

	// ── Events ──────────────────────────────────────────

	pi.on("before_agent_start", async (_event, ctx) => {
		// 只在固定步骤模式下注入上下文
		if (!state.isActive || state.mode !== "fixed") return;

		const currentStep = STEPS.find((s) => s.id === state.currentStep);
		if (!currentStep) return;

		return {
			message: {
				customType: "todolist-context",
				content:
					"[TODO ACTIVE — 你必须严格遵守以下规则]\n\n" +
					"1. 当前步骤: Step " + state.currentStep + ": " + currentStep.name + "\n" +
					"   " + currentStep.description + "\n\n" +
					"2. 完成后必须调用 todolist 的 complete_step 标记 (stepId: " + state.currentStep + ")\n\n" +
					"3. 进度: " + state.completedSteps.length + "/" + STEPS.length + " 已完成\n" +
					"   已完成: " + (state.completedSteps.length > 0 ? state.completedSteps.map((id) => "Step " + id).join(", ") : "无") + "\n\n" +
					"4. 产出目录: .xyz-harness/" + state.topicDir + "/\n\n" +
					"5. 关键警告：你的产出将交付给另一个 agent 执行开发，务必自包含、详细。" +
					"   另一个 agent 没有你的会话上下文，对话历史会全部丢失。你的文档就是对方的「完整指令集」，" +
					"   不是补充参考而是唯一信息源。每个文件路径必须完整（从项目根开始），" +
					"   每个函数/接口必须写明签名和位置。在标记 Step 2/Step 4 完成前，" +
					"   自包含检查：另一个 agent 能否单凭这份文档 + 代码库完成实现？如果不行，补充细节。\n\n" +
					"6. 使用 todolist 的 list_steps 查看全部步骤和当前进度。",
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

	pi.registerMessageRenderer("todolist-context", (message, _options, theme) => {
		return new Text(theme.fg("accent", "[TODO] ") + theme.fg("dim", message.content), 0, 0);
	});
}
