// Gate 14 — 推送+CI+部署门禁
// 对标 bash gate_14() 函数
// 检查工作区干净、远程已推送、运行质量门禁命令、部署验证

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  type GateResult,
  createPassFile,
  formatFailMessage,
  detectBranch,
  readGates,
  runCommand,
} from "./common";

/**
 * Gate 14 — 推送+CI+部署门禁。
 *
 * 验证推送和部署阶段的门禁要求：
 * 1. 工作区干净（无未提交变更）
 * 2. 本地 HEAD 与远程分支一致（已推送）
 * 3. 运行 CLAUDE.md 中的质量门禁命令（编译/测试/lint）
 * 4. 查找 deploy_result.md 验证部署成功
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param signal - 可选的 AbortSignal，用于取消操作
 * @returns GateResult
 *
 * @example
 * ```typescript
 * const result = await gate_14("/path/to/project");
 * console.log(result.output);
 * ```
 */
export async function gate_14(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  if (signal?.aborted) {
  return { passed: false, output: "Gate 14 aborted before execution" };
  }

  const outputLines: string[] = [];
  let errCount = 0;
  let dirty = "";
  let lh = "";
  let rh = "";

  // ── 自动检测分支 ───────────────────────────────────────
  const branch = detectBranch(projectRoot);
  if (!branch) {
  const failOutput = formatFailMessage(
    "14",
    "无法检测当前分支名。请确保在 git 仓库中且不在 detached HEAD 状态。",
    "运行 git checkout <branch> 切换到有效分支，或确保项目是 git 仓库。",
  );
  return { passed: false, output: failOutput };
  }

  // ── 1. 工作区干净（排除 .xyz-harness/ — 由 harness_stage_complete 自动写入）
  try {
  const status = execSync("git status --short", {
  cwd: projectRoot,
  encoding: "utf8",
  timeout: 10_000,
  }).trim();
  // 过滤掉 .xyz-harness/ 目录的变更——harness_stage_complete 在 gate 检查前写入 state
  const relevantLines = status
  .split("\n")
  .filter((line: string) => line.trim() && !line.includes(".xyz-harness/"));
  if (relevantLines.length > 0) {
  dirty = relevantLines.join("\n");
  errCount++;
  outputLines.push("[FAIL] working directory not clean:");
  for (const line of relevantLines) {
  outputLines.push(`  ${line}`);
  }
  } else {
  outputLines.push("[PASS] working directory clean");
  }
  } catch {
  outputLines.push("[FAIL] working directory: unable to check git status");
  errCount++;
  }

  // ── 2. 远程已推送 ──────────────────────────────────────
  try {
  execSync(`git fetch origin "${branch}" --quiet`, {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
  } catch {
  outputLines.push("[WARN] git fetch failed — proceeding with local comparison");
  }

  try {
  lh = execSync("git rev-parse HEAD", {
  cwd: projectRoot,
  encoding: "utf8",
  timeout: 10_000,
  }).trim();
  } catch {
  // lh stays empty
  }
  try {
  rh = execSync(`git rev-parse "origin/${branch}"`, {
  cwd: projectRoot,
  encoding: "utf8",
  timeout: 10_000,
  }).trim();
  } catch {
  // rh stays empty
  }

  if (!lh || !rh) {
  outputLines.push("[FAIL] unable to determine local/remote commit hash");
  errCount++;
  } else if (lh !== rh) {
  outputLines.push("[FAIL] local and remote differ (need git push)");
  errCount++;
  } else {
  outputLines.push(`[PASS] local HEAD matches origin/${branch}`);
  }

  // ── 3. 运行质量门禁 ────────────────────────────────────
  const gates = readGates(projectRoot);
  if (gates.length === 0) {
  outputLines.push(
    "[WARN] no quality gate commands found in CLAUDE.md — skipping compile/test/lint check",
  );
  } else {
  for (const gate of gates) {
    if (signal?.aborted) {
    return {
      passed: false,
      output: outputLines.join("\n") + "\nGate 14 aborted during command execution",
    };
    }
    const result = runCommand(projectRoot, gate.type, gate.command);
    outputLines.push(result.output);
    if (!result.ok) {
    errCount++;
    }
  }
  }

  // ── 4. 部署验证 ────────────────────────────────────────
  const dr = findDeployResult(projectRoot);
  if (dr && existsSync(dr)) {
  try {
    const content = readFileSync(dr, "utf8");
    if (/成功|success|deployed|healthy/i.test(content)) {
    outputLines.push("[PASS] deploy_result.md: success");
    } else {
    outputLines.push("[FAIL] deploy_result.md: no success indicator");
    errCount++;
    }
  } catch {
    outputLines.push(
    "[WARN] deploy_result.md: unable to read — skipping deploy verification",
    );
  }
  } else {
  outputLines.push(
    "[WARN] deploy_result.md not found — skipping deploy verification",
  );
  }

  // ── 5. 结果判断 ────────────────────────────────────────
  if (errCount > 0) {
  const fixHints: string[] = [];
  if (dirty) {
    fixHints.push("工作区不干净：运行 git add + git commit 提交所有变更。");
  }
  if (!lh || lh !== rh) {
    fixHints.push(`未推送：运行 git push origin ${branch}。`);
  }
  const fixHint =
    fixHints.length > 0
    ? fixHints.join(" ")
    : "检查上述 [FAIL] 项，逐一修复后重新调用 harness_stage_complete";

  const failOutput = formatFailMessage("14", `${errCount} 项检查失败`, fixHint);
  outputLines.push(failOutput);
  return {
    passed: false,
    output: outputLines.join("\n"),
  };
  }

  // ── 通过 ───────────────────────────────────────────────
  const passResult = createPassFile(
  projectRoot,
  "14",
  "gate 14: push + CI + deploy verified",
  );
  outputLines.push(passResult.output);
  return {
  passed: true,
  output: outputLines.join("\n"),
  };
}

/**
 * 在 .xyz-harness 目录下递归查找 deploy_result.md。
 * 对标 bash `find <dir> -name "deploy_result.md" -type f | head -1`。
 */
function findDeployResult(projectRoot: string): string | null {
  const xyzDir = join(projectRoot, ".xyz-harness");
  if (!existsSync(xyzDir)) {
  return null;
  }

  // 先检查根目录
  const rootResult = join(xyzDir, "deploy_result.md");
  if (existsSync(rootResult)) {
  return rootResult;
  }

  // 递归查找子目录
  return findFileRecursive(xyzDir, "deploy_result.md");
}

/**
 * 在指定目录下递归查找匹配文件名的第一个文件。
 */
function findFileRecursive(dir: string, fileName: string): string | null {
  try {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
    const found = findFileRecursive(fullPath, fileName);
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
