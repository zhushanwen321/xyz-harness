---
verdict: pass
---

# coding-workflow Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use xyz-harness-subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Pi extension that orchestrates a 5-phase coding workflow with automatic gate checks, review, and retrospect — restricting AI visibility to only the current phase.

**Architecture:** Single TypeScript Pi extension (`~/.pi/agent/extensions/coding-workflow/`) with two custom tools (`coding-workflow-gate`, `coding-workflow-phase-start`), three commands (`/coding-workflow`, `/coding-workflow-status`, `/coding-workflow-abort`), and `before_agent_start` event injection. Subagent dispatch reuses spawn logic extracted from `xyz-pi-extensions/subagent`. Gate validation uses a Python script copied from `xyz-harness-gate`.

**Tech Stack:** TypeScript (Pi Extension API), Python 3 (gate check script), Node.js built-ins (`node:child_process`, `node:fs`, `node:path`, `node:os`)

---

## Complexity Assessment

| Dimension | Level | Reason |
|-----------|-------|--------|
| Domain impact | L1 | Single domain: workflow orchestration |
| Storage impact | L1 | Session state only (no database) |
| Data flow | L1 | Synchronous + spawn, short paths |
| API impact | L1 | Extension tools/commands, few endpoints |
| Non-functional | L1 | No special requirements |

**Overall: L1** — Pure backend TypeScript extension, no frontend/backend split. Single plan document.

---

## File Structure

| File | Type | Group | Description |
|------|------|-------|-------------|
| `~/.pi/agent/extensions/coding-workflow/lib/model-resolve.ts` | create | BG1 | Model selection by task complexity + fallback logic |
| `~/.pi/agent/extensions/coding-workflow/lib/subagent.ts` | create | BG1 | Subagent spawn logic (single foreground mode) |
| `~/.pi/agent/extensions/coding-workflow/gate-check.py` | create | BG1 | Gate check script (copy from xyz-harness-gate) |
| `~/.pi/agent/extensions/coding-workflow/index.ts` | create | BG1 | Main extension entry: tools, commands, events, state |

---

## Task List

| # | Task | Type | Depends on | Group |
|---|------|------|-----------|-------|
| 1 | Create `lib/model-resolve.ts` | backend | — | BG1 |
| 2 | Create `lib/subagent.ts` | backend | 1 | BG1 |
| 3 | Copy `gate-check.py` | backend | — | BG1 |
| 4 | Create `index.ts` (main extension) | backend | 1, 2, 3 | BG1 |

---

### Task 1: Create `lib/model-resolve.ts`

**Type:** backend

**Files:**
- Create: `~/.pi/agent/extensions/coding-workflow/lib/model-resolve.ts`

**Reference files to read before implementing:**
- `/Users/zhushanwen/Code/xyz-pi-extensions/subagent/src/index.ts` — extract model resolution functions (lines 33-130 approximately: `loadSubagentModels`, `resolveModelByComplexity`, `getFallbackRefsForModel`)

- [ ] **Step 1: Create the file with types and constants**

```typescript
// lib/model-resolve.ts
// Model selection logic extracted from xyz-pi-extensions/subagent.
// Resolves model by task complexity from ~/.pi/agent/subagent-models.json.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ─── Types ────────────────────────────────────────────────

export type TaskComplexity = "low" | "medium" | "high";
export type ThinkingLevel = "high" | "max";

/** Map subagent ThinkingLevel to Pi CLI --thinking flag values */
export const THINKING_TO_PI: Record<ThinkingLevel, string> = {
	high: "high",
	max: "xhigh",
};

export const COMPLEXITY_DEFAULT_THINKING: Record<TaskComplexity, ThinkingLevel> = {
	low: "high",
	medium: "high",
	high: "max",
};

// ─── Config types ─────────────────────────────────────────

interface SubagentModelEntry {
	id: string;
	provider?: string;
	"task-complexity"?: TaskComplexity[];
	order: number;
	fallbacks?: Array<{ id: string; provider?: string }>;
}

interface SubagentModelsConfig {
	models: SubagentModelEntry[];
}

// ─── Constants ────────────────────────────────────────────

const SUBAGENT_MODELS_PATH = path.join(
	os.homedir(), ".pi", "agent", "subagent-models.json",
);
const VALID_COMPLEXITIES = new Set<TaskComplexity>(["low", "medium", "high"]);

// Lazy singleton: load once per process
let _cachedModels: SubagentModelsConfig | null | undefined = undefined;

// ─── Load config ──────────────────────────────────────────

export function loadSubagentModels(): SubagentModelsConfig | null {
	if (_cachedModels !== undefined) return _cachedModels;
	try {
		const content = fs.readFileSync(SUBAGENT_MODELS_PATH, "utf-8");
		const parsed = JSON.parse(content) as SubagentModelsConfig;
		if (parsed.models) {
			for (const m of parsed.models) {
				if (m["task-complexity"]) {
					const invalid = m["task-complexity"].filter(
						(c) => !VALID_COMPLEXITIES.has(c),
					);
					if (invalid.length > 0) {
						console.warn(
							`[coding-workflow] Invalid complexity values for ${m.id}: ${invalid.join(", ")}`,
						);
					}
				}
				if (!m.provider) {
					console.warn(
						`[coding-workflow] Model entry "${m.id}" has no provider, will be skipped.`,
					);
				}
			}
		}
		_cachedModels = parsed;
		return parsed;
	} catch {
		_cachedModels = null;
		return null;
	}
}

// ─── Fallback resolution ─────────────────────────────────

function getFallbackRefsForModel(modelRef: string): string[] {
	const config = loadSubagentModels();
	if (!config) return [];
	for (const entry of config.models) {
		if (!entry.provider) continue;
		const entryRef = `${entry.provider}/${entry.id}`;
		if (entryRef === modelRef && entry.fallbacks?.length) {
			return entry.fallbacks
				.filter((fb) => fb.provider)
				.map((fb) => `${fb.provider!}/${fb.id}`);
		}
	}
	return [];
}

// ─── Resolve by complexity ────────────────────────────────

/**
 * Resolve a model reference by task complexity.
 * Iterates candidates sorted by `order`, returns first match.
 * Falls back through `fallbacks` if primary model unavailable
 * (since we can't check model registry, we return the first candidate).
 */
export async function resolveModelByComplexity(
	complexity: TaskComplexity,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
	const config = loadSubagentModels();
	if (!config || !config.models?.length) {
		return {
			ok: false,
			error: `subagent-models.json not found or empty at ${SUBAGENT_MODELS_PATH}`,
		};
	}

	const candidates = config.models
		.filter((m) => m["task-complexity"]?.includes(complexity))
		.sort((a, b) => a.order - b.order);

	if (candidates.length === 0) {
		return {
			ok: false,
			error: `No models configured for complexity "${complexity}" in subagent-models.json`,
		};
	}

	// Return first candidate with a provider
	for (const candidate of candidates) {
		if (!candidate.provider) continue;
		const modelRef = `${candidate.provider}/${candidate.id}`;
		return { ok: true, ref: modelRef };
	}

	const tried = candidates
		.map((c) => `${c.provider ?? "?"}/${c.id}`)
		.join(", ");
	return {
		ok: false,
		error: `No provider-configured models for complexity "${complexity}": ${tried}`,
	};
}

/**
 * Resolve a specific provider/model reference with fallback chain.
 */
export async function resolveModel(
	modelRef: string,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
	const slashIndex = modelRef.indexOf("/");
	if (slashIndex <= 0 || slashIndex === modelRef.length - 1) {
		return {
			ok: false,
			error: `Model must be in "provider/model" format. Got: "${modelRef}".`,
		};
	}

	// Pass through — we can't validate against model registry from extension context.
	// Fallback chain from config
	const fallbackRefs = getFallbackRefsForModel(modelRef);
	if (fallbackRefs.length > 0) {
		// Use the first fallback as alternative info, but return original ref
		return { ok: true, ref: modelRef };
	}

	return { ok: true, ref: modelRef };
}
```

- [ ] **Step 2: Verify TypeScript imports resolve**

Run: `ls ~/.pi/agent/extensions/coding-workflow/lib/` (after file creation)
Expected: `model-resolve.ts` exists

---

### Task 2: Create `lib/subagent.ts`

**Type:** backend

**Files:**
- Create: `~/.pi/agent/extensions/coding-workflow/lib/subagent.ts`

**Reference files to read before implementing:**
- `/Users/zhushanwen/Code/xyz-pi-extensions/subagent/src/index.ts` — extract spawn functions: `getPiInvocation`, `writePromptToTempFile`, `getTempDir`, `cleanupOldTempFiles`, `runSingleAgent`, `getFinalOutput`, `formatTokens`, `formatUsageStats`, `UsageStats`, `SingleResult`

- [ ] **Step 1: Create the file with utility functions and spawn logic**

```typescript
// lib/subagent.ts
// Subagent spawn logic extracted from xyz-pi-extensions/subagent.
// Only single foreground mode needed (no parallel/chain/background).

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { Message } from "@mariozechner/pi-ai";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import type { ThinkingLevel } from "./model-resolve.js";
import { THINKING_TO_PI } from "./model-resolve.js";

// ─── Types ────────────────────────────────────────────────

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface SingleResult {
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	startTime: number;
	endTime?: number;
	durationMs?: number;
	lastActivityTime: number;
}

export type OnUpdateCallback = (partial: {
	content: Array<{ type: string; text: string }>;
	usage?: UsageStats;
}) => void;

// ─── Formatting helpers ──────────────────────────────────

export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M}`;
}

export function formatUsageStats(usage: UsageStats, model?: string): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) {
		parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	}
	if (model) parts.push(model);
	return parts.join(" ");
}

// ─── Message helpers ─────────────────────────────────────

export function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text" && part.text.trim()) return part.text;
			}
		}
	}
	return "";
}

// ─── Temp file management ────────────────────────────────

const TEMP_SUBDIR = "pi-coding-workflow";
const MAX_TEMP_AGE_MS = 60 * 60 * 1000; // 1 hour

function getTempDir(): string {
	return path.join(os.tmpdir(), TEMP_SUBDIR);
}

export function cleanupOldTempFiles(): void {
	const dir = getTempDir();
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
		return;
	}
	const now = Date.now();
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const filePath = path.join(dir, entry.name);
		try {
			const stat = fs.statSync(filePath);
			if (now - stat.mtimeMs > MAX_TEMP_AGE_MS) fs.unlinkSync(filePath);
		} catch { /* ignore */ }
	}
}

async function writePromptToTempFile(
	label: string,
	prompt: string,
): Promise<string> {
	const dir = getTempDir();
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	const safeName = label.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(
		dir, `prompt-${safeName}-${randomUUID().slice(0, 8)}.md`,
	);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, {
			encoding: "utf-8",
			mode: 0o600,
		});
	});
	return filePath;
}

// ─── Pi invocation ───────────────────────────────────────

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

// ─── Single agent spawn ──────────────────────────────────

export async function runSingleAgent(params: {
	task: string;
	systemPrompt: string;
	resolvedModel: string;
	thinkingLevel?: ThinkingLevel;
	cwd: string;
	tools?: string;
	signal?: AbortSignal;
	onUpdate?: OnUpdateCallback;
	/** Optional array to register the spawned ChildProcess for external lifecycle management (e.g. abort). */
	processRegistry?: ChildProcess[];
}): Promise<SingleResult> {
	const {
		task,
		systemPrompt,
		resolvedModel,
		thinkingLevel,
		cwd,
		tools = "read,bash,write,edit",
		signal,
		onUpdate,
		processRegistry,
	} = params;

	const result: SingleResult = {
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: {
			input: 0, output: 0, cacheRead: 0,
			cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0,
		},
		model: resolvedModel,
		startTime: Date.now(),
		lastActivityTime: Date.now(),
	};

	const emitUpdate = () => {
		if (onUpdate) {
			onUpdate({
				content: [{
					type: "text",
					text: getFinalOutput(result.messages) || "(running...)",
				}],
				usage: result.usage,
			});
		}
	};

	const args: string[] = [
		"--mode", "json", "-p", "--no-session",
		"--model", resolvedModel,
		"--tools", tools,
	];
	if (thinkingLevel) {
		args.push("--thinking", THINKING_TO_PI[thinkingLevel]);
	}

	let tmpPromptPath: string | null = null;

	try {
		// Write system prompt to temp file
		if (systemPrompt.trim()) {
			tmpPromptPath = await writePromptToTempFile(
				"coding-workflow", systemPrompt,
			);
			args.push("--append-system-prompt", tmpPromptPath);
		}

		args.push(`Task: ${task}`);

		let wasAborted = false;
		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});

			// Register process for external lifecycle management (abort)
			if (processRegistry) {
				processRegistry.push(proc);
				proc.on("close", () => {
					const idx = processRegistry.indexOf(proc);
					if (idx !== -1) processRegistry.splice(idx, 1);
				});
			}

			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: Record<string, unknown>;
				try {
					event = JSON.parse(line) as Record<string, unknown>;
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					result.messages.push(msg);

					if (msg.role === "assistant") {
						result.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							result.usage.input += usage.input || 0;
							result.usage.output += usage.output || 0;
							result.usage.cacheRead += usage.cacheRead || 0;
							result.usage.cacheWrite += usage.cacheWrite || 0;
							result.usage.cost += usage.cost?.total || 0;
							result.usage.contextTokens = usage.totalTokens || 0;
						}
						if (msg.model) result.model = msg.model;
						if (msg.stopReason) result.stopReason = msg.stopReason;
						if (msg.errorMessage) result.errorMessage = msg.errorMessage;
					}
					emitUpdate();
					result.lastActivityTime = Date.now();
				}

				if (event.type === "tool_result_end" && event.message) {
					result.messages.push(event.message as Message);
					emitUpdate();
					result.lastActivityTime = Date.now();
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data) => {
				result.stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", () => {
				resolve(1);
			});

			if (signal) {
				const killProc = () => {
					wasAborted = true;
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		result.exitCode = exitCode;
		result.endTime = Date.now();
		result.durationMs = result.endTime - result.startTime;
		if (wasAborted) throw new Error("Subagent was aborted");
		return result;
	} finally {
		if (tmpPromptPath) {
			try { fs.unlinkSync(tmpPromptPath); } catch { /* ignore */ }
		}
	}
}
```

- [ ] **Step 2: Verify file structure**

Run: `ls -la ~/.pi/agent/extensions/coding-workflow/lib/`
Expected: `model-resolve.ts` and `subagent.ts` exist

---

### Task 3: Copy `gate-check.py`

**Type:** backend

**Files:**
- Create: `~/.pi/agent/extensions/coding-workflow/gate-check.py`

**Reference:** Copy from `/Users/zhushanwen/Code/xyz-harness-engineering-workspace/xyz-harness-engineering/skills/xyz-harness-gate/scripts/check_gate.py`

- [ ] **Step 1: Copy the gate check script**

```bash
cp /Users/zhushanwen/Code/xyz-harness-engineering-workspace/xyz-harness-engineering/skills/xyz-harness-gate/scripts/check_gate.py ~/.pi/agent/extensions/coding-workflow/gate-check.py
```

- [ ] **Step 2: Verify the script runs**

Run: `python3 ~/.pi/agent/extensions/coding-workflow/gate-check.py`
Expected: Usage help text printed (exit code 1, shows docstring)

- [ ] **Step 3: Commit**

```bash
cd ~/.pi/agent/extensions/coding-workflow
git add gate-check.py
git commit -m "chore: copy gate check script from xyz-harness-gate"
```

---

### Task 4: Create `index.ts` (Main Extension)

**Type:** backend

**Files:**
- Create: `~/.pi/agent/extensions/coding-workflow/index.ts`

**Dependencies:** Tasks 1, 2, 3 must be complete (lib/ modules and gate-check.py must exist)

This is the largest file. Read the following references before implementing:

**Required reads:**
- `/Users/zhushanwen/Code/xyz-harness-engineering-workspace/xyz-harness-engineering/.xyz-harness/2026-05-20-coding-workflow-extension/spec.md` — functional requirements FR-1 through FR-11
- `/Users/zhushanwen/Code/xyz-harness-engineering-workspace/xyz-harness-engineering/extensions/todolist/index.ts` — state persistence pattern (`appendEntry` + `reconstructState`), widget rendering, event registration pattern

**Key sections to implement (in order):**

- [ ] **Step 1: Imports and constants**

```typescript
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { resolveModelByComplexity, type ThinkingLevel, COMPLEXITY_DEFAULT_THINKING } from "./lib/model-resolve.js";
import { runSingleAgent, getFinalOutput, formatUsageStats, cleanupOldTempFiles, type SingleResult } from "./lib/subagent.js";

// Module-level cache for skills from before_agent_start (used by gate tool's dispatchReviewSubagent)
let cachedSkills: any[] = [];

// ─── Phase definitions ───────────────────────────────────

interface PhaseConfig {
	phase: number;
	name: string;
	skillName: string;
	reviewPrefix: string;
	retrospectPrefix: string;
}

const PHASES: PhaseConfig[] = [
	{ phase: 1, name: "Spec", skillName: "xyz-harness-brainstorming", reviewPrefix: "spec_review", retrospectPrefix: "spec_retrospect" },
	{ phase: 2, name: "Plan", skillName: "xyz-harness-writing-plans", reviewPrefix: "plan_review", retrospectPrefix: "plan_retrospect" },
	{ phase: 3, name: "Dev", skillName: "xyz-harness-phase-dev", reviewPrefix: "code_review", retrospectPrefix: "dev_retrospect" },
	{ phase: 4, name: "Test", skillName: "xyz-harness-phase-test", reviewPrefix: "test_review", retrospectPrefix: "test_retrospect" },
	{ phase: 5, name: "PR", skillName: "xyz-harness-phase-pr", reviewPrefix: "pr_review", retrospectPrefix: "overall_retrospect" },
];

const GATE_SCRIPT_PATH = path.join(import.meta.dir, "gate-check.py");
```

- [ ] **Step 2: State types and defaults**

```typescript
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
```

- [ ] **Step 3: Helper functions**

Implement these functions:

1. **`getSkillContent(skills: any[], skillName: string): string`** — Find skill in `systemPromptOptions.skills` array by `skill.name === skillName`, return `fs.readFileSync(skill.filePath, "utf8")`. Throw if not found.

2. **`runGateScript(topicDir: string, phase: number): Promise<{passed: boolean; output: string}>`** — Spawn `python3 GATE_SCRIPT_PATH topicDir phase`, capture stdout, parse exit code. Return `{passed: exitCode === 0, output: stdout}`.

3. **`getNextReviewVersion(topicDir: string, prefix: string): number`** — Glob `{topicDir}/changes/reviews/{prefix}_v*.md`, extract version numbers with regex `/_v(\d+)\.md$/`, return `max + 1` (or `1` if no files found).

4. **`parseReviewVerdict(reviewPath: string): {verdict: string; mustFix: number}`** — Read file, parse YAML frontmatter, extract `verdict` and `must_fix` from top level.

5. **`getExpertReviewerContent(): string`** — Try `getSkillContent(cachedSkills, "xyz-harness-expert-reviewer")` first (using module-level cache populated in `before_agent_start`). If not found, fallback to `fs.readFileSync(path.join(os.homedir(), ".pi/agent/skills/xyz-harness-expert-reviewer/SKILL.md"), "utf8")`.

6. **`getRetrospectAgentContent(): string`** — Read `path.join(os.homedir(), ".pi/agent/agents/harness-retrospect/agent.md")`. Throw if not found.

7. **`buildReviewTaskPrompt(phase: number, phaseConfig: PhaseConfig, topicDir: string, nextVersion: number): string`** — Build the review task prompt string. Must include: phase-specific review mode, deliverable file paths, output path with version number, YAML frontmatter requirements (`verdict` and `must_fix` at top level).

   Example for Phase 1:
   ```
   你是独立审查专家。按以下步骤执行审查：
   
   1. read `skills/xyz-harness-expert-reviewer/SKILL.md`，找到「模式一：计划评审」章节（或当前 phase 对应的审查模式）
   2. read 以下待审查文件：
      - {topicDir}/spec.md
   3. 按方法论逐项审查，将结果写入：
      {topicDir}/changes/reviews/spec_review_v1.md
   4. YAML frontmatter 必须包含（在顶层，不能嵌套）:
      - verdict: "pass" 或 "fail"
      - must_fix: 数字
   ```

8. **`buildRetrospectTaskPrompt(phase: number, phaseConfig: PhaseConfig, topicDir: string): string`** — Build retrospect task prompt. Include: phase number, phase name, topicDir, deliverable paths list.

- [ ] **Step 4: Subagent dispatch helpers**

```typescript
async function dispatchReviewSubagent(
	phaseConfig: PhaseConfig,
	topicDir: string,
	signal: AbortSignal | undefined,
	onUpdate: ((partial: any) => void) | undefined,
): Promise<{ success: boolean; reviewPath: string; result?: SingleResult; error?: string }> {
	// 1. Resolve model
	const modelResult = await resolveModelByComplexity("medium");
	if (!modelResult.ok) return { success: false, reviewPath: "", error: modelResult.error };

	// 2. Get system prompt content
	const systemPrompt = getExpertReviewerContent();

	// 3. Get next version
	const nextVersion = getNextReviewVersion(topicDir, phaseConfig.reviewPrefix);
	const reviewPath = path.join(
		topicDir, "changes", "reviews",
		`${phaseConfig.reviewPrefix}_v${nextVersion}.md`,
	);

	// 4. Build task prompt
	const taskPrompt = buildReviewTaskPrompt(
		phaseConfig.phase, phaseConfig, topicDir, nextVersion,
	);

	// 5. Run subagent (register process for abort)
	cleanupOldTempFiles();
	const result = await runSingleAgent({
		task: taskPrompt,
		systemPrompt,
		resolvedModel: modelResult.ref,
		thinkingLevel: COMPLEXITY_DEFAULT_THINKING.medium,
		cwd: topicDir,
		signal,
		onUpdate,
		processRegistry: activeSubprocesses,
	});

	if (result.exitCode !== 0) {
		const errMsg = result.stderr || getFinalOutput(result.messages) || "Unknown error";
		return { success: false, reviewPath, error: `Review subagent failed: ${errMsg}` };
	}

	return { success: true, reviewPath };
}
```

Similar pattern for `dispatchRetrospectSubagent` but with `resolveModelByComplexity("low")`, retrospect agent content as system prompt, and `processRegistry: activeSubprocesses` for abort support.

- [ ] **Step 5: Tool — coding-workflow-gate**

```typescript
pi.registerTool({
	name: "coding-workflow-gate",
	label: "Coding Workflow Gate",
	description: "Submit deliverables for gate check. Call when phase deliverables are complete. Runs gate script, dispatches review subagent, then retrospect subagent.",
	parameters: Type.Object({
		phase: Type.Number({ description: "Phase number (1-5)" }),
	}),
	promptSnippet: "Run gate check for coding workflow phase",
	promptGuidelines: [
		"Use coding-workflow-gate when phase deliverables are complete and ready for validation",
		"Call with phase number matching the current phase shown in the widget",
		"If gate returns failures, fix issues and call coding-workflow-gate again",
		"After gate returns success, call coding-workflow-phase-start to transition to next phase",
		"For Phase 5, gate success means workflow is complete — no phase-start needed",
	],
	async execute(toolCallId, params, signal, onUpdate, ctx) {
		if (!state.isActive) {
			return { content: [{ type: "text", text: "No active workflow. Use /coding-workflow <topic> to start." }], isError: true };
		}
		if (params.phase !== state.currentPhase) {
			return {
				content: [{ type: "text", text: `Phase mismatch: current phase is ${state.currentPhase}, but you submitted phase ${params.phase}.` }],
				isError: true,
			};
		}

		const phaseConfig = PHASES[params.phase - 1];

		// 1. Run gate script
		const gateResult = await runGateScript(state.topicDir, params.phase);
		if (!gateResult.passed) {
			return {
				content: [{ type: "text", text: `Phase ${params.phase} gate FAILED:\n\n${gateResult.output}\n\nFix the issues above and call coding-workflow-gate(phase=${params.phase}) again.` }],
				isError: true,
			};
		}

		// 2. Dispatch review subagent
		let reviewResult;
		try {
			reviewResult = await dispatchReviewSubagent(
				phaseConfig, state.topicDir,
				signal, onUpdate,
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				content: [{ type: "text", text: `Failed to dispatch review subagent: ${msg}\n\nGate script passed. You can retry by calling coding-workflow-gate(phase=${params.phase}) again.` }],
				isError: true,
			};
		}

		if (!reviewResult.success) {
			return {
				content: [{ type: "text", text: `Review subagent failed: ${reviewResult.error}\n\nGate script passed. You can retry by calling coding-workflow-gate(phase=${params.phase}) again.` }],
				isError: true,
			};
		}

		// 3. Parse review verdict
		const { verdict, mustFix } = parseReviewVerdict(reviewResult.reviewPath);
		if (mustFix > 0 || verdict !== "pass") {
			// Read review content to return to AI
			let reviewContent = "";
			try { reviewContent = fs.readFileSync(reviewResult.reviewPath, "utf8"); } catch { /* ignore */ }
			return {
				content: [{ type: "text", text: `Phase ${params.phase} review found issues (must_fix=${mustFix}).\n\nReview file: ${reviewResult.reviewPath}\n\n${reviewContent.slice(0, 4000)}\n\nFix the MUST_FIX issues above and call coding-workflow-gate(phase=${params.phase}) again.` }],
				isError: true,
			};
		}

		// 4. Dispatch retrospect subagent (non-blocking on failure)
		try {
			await dispatchRetrospectSubagent(phaseConfig, state.topicDir, signal, onUpdate);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[coding-workflow] Retrospect subagent failed: ${msg}`);
		}

		// 5. Update state
		state.phaseResults[params.phase] = "passed";
		persistState();
		updateWidget(ctx);

		// Build usage stats from review result
		const usageLine = reviewResult.result
			? formatUsageStats(reviewResult.result.usage, reviewResult.result.model)
			: "";

		if (params.phase >= 5) {
			return {
				content: [{ type: "text", text: `Phase ${params.phase} (${phaseConfig.name}) gate PASSED. All 5 phases completed!${usageLine ? `\nUsage: ${usageLine}` : ""}\n\nWorkflow "${state.topicName}" is done. Widget cleared.` }],
			};
		}

		return {
			content: [{ type: "text", text: `Phase ${params.phase} (${phaseConfig.name}) gate PASSED. Review: verdict=pass, must_fix=0.${usageLine ? ` ${usageLine}` : ""}\n\nCall coding-workflow-phase-start() to transition to Phase ${params.phase + 1}.` }],
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
		// Show first 10 lines to avoid TUI spam
		const preview = text.split("\n").slice(0, 10).join("\n");
		return new Text(`${icon} ${preview}`, 0, 0);
	},
});
```

**Note on skills access in gate tool:** The `execute` function receives `ctx` but not `systemPromptOptions`. To get the skills list for `dispatchReviewSubagent`, use the file system fallback in `getExpertReviewerContent` (reading from `~/.pi/agent/skills/`). The skills parameter can be passed as an empty array since the helper will fall back to direct file reads.

- [ ] **Step 6: Tool — coding-workflow-phase-start**

```typescript
pi.registerTool({
	name: "coding-workflow-phase-start",
	label: "Coding Workflow Phase Start",
	description: "Transition to next phase after gate passes. No parameters — automatically advances from current phase.",
	parameters: Type.Object({}),
	promptSnippet: "Transition to next coding workflow phase after gate success",
	promptGuidelines: [
		"Use coding-workflow-phase-start ONLY after coding-workflow-gate returns success",
		"No parameters needed — automatically advances to next phase",
		"Phase 5 does not need phase-start — gate success means workflow complete",
	],
	async execute(toolCallId, _params, _signal, _onUpdate, ctx) {
		if (!state.isActive) {
			return { content: [{ type: "text", text: "No active workflow." }], isError: true };
		}

		// Check gate passed for current phase
		if (state.phaseResults[state.currentPhase] !== "passed") {
			return {
				content: [{ type: "text", text: `Phase ${state.currentPhase} gate has not passed yet. Call coding-workflow-gate(phase=${state.currentPhase}) first.` }],
				isError: true,
			};
		}

		// Check retrospect file exists (should exist since gate dispatches it)
		const prevPhaseConfig = PHASES[state.currentPhase - 1];
		const retrospectPath = path.join(
			state.topicDir, "changes", "reviews",
			`${prevPhaseConfig.retrospectPrefix}.md`,
		);
		if (!fs.existsSync(retrospectPath)) {
			console.warn(`[coding-workflow] Retrospect file missing: ${retrospectPath}`);
		}

		// Advance phase
		state.currentPhase += 1;
		persistState();
		updateWidget(ctx);

		// Check if all phases done
		if (state.currentPhase > 5) {
			state.isActive = false;
			state.currentPhase = 0;
			state.phaseResults = {};
			persistState();
			updateWidget(ctx);
			return {
				content: [{ type: "text", text: "All phases completed! Workflow finished." }],
			};
		}

		// Trigger compact with phase transition
		const nextPhaseConfig = PHASES[state.currentPhase - 1];
		const customInstructions =
			`Transitioning to Phase ${state.currentPhase}: ${nextPhaseConfig.name}. ` +
			`Topic directory: ${state.topicDir}. ` +
			`Previous phase deliverables are in ${state.topicDir}.`;

		ctx.compact({
			customInstructions,
			onComplete: () => {
				const phaseSkill = nextPhaseConfig.skillName;
				pi.sendUserMessage(
					`Phase ${state.currentPhase} (${nextPhaseConfig.name}) started. ` +
					`The skill "${phaseSkill}" will be injected automatically.\n\n` +
					`Begin working on Phase ${state.currentPhase} deliverables. ` +
					`When ready, call coding-workflow-gate(phase=${state.currentPhase}).`,
					{ deliverAs: "followUp" },
				);
			},
			onError: (error) => {
				console.warn(`[coding-workflow] Compact failed: ${error.message}`);
				// Still inject new phase instructions even if compact fails
				pi.sendUserMessage(
					`Phase ${state.currentPhase} (${nextPhaseConfig.name}) started (compact skipped).\n\n` +
					`Begin working on Phase ${state.currentPhase} deliverables. ` +
					`When ready, call coding-workflow-gate(phase=${state.currentPhase}).`,
					{ deliverAs: "followUp" },
				);
			},
		});

		return {
			content: [{
				type: "text",
				text: `Compacting and transitioning to Phase ${state.currentPhase} (${nextPhaseConfig.name})...`,
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
```

- [ ] **Step 7: Commands — /coding-workflow, /coding-workflow-status, /coding-workflow-abort**

**`/coding-workflow <topic>`:**
```
1. if state.isActive → notify error
2. Generate topic slug: date + sanitized topic name
3. Create topicDir (absolute path to .xyz-harness/{slug}/)
4. Create changes/reviews subdirectory
5. Initialize state: isActive=true, currentPhase=1, topicDir, topicName
6. persistState()
7. updateWidget(ctx)
8. pi.sendUserMessage(Phase 1 kickoff instructions)
```

**`/coding-workflow-status`:**
```
1. if !state.isActive → notify "No active workflow"
2. notify with: topicName, currentPhase, passed phases list
```

**`/coding-workflow-abort`:**
```
1. if !state.isActive → notify "No active workflow"
2. for each proc in activeSubprocesses: proc.kill()
3. activeSubprocesses.length = 0
4. state = { ...DEFAULT_STATE }
5. persistState()
6. updateWidget(ctx)
7. notify "Workflow aborted"
```

- [ ] **Step 8: Event — before_agent_start**

```typescript
pi.on("before_agent_start", async (event, ctx) => {
	if (!state.isActive) return;

	const phaseConfig = PHASES[state.currentPhase - 1];
	if (!phaseConfig) return;

	// Cache skills for use by gate tool's dispatchReviewSubagent
	cachedSkills = event.systemPromptOptions.skills || [];

	let skillContent: string;
	try {
		skillContent = getSkillContent(
			event.systemPromptOptions.skills,
			phaseConfig.skillName,
		);
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
		`[CODING WORKFLOW — STRICT MODE]\n\n` +
		`Current Phase: ${phaseConfig.name} (Phase ${state.currentPhase})\n` +
		`Topic Directory: ${state.topicDir}\n\n` +
		`YOUR ONLY GOAL: Produce deliverables for this phase and pass the gate.\n\n` +
		`RULES (VIOLATION = FAILURE):\n` +
		`- Do NOT start any work outside the current phase scope\n` +
		`- Do NOT plan, design, or implement anything for future phases\n` +
		`- Do NOT ask about or speculate about what comes after this phase\n` +
		`- When deliverables are complete, call coding-workflow-gate(phase=${state.currentPhase})\n` +
		`- You will receive new instructions ONLY after passing the gate\n\n` +
		`--- Phase Skill ---\n${skillContent}\n--- End Phase Skill ---`;

	// Phase 5 special constraint
	if (state.currentPhase === 5) {
		injection +=
			`\n\nCRITICAL RULE FOR THIS PHASE:\n` +
			`- You MUST NOT merge the PR under any circumstances\n` +
			`- PR merging requires explicit human approval outside this workflow\n` +
			`- Your task is ONLY to: create the PR, verify CI passes, produce evidence`;
	}

	return {
		message: {
			customType: "coding-workflow-context",
			content: injection,
			display: false,
		},
	};
});
```

- [ ] **Step 9: Events — session_start, turn_end**

```typescript
pi.on("session_start", async (_event, ctx) => {
	reconstructState(ctx);
	updateWidget(ctx);
});

pi.on("turn_end", async (_event, ctx) => {
	if (!state.isActive) return;
	updateWidget(ctx);
});
```

- [ ] **Step 10: State persistence and recovery**

```typescript
function persistState(): void {
	pi.appendEntry("coding-workflow", {
		isActive: state.isActive,
		currentPhase: state.currentPhase,
		topicDir: state.topicDir,
		topicName: state.topicName,
		phaseResults: state.phaseResults,
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
}
```

- [ ] **Step 11: Widget rendering**

```typescript
function updateWidget(ctx: ExtensionContext): void {
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
		lines.push(`  ${icon} Phase ${p.phase}: ${name}${current ? " (current)" : ""}`);
	}

	ctx.ui.setWidget("coding-workflow", lines);
	ctx.ui.setStatus(
		"coding-workflow",
		th.fg("accent", `Phase ${state.currentPhase}/5`),
	);
}
```

- [ ] **Step 12: Message renderer**

```typescript
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
```

- [ ] **Step 13: Verify extension loads**

Run: `pi --extension ~/.pi/agent/extensions/coding-workflow/index.ts -p "echo test"`
Expected: No TypeScript compilation errors, extension loads successfully

- [ ] **Step 14: Commit**

```bash
cd ~/.pi/agent/extensions/coding-workflow
git add index.ts lib/model-resolve.ts lib/subagent.ts
git commit -m "feat: implement coding-workflow extension with gate, review, and phase transition"
```

---

## Execution Groups

#### BG1: Extension Implementation

**Description:** All files for the coding-workflow extension. All code is backend TypeScript + Python gate script. Single group because files are tightly coupled (index.ts imports from lib/).

**Tasks:** Task 1, Task 2, Task 3, Task 4

**Files (预估):** 4 个文件（4 create + 0 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose |
| Model | `router-openai/glm-5.1` |
| 注入上下文 | Task 描述（含完整代码骨架）+ spec.md 的 FR 章节 + Pi extension API 文档 |
| 读取文件 | `xyz-pi-extensions/subagent/src/index.ts`（提取 spawn 逻辑）、`todolist/index.ts`（状态管理模式）、`xyz-harness-gate/scripts/check_gate.py`（复制） |
| 修改/创建文件 | `lib/model-resolve.ts`, `lib/subagent.ts`, `gate-check.py`, `index.ts` |

**Execution Flow (BG1 内部):** 串行派遣，按 Wave 编排。

  Wave 1 (并行): Task 1 + Task 3
    1. Task 1: Create lib/model-resolve.ts — 直接写入
    2. Task 3: Copy gate-check.py — cp 命令

  Wave 2: Task 2 (依赖 Task 1 — imports from model-resolve)
    1. Task 2: Create lib/subagent.ts — 直接写入

  Wave 3: Task 4 (依赖 Task 1, 2, 3 — imports all lib/ + gate-check.py)
    1. Task 4: Create index.ts — 主扩展文件

**Dependencies:** 无

**设计细节:** 所有代码直接写在此处，不使用 L2 子文档模式。

---

## Dependency Graph & Wave Schedule

```
Task 1 (model-resolve) ──┬──→ Task 2 (subagent) ──→ Task 4 (index.ts)
Task 3 (gate-check.py) ──┘─────────────────────────↗
```

| Wave | Tasks | 说明 |
|------|-------|------|
| Wave 1 | Task 1, Task 3 | 无依赖，可并行 |
| Wave 2 | Task 2 | 依赖 Task 1 (imports model-resolve) |
| Wave 3 | Task 4 | 依赖 Task 1, 2, 3 (imports all) |

---

## Self-Review

### 1. Spec Coverage

| FR/AC | Task | Covered |
|-------|------|---------|
| FR-1: Workflow 启动 | Task 4 (command) | ✓ |
| FR-2: AI 上下文注入 | Task 4 (before_agent_start) | ✓ |
| FR-3: Gate Tool | Task 4 (coding-workflow-gate) | ✓ |
| FR-4: Phase Start Tool | Task 4 (coding-workflow-phase-start) | ✓ |
| FR-5: TUI Widget | Task 4 (updateWidget) | ✓ |
| FR-6: Subagent Dispatch | Task 2 (runSingleAgent) + Task 4 (dispatch helpers) | ✓ |
| FR-7: State Persistence | Task 4 (persistState/reconstructState) | ✓ |
| FR-8: Phase 5 约束 | Task 4 (before_agent_start + gate tool) | ✓ |
| FR-9: 状态查询与管理 | Task 4 (commands) | ✓ |
| FR-10: Custom Rendering | Task 4 (renderCall/renderResult) | ✓ |
| FR-11: 错误处理 | Task 2 (spawn error) + Task 4 (try-catch) | ✓ |
| AC-1: 启动与 Phase 1 | Task 4 (command + before_agent_start) | ✓ |
| AC-2: Gate 检查 | Task 3 + Task 4 (gate tool) | ✓ |
| AC-3: Review & Retrospect | Task 2 + Task 4 (dispatch helpers) | ✓ |
| AC-4: Phase Transition | Task 4 (phase-start tool) | ✓ |
| AC-5: Phase 5 PR | Task 4 (before_agent_start) | ✓ |
| AC-6: 状态持久化 | Task 4 (reconstructState) | ✓ |
| AC-7: Extension 全局可用 | File placement at ~/.pi/agent/extensions/ | ✓ |

### 2. Placeholder Scan

No TBD/TODO/fill-in-later patterns found in task steps. All code blocks contain complete implementations.

### 3. Type Consistency

- `WorkflowState` used consistently across `persistState`, `reconstructState`, and module-level `state`
- `PhaseConfig` array `PHASES` referenced in gate tool, phase-start tool, widget, and before_agent_start
- `TaskComplexity` and `ThinkingLevel` exported from `model-resolve.ts`, imported in `subagent.ts` and `index.ts`
- `SingleResult` and `UsageStats` exported from `subagent.ts`, used in `index.ts`
- `COMPLEXITY_DEFAULT_THINKING` used for review (medium→high) and retrospect (low→high)
