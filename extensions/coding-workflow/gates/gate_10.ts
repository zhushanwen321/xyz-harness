import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPassFile, detectBranch, formatFailMessage } from "./common";
import type { GateResult } from "./common";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TDD_SCRIPT_PATH = join(__dirname, "..", "scripts", "tdd-order-check.sh");

const FIX_HINT =
  "确保每个实现文件的测试文件先于实现文件提交（git log 验证）。如果需要豁免某些文件，将其 glob 模式添加到 .xyz-harness/tdd-skip-patterns.txt。修复后重新调用 harness_stage_complete";

/**
 * Gate 10: TDD 提交顺序检测
 *
 * 验证 git 历史中测试文件的提交是否先于对应的实现文件。
 * 调用 scripts/tdd-order-check.sh 执行检测逻辑。
 *
 * 如果 tdd-order-check.sh 不存在，则警告并跳过（创建 pass 标记文件）。
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param signal - 可选的 AbortSignal，用于在竞态或超时时取消操作
 * @returns `{ passed: true, output }` 或 `{ passed: false, output }`
 */
export async function gate_10(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  if (signal?.aborted) {
  return { passed: false, output: "GATE ABORTED" };
  }

  // 1. 自动检测分支，无法检测时回退到 main
  const branch = detectBranch(projectRoot) || "main";

  // 2. 检查 tdd-order-check.sh 是否存在
  if (!existsSync(TDD_SCRIPT_PATH)) {
  // TDD check script missing — skip silently (already handled by createPassFile below)
  return createPassFile(projectRoot, "10", "TDD check skipped (script missing)");
  }

  // 3. 执行 TDD 顺序检测
  try {
  const command = `bash "${TDD_SCRIPT_PATH}" "${projectRoot}" "${branch}"`;
  const stdout = execSync(command, {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return createPassFile(projectRoot, "10", "TDD order verified");
  } catch (err) {
  const error = err as {
    stdout?: Buffer | string;
    stderr?: Buffer | string;
    message?: string;
  };
  const _output = (error.stdout ?? error.stderr ?? error.message ?? String(err)).toString();
  return {
    passed: false,
    output: formatFailMessage("10", "TDD 提交顺序违规", FIX_HINT),
  };
  }
}
