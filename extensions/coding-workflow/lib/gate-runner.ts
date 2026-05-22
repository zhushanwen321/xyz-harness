/**
 * GateRunner — spawn gate-check.py and parse JSON results.
 */

import { spawn } from "node:child_process";

// ─── Types ────────────────────────────────────────────────

export interface GateCheckItem {
	name: string;
	passed: boolean;
	detail: string;
}

export interface GateResult {
	passed: boolean;
	output: string;
	checks?: GateCheckItem[];
}

// ─── Constants ────────────────────────────────────────────

const GATE_SCRIPT_TIMEOUT_MS = 30_000; // 30s timeout for gate-check.py

// ─── Gate runner ──────────────────────────────────────────

export async function runGateScript(
	gateScriptPath: string,
	topicDir: string,
	phase: number,
): Promise<GateResult> {
	return new Promise((resolve) => {
		let settled = false;
		const settle = (result: GateResult) => {
			if (settled) return;
			settled = true;
			resolve(result);
		};

		const proc = spawn("python3", [gateScriptPath, topicDir, String(phase), "--json"], {
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";

		const timeout = setTimeout(() => {
			proc.kill("SIGKILL");
			settle({ passed: false, output: "Gate check script timed out after 30s" });
		}, GATE_SCRIPT_TIMEOUT_MS);

		proc.stdout.on("data", (d) => { stdout += d.toString(); });
		proc.stderr.on("data", (d) => { stderr += d.toString(); });
		proc.on("close", (code) => {
			clearTimeout(timeout);
			if (code !== 0) {
				// Try to parse JSON error output first
				try {
					const jsonResult = JSON.parse(stdout);
					settle({
						passed: false,
						output: jsonResult.checks
							?.filter((c: any) => !c.passed)
							.map((c: any) => `  - ${c.name}: ${c.detail}`)
							.join("\n") || stdout,
						checks: jsonResult.checks,
					});
				} catch {
					settle({ passed: false, output: stdout + (stderr ? `\n${stderr}` : "") });
				}
				return;
			}
			// Parse JSON success output
			try {
				const jsonResult = JSON.parse(stdout);
				settle({
					passed: true,
					output: `All ${jsonResult.total_checks} checks passed.`,
					checks: jsonResult.checks,
				});
			} catch {
				settle({ passed: true, output: stdout });
			}
		});
		proc.on("error", (err) => {
			clearTimeout(timeout);
			settle({ passed: false, output: `Gate script spawn error: ${err.message}` });
		});
	});
}
