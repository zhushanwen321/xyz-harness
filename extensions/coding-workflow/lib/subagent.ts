// Subagent spawn logic extracted from xyz-pi-extensions/subagent.
// Only single foreground mode needed (no parallel/chain/background).

import type { ChildProcess } from "node:child_process";
import { ProcessManager } from "./process-manager.js";
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
	return `${(count / 1000000).toFixed(1)}M`;
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

		const invocation = getPiInvocation(args);
		const pm = new ProcessManager();
		const procResult = await pm.spawn(invocation.command, invocation.args, {
			cwd,
			signal,
			processRegistry,
		});

		// Parse JSON lines from accumulated stdout
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
						// contextTokens: keep max (peak context window size)
						const ctx = usage.totalTokens || 0;
						if (ctx > result.usage.contextTokens) result.usage.contextTokens = ctx;
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

		const lines = procResult.stdout.split("\n");
		for (const line of lines) processLine(line);

		result.exitCode = procResult.exitCode;
		result.stderr = procResult.stderr;
		result.endTime = Date.now();
		result.durationMs = result.endTime - result.startTime;
		if (procResult.wasAborted) throw new Error("Subagent was aborted");
		return result;
	} finally {
		if (tmpPromptPath) {
			try { fs.unlinkSync(tmpPromptPath); } catch { /* ignore */ }
		}
	}
}
