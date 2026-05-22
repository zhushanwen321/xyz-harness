/**
 * ProcessManager — 封装子进程生命周期管理。
 *
 * 从 subagent.ts 提取的关注点：
 * - ChildProcess spawn
 * - 双计时器管理（activity + global timeout）
 * - SIGTERM → SIGKILL 渐进终止
 * - AbortSignal 监听
 * - processRegistry 注册/注销
 * - settled flag 防止重复 resolve
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

// ─── Constants ───────────────────────────────────────────

/** 10 min global timeout */
export const DEFAULT_GLOBAL_TIMEOUT_MS = 10 * 60 * 1000;
/** 5 min no-activity timeout */
export const DEFAULT_ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────

export interface ProcessOpts {
	cwd: string;
	shell?: boolean;
	stdio?: "pipe" | "ignore" | "inherit" | any[];
	activityTimeoutMs?: number;
	globalTimeoutMs?: number;
	signal?: AbortSignal;
	/** Optional array to register the spawned ChildProcess for external lifecycle management (e.g. abort). */
	processRegistry?: ChildProcess[];
}

export interface ProcessResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	wasAborted: boolean;
}

// ─── ProcessManager ──────────────────────────────────────

export class ProcessManager {
	spawn(
		command: string,
		args: string[],
		opts: ProcessOpts,
	): Promise<ProcessResult> {
		const {
			cwd,
			shell = false,
			stdio = ["ignore", "pipe", "pipe"],
			activityTimeoutMs = DEFAULT_ACTIVITY_TIMEOUT_MS,
			globalTimeoutMs = DEFAULT_GLOBAL_TIMEOUT_MS,
			signal,
			processRegistry,
		} = opts;

		return new Promise<ProcessResult>((resolve) => {
			let settled = false;
			let stdout = "";
			let stderr = "";
			let wasAborted = false;

			let activityTimer: ReturnType<typeof setTimeout>;

			const settle = (exitCode: number) => {
				if (settled) return;
				settled = true;
				clearTimeout(activityTimer);
				clearTimeout(globalTimer);
				resolve({ exitCode, stdout, stderr, wasAborted });
			};

			const proc = spawn(command, args, { cwd, shell, stdio });

			// Register process for external lifecycle management (abort)
			if (processRegistry) {
				processRegistry.push(proc);
				proc.on("close", () => {
					const idx = processRegistry.indexOf(proc);
					if (idx !== -1) processRegistry.splice(idx, 1);
				});
			}

			// Activity timer: reset externally via resetActivity()
			const resetActivity = () => {
				clearTimeout(activityTimer);
				activityTimer = setTimeout(() => {
					if (!settled) {
						stderr += `\nSubagent timed out: no activity for ${Math.round(activityTimeoutMs / 1000)} seconds`;
						proc.kill("SIGTERM");
						setTimeout(() => {
							if (!proc.killed) proc.kill("SIGKILL");
							settle(1);
						}, 5000);
					}
				}, activityTimeoutMs);
			};
			resetActivity();

			// Global timer: hard cap regardless of activity
			const globalTimer = setTimeout(() => {
				if (!settled) {
					stderr += `\nSubagent timed out: ${Math.round(globalTimeoutMs / 60000)} minute global limit exceeded`;
					proc.kill("SIGKILL");
					settle(1);
				}
			}, globalTimeoutMs);

			proc.stdout!.on("data", (data: Buffer) => {
				stdout += data.toString();
				resetActivity();
			});

			proc.stderr!.on("data", (data: Buffer) => {
				stderr += data.toString();
			});

			proc.on("close", (code) => {
				settle(code ?? 0);
			});

			proc.on("error", (err) => {
				stderr += `Spawn error: ${err.message}`;
				settle(1);
			});

			// AbortSignal handling
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
	}
}
