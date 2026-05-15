// Workflow Controller — Gate Runner
// 调用 gate-script.sh 执行 L1 门禁检查

import { execFile } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

export interface GateResult {
  passed: boolean;
  output: string;
}

export class GateRunner {
  constructor(private readonly scriptsDir: string) {}

  async run(
  gateNumber: string,
  projectRoot: string,
  signal?: AbortSignal
  ): Promise<GateResult> {
  // (#10) 预检查 abort 状态
  if (signal?.aborted) {
    return { passed: false, output: "Aborted before gate execution" };
  }

  // (#5) 使用 projectRoot 解析脚本路径，而非 process.cwd()
  const scriptPath = join(projectRoot, this.scriptsDir, "gate-script.sh");

  // (#9) 脚本不存在时给出明确错误
  if (!existsSync(scriptPath)) {
    return {
    passed: false,
    output: `Gate script not found: ${scriptPath}. ` +
      `Ensure the project has skills/xyz-harness-dev-flow/scripts/gate-script.sh.`,
    };
  }

  return new Promise((resolve) => {
    const proc = execFile(
    "bash",
    [scriptPath, gateNumber, projectRoot],
    {
      cwd: projectRoot,
      maxBuffer: 1024 * 1024, // 1MB
      signal: signal ?? undefined,
      timeout: 120_000, // 2 minutes
    },
    (error, stdout, stderr) => {
      const output = (stdout ?? "") + (stderr ?? "");
      if (error) {
      resolve({ passed: false, output: output.trim() || error.message });
      } else {
      resolve({ passed: true, output: output.trim() });
      }
    }
    );

    // Handle abort during execution
    if (signal) {
    signal.addEventListener("abort", () => proc.kill(), { once: true });
    }
  });
  }
}
