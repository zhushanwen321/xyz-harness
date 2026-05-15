/**
 * Gate 11 — 单元测试门禁
 *
 * L1 门禁：检查最近提交中是否包含测试文件，并执行 CLAUDE.md 中配置的测试命令。
 *
 * 流程：
 *   1. 自适应计算 commit 范围（最多回溯 5 个 commit）
 *   2. 检测范围内是否有测试/ spec 文件的变更
 *   3. 从 CLAUDE.md 质量门禁章节读取测试命令并执行
 *   4. 无测试命令时警告并通过（创建 pass 标记文件）
 *
 * 对标 bash gate-script.sh 中的 gate_11() 函数。
 */

import { execSync } from "node:child_process";

import {
  createPassFile,
  formatFailMessage,
  readGates,
  runCommand,
  type GateResult,
} from "./common";

/**
 * 测试/ spec 文件名的匹配正则。
 * 匹配：包含 test/spec/__tests__ 目录，或 .test./.spec. 文件名模式。
 */
const TEST_FILE_RE = /(test|spec|__tests__|\.test\.|\.spec\.)/i;

/**
 * 执行门禁 11：单元测试检查。
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param signal - 可选的 AbortSignal，用于在竞态或超时时取消操作
 * @returns 通过返回 `{ passed: true, output }`，失败返回 `{ passed: false, output }`
 */
export async function gate_11(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  try {
  signal?.throwIfAborted();

  // ── 1. 自适应计算 commit 范围 ────────────────────────────

  let commitCount: number;
  try {
    const raw = execSync("git rev-list --count HEAD", {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 10_000,
    });
    commitCount = parseInt(raw.trim(), 10);
  } catch {
    commitCount = 0;
  }

  // ── 2. 检测范围内的测试文件变更 ──────────────────────────
  // 单 commit 仓库用 git show（git diff HEAD 无 parent 无输出）
  let changedFiles: string;
  if (commitCount <= 1) {
  try {
  changedFiles = execSync('git show --name-only --format="" HEAD', {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 10_000,
  }).trim();
  } catch {
  changedFiles = "";
  }
  console.log(`[INFO] checking test files in single-commit repo (git show HEAD)`);
  } else {
  const range = `HEAD~${Math.min(commitCount - 1, 5)}`;
  try {
  changedFiles = execSync(`git diff --name-only "${range}"`, {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 10_000,
  }).trim();
  } catch {
  changedFiles = "";
  }
  }

  const testFiles = changedFiles
  .split("\n")
  .filter((f) => f.trim() && TEST_FILE_RE.test(f));

  if (testFiles.length === 0) {
  console.warn("[WARN] no test/spec files found in recent commits");
  } else {
    console.log("[PASS] found test/spec files in changes");
    for (const f of testFiles) {
    console.log(`  ${f}`);
    }
  }

  signal?.throwIfAborted();

  // ── 3. 从 CLAUDE.md 读取测试命令 ─────────────────────────

  const gates = readGates(projectRoot).filter((g) => g.type === "test");

  if (gates.length === 0) {
    console.warn(
    "[WARN] no test command in CLAUDE.md '## 质量门禁' section",
    );
    console.warn("       Add: - 测试: `npm test`");
    return createPassFile(
    projectRoot,
    "11",
    "gate 11: unit test gate passed (no test commands configured)",
    );
  }

  signal?.throwIfAborted();

  // ── 4. 执行测试命令 ──────────────────────────────────────

  const failures: Array<{ command: string; output: string }> = [];

  for (const gate of gates) {
    const result = runCommand(projectRoot, gate.type, gate.command);
    console.log(result.output);
    if (!result.ok) {
    failures.push({ command: gate.command, output: result.output });
    }
  }

  signal?.throwIfAborted();

  // ── 5. 汇总结果 ──────────────────────────────────────────

  if (failures.length > 0) {
    const failMsg = `${failures.length} 条测试命令失败`;
    const fixHint =
    "检查上述 [FAIL] 测试命令的输出，修复失败的测试用例或代码后重新调用 harness_stage_complete";
    console.log(formatFailMessage("11", failMsg, fixHint));
    return { passed: false, output: formatFailMessage("11", failMsg, fixHint) };
  }

  return createPassFile(
    projectRoot,
    "11",
    "gate 11: unit test gate passed",
  );
  } catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { passed: false, output: "GATE FAIL: gate 11 — cancelled" };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { passed: false, output: `GATE FAIL: gate 11 — ${message}` };
  }
}
