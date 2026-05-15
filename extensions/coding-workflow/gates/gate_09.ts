// Gate 09 — 编码实现门禁（编译 + 测试 + lint）
// 对标 bash gate_09() 函数
// 检查 spec.md / plan.md 存在性、plan Task 数、CLAUDE.md 质量门禁配置、
// 然后逐一执行 CLAUDE.md 中的质量门禁命令

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  type GateResult,
  createPassFile,
  formatFailMessage,
  checkFile,
  readGates,
  runCommand,
  checkClaudeMdGates,
} from "./common";

/**
 * Gate 09 — 编码实现门禁。
 *
 * 验证编码实现阶段的交付物质量：
 * 1. 检查 spec.md 和 plan.md 存在且非空
 * 2. 统计 plan.md 中的 Task 数量
 * 3. 检查 CLAUDE.md 的质量门禁章节配置
 * 4. 逐一执行质量门禁命令（编译/测试/lint）
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param signal - 可选的 AbortSignal，用于取消操作
 * @returns GateResult
 *
 * @example
 * ```typescript
 * const result = await gate_09("/path/to/project");
 * console.log(result.output);
 * ```
 */
export async function gate_09(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  if (signal?.aborted) {
  return { passed: false, output: "Gate 09 aborted before execution" };
  }

  const outputLines: string[] = [];

  // 收集所有命令执行错误，最后统一判断
  const errors: string[] = [];

  // ── 1. 查找 spec.md / plan.md ──────────────────────────
  const xyzHarnessDir = join(projectRoot, ".xyz-harness");
  const specPath = findFile(xyzHarnessDir, "spec.md");
  const planPath = findFile(xyzHarnessDir, "plan.md");

  if (specPath) {
  const result = checkFile("spec.md", specPath);
  outputLines.push(result.output);
  } else {
  outputLines.push("[WARN] spec.md not found");
  }

  if (planPath) {
  const result = checkFile("plan.md", planPath);
  outputLines.push(result.output);
  } else {
  outputLines.push("[WARN] plan.md not found");
  }

  // ── 2. plan Task 数统计 ────────────────────────────────
  if (planPath && existsSync(planPath)) {
  try {
    const content = readFileSync(planPath, "utf8");
    const taskMatches = content.match(/^###\s+Task/gm);
    const taskCount = taskMatches ? taskMatches.length : 0;
    outputLines.push(`[INFO] plan.md tasks: ${taskCount}`);
  } catch {
    outputLines.push("[WARN] plan.md tasks: unable to count");
  }
  }

  // ── 3. CLAUDE.md 质量门禁可操作性检查 ─────────────────
  const gateWarnings = checkClaudeMdGates(projectRoot);
  outputLines.push(...gateWarnings);

  // ── 4. 运行 CLAUDE.md 中的质量门禁命令 ────────────────
  const gates = readGates(projectRoot);

  if (gates.length === 0) {
  outputLines.push(
    "[WARN] no quality gate commands found in CLAUDE.md — skipping compile/test/lint check",
    "       This gate is effectively a no-op. To enable real checks, add a '## 质量门禁' section to CLAUDE.md.",
  );
  } else {
  for (const gate of gates) {
    if (signal?.aborted) {
    return { passed: false, output: outputLines.join("\n") + "\nGate 09 aborted during command execution" };
    }
    const result = runCommand(projectRoot, gate.type, gate.command);
    outputLines.push(result.output);
    if (!result.ok) {
    errors.push(`Command '${gate.command}' (${gate.type}) failed`);
    }
  }
  }

  // ── 5. 结果判断 ────────────────────────────────────────
  if (errors.length > 0) {
  const failOutput = formatFailMessage(
    "09",
    `${errors.length} 条命令执行失败`,
    "检查上述 [FAIL] 命令的输出，修复编译/测试/lint 错误后重新调用 harness_stage_complete。如果是 CLAUDE.md 中的命令配置错误，请修正 CLAUDE.md 的 '## 质量门禁' 章节",
  );
  outputLines.push(failOutput);
  return {
    passed: false,
    output: outputLines.join("\n"),
  };
  }

  // ── 通过 ───────────────────────────────────────────────
  const passResult = createPassFile(projectRoot, "09", "gate 09: coding gate passed");
  outputLines.push(passResult.output);
  return {
  passed: true,
  output: outputLines.join("\n"),
  };
}

/**
 * 在指定目录下递归查找匹配文件名的第一个文件。
 * 对标 bash `find <dir> -name <filename> -type f | head -1`。
 */
function findFile(rootDir: string, fileName: string): string | null {
  if (!existsSync(rootDir)) {
  return null;
  }

  try {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
    const found = findFile(fullPath, fileName);
    if (found) return found;
    } else if (entry.isFile() && entry.name === fileName) {
    return fullPath;
    }
  }
  } catch {
  // 跳过无权限等不可访问的目录
  }

  return null;
}
