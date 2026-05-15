// Workflow Controller — Gate Runner
// 调用 gate-script.sh 执行 L1 门禁检查
// 脚本路径：从扩展自身目录解析（非 projectRoot），实现零安装

import { execFile } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// 扩展自身目录（通过 symlink 解析到真实路径）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GateResult {
  passed: boolean;
  output: string;
}

export class GateRunner {
  /** 扩展目录下的 scripts/ 子目录 */
  private readonly scriptsDir: string;

  constructor() {
  this.scriptsDir = join(__dirname, "scripts");
  }

  async run(
  gateNumber: string,
  projectRoot: string,
  signal?: AbortSignal
  ): Promise<GateResult> {
  if (signal?.aborted) {
  return { passed: false, output: "Aborted before gate execution" };
  }

  const scriptPath = join(this.scriptsDir, "gate-script.sh");

  if (!existsSync(scriptPath)) {
  return {
  passed: false,
  output: `Gate script not found: ${scriptPath}. Ensure coding-workflow extension has scripts/ directory.`,
  };
  }

  return new Promise((resolve) => {
  const proc = execFile(
  "bash",
  [scriptPath, gateNumber, projectRoot],
  {
    cwd: projectRoot,
    maxBuffer: 1024 * 1024,
    signal: signal ?? undefined,
    timeout: 120_000,
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

  if (signal) {
  signal.addEventListener("abort", () => proc.kill(), { once: true });
  }
  });
  }
}
