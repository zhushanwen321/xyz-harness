// Gate Script — 门禁共享工具模块
// 提供 L1 门禁检查所需的所有工具函数（文件检查、命令执行、评审文件查找等）
// 对标 bash gate-script.sh 中的工具函数，迁移为 TypeScript 实现
// 注意：所有函数不 exit 进程，由上层调用者决定如何处理结果

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { EvidenceFile, LoopConfig } from "../types.js";

// ── 类型定义 ────────────────────────────────────────────────

export interface GateResult {
  passed: boolean;
  output: string;
}

// ── 门禁结果文件操作 ──────────────────────────────────────

/**
 * 创建门禁通过标记文件。
 * 在 .xyz-harness/gate/ 目录下写入 stage-{NN}.pass 文件，包含时间戳和消息。
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param gateNumber - 门禁编号（如 "03"、"3"、"09"，自动补零到两位）
 * @param message - 附加到 pass 文件的消息内容
 * @returns 创建成功返回 `{ passed: true, output }`，失败返回 `{ passed: false, output }`
 */
export function createPassFile(
  projectRoot: string,
  gateNumber: string,
  message: string,
): GateResult {
  const gateDir = join(projectRoot, ".xyz-harness", "gate");
  const padded = gateNumber.padStart(2, "0");
  const passFile = join(gateDir, `stage-${padded}.pass`);

  try {
  mkdirSync(gateDir, { recursive: true });
  const timestamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "+00:00");
  writeFileSync(passFile, `pass at ${timestamp}\n${message}\n`, "utf8");
  return { passed: true, output: `GATE PASS: gate ${gateNumber}` };
  } catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  return { passed: false, output: `Failed to create pass file: ${errorMessage}` };
  }
}

/**
 * 格式化门禁失败消息。
 * 对标 bash die() 函数，返回格式化字符串而非 exit。
 *
 * @param gateNumber - 门禁编号（如 "03"）
 * @param message - 失败原因描述
 * @param fixHint - 可选的修复指引（一行）
 * @returns 格式化后的失败消息字符串
 */
export function formatFailMessage(
  gateNumber: string,
  message: string,
  fixHint?: string,
): string {
  const lines: string[] = [
  "",
  "===========================================",
  `  GATE FAIL: gate ${gateNumber}`,
  `  ${message}`,
  ];
  if (fixHint) {
  lines.push("  ───────────────────────────────────────");
  lines.push(`  修复指引：${fixHint}`);
  }
  lines.push("===========================================");
  return lines.join("\n");
}

// ── 文件检查 ──────────────────────────────────────────────

/**
 * 检查指定文件是否存在且非空。
 * 对标 bash check_file() 函数。
 *
 * @param label - 文件的人类可读名称（用于输出消息）
 * @param filePath - 待检查文件的完整路径
 * @returns `{ ok: true, output }` 或 `{ ok: false, output }`
 */
export function checkFile(
  label: string,
  filePath: string,
): { ok: boolean; output: string } {
  if (!existsSync(filePath)) {
  return { ok: false, output: `[FAIL] ${label}: not found — ${filePath}` };
  }
  try {
  const stat = statSync(filePath);
  if (stat.size === 0) {
    return { ok: false, output: `[FAIL] ${label}: empty — ${filePath}` };
  }
  } catch {
  return { ok: false, output: `[FAIL] ${label}: unable to stat — ${filePath}` };
  }
  return { ok: true, output: `[PASS] ${label}: ok` };
}

// ── 评审文件查找 ──────────────────────────────────────────

/**
 * 在 .xyz-harness 目录下递归查找匹配的评审文件。
 * 搜索路径模式：`.../changes/reviews/{pattern}`
 * 对标 bash find_review() 函数，按排序取最新一个。
 *
 * @param projectRoot - 项目根目录
 * @param pattern - 文件 glob 模式，如 "spec_review*.md"、"plan_review*.md"
 * @returns 匹配的文件路径，未找到返回 null
 */
export function findReviewFile(
  projectRoot: string,
  pattern: string,
): string | null {
  const reviewRoot = join(projectRoot, ".xyz-harness");

  if (!existsSync(reviewRoot)) {
  return null;
  }

  // 使用递归实现 find 命令的等效行为
  const results = findFilesByPattern(reviewRoot, pattern);
  // 按文件名降序排序，取最新一个（与 bash sort -r | head -1 一致）
  results.sort((a, b) => b.localeCompare(a));
  return results.length > 0 ? results[0] : null;
}

/**
 * 递归查找匹配指定模式的文件。
 * 路径过滤：只匹配 `.../changes/reviews/{pattern}` 模式的文件。
 */
function findFilesByPattern(rootDir: string, pattern: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
    walk(fullPath);
    } else if (entry.isFile()) {
    // 检查路径是否匹配 */changes/reviews/{pattern}
    if (fullPath.includes("/changes/reviews/")) {
      // 文件名级别的 glob 匹配：将 pattern 中的 * 转为正则
      const regex = globToRegex(pattern);
      if (regex.test(entry.name)) {
      results.push(fullPath);
      }
    }
    }
  }
  }

  walk(rootDir);
  return results;
}

/**
 * 将简单的 glob pattern（仅含 * 通配符）转换为正则表达式。
 * 例如 "spec_review*.md" → /^spec_review.*\.md$/
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\*/g, ".*") + "$";
  return new RegExp(regexStr);
}

// ── MUST FIX 检查 ─────────────────────────────────────────

/**
 * 检查指定文件中是否存在未解决的 MUST FIX 标记。
 *
 * 优先解析 YAML frontmatter（机器可读元数据），解析不到时回退旧正则逻辑。
 * YAML 中 review.verdict 字段或 statistics.must_fix 字段为判定依据。
 *
 * 对标 bash no_must_fix() 函数。
 *
 * @param filePath - 待检查文件的完整路径
 * @returns `{ ok: true, output }`（未发现标记）或 `{ ok: false, output }`（存在标记）
 */
export function checkNoMustFix(
  filePath: string,
): { ok: boolean; output: string } {
  if (!existsSync(filePath)) {
  return { ok: true, output: "[PASS] no MUST FIX items (file not found)" };
  }

  let content: string;
  try {
  content = readFileSync(filePath, "utf8");
  } catch {
  return { ok: true, output: "[PASS] no MUST FIX items (unable to read file)" };
  }

  // ── 路径 A：YAML frontmatter（优先） ──
  const yamlResult = checkYamlVerdict(content);
  // checkYamlVerdict 不再返回 null：有 YAML 就返回 ok/fail，无 YAML 返回 null
  if (yamlResult !== null) return yamlResult;

  // ── 路径 B：旧正则（回退，无 YAML frontmatter 时使用） ──
  return checkNoMustFixLegacy(content);
}

// ── YAML 解析工具（导出供 index.ts / gate-verifier.ts 复用） ──────

/**
 * 从文件内容中提取 YAML frontmatter 的原始文本。
 *
 * @param content - 完整文件内容
 * @returns YAML 文本（不含 --- 标记），null 表示无 frontmatter
 */
export function extractYamlBlock(content: string): string | null {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  return fm ? fm[1] : null;
}

/**
 * 从 YAML frontmatter 中解析 verdict / must_fix。
 *
 * 解析成功 → 返回判定结果
 * 无法判定 → 返回 null（调用方回退旧逻辑）
 */
export function checkYamlVerdict(
  content: string,
): { ok: boolean; output: string } | null {
  const yaml = extractYamlBlock(content);
  if (!yaml) return null;

  // 1. 读 verdict 字段（扁平 `verdict:` 或嵌套 `  verdict:`）
  //    支持 pass / fail / passed_with_fixes 等带下划线和数字的值
  const verdictMatch = yaml.match(/^\s*verdict:\s*([a-z][a-z0-9_]*)\s*$/m);
  if (verdictMatch) {
  const verdict = verdictMatch[1];
  if (verdict === "pass") {
  return { ok: true, output: "[PASS] review verdict: pass" };
  }
  // 给出具体的修复指引
  return {
  ok: false,
  output: [
    `[FAIL] review verdict: "${verdict}" (expected "pass")`,
    `  修复指引：将 YAML frontmatter 中的 verdict 字段值改为 "pass"`,
    `  合法值：pass | fail（不允许 passed_with_fixes 等中间状态）`,
    `  注意：所有 MUST FIX 问题解决后才能设为 pass`,
  ].join("\n"),
  };
  }

  // 2. 回退：��� statistics.must_fix 或 must_fix 字段
  const mustFixMatch = yaml.match(/^\s*must_fix:\s*(\d+)\s*$/m);
  if (mustFixMatch) {
  const count = parseInt(mustFixMatch[1], 10);
  if (count === 0) {
  return { ok: true, output: "[PASS] 0 unresolved MUST FIX items" };
  }
  return {
  ok: false,
  output: [
    `[FAIL] ${count} unresolved MUST FIX item(s) remain`,
    `  修复指引：解决上述所有 MUST FIX 问题后重新生成评审报告`,
  ].join("\n"),
  };
  }

  // YAML frontmatter 存在但缺少关键字段 — 给出具体诊断
  const hasVerdictKey = /^\s*verdict:/m.test(yaml);
  const hasMustFixKey = /^\s*must_fix:/m.test(yaml);
  const yamlLines = yaml.split("\n").slice(0, 15).join("\n");
  const missingFields: string[] = [];
  if (!hasVerdictKey) missingFields.push("verdict");
  if (!hasMustFixKey) missingFields.push("must_fix (或 statistics.must_fix)");

  return {
  ok: false,
  output: [
    `[FAIL] YAML frontmatter 存在但缺少必需字段：${missingFields.join(", ")}`,
    `  期望格式（扁平）：`,
    `    ---`,
    `    verdict: pass    # 必需，合法值: pass | fail`,
    `    must_fix: 0      # 必需，open 状态的 MUST_FIX 数量`,
    `    ---`,
    `  或嵌套格式：`,
    `    ---`,
    `    review:`,
    `      verdict: pass  # 必需，合法值: pass | fail`,
    `    statistics:`,
    `      must_fix: 0    # 必需，open 状态的 MUST_FIX 数量`,
    `    ---`,
    `  实际 YAML 内容（前 15 行）：`,
    `    ${yamlLines.split("\n").join("\n    ")}`,
  ].join("\n"),
  };
}

// ── 旧正则逻辑（向后兼容） ──────────────────────────────

/**
 * 旧 MustFix 检查逻辑（纯正则），作为 YAML 解析不到时的回退。
 */
function checkNoMustFixLegacy(
  content: string,
): { ok: boolean; output: string } {
  // 逐行检查未解决的 MUST FIX（排除含"已修复"/"已解决"等标记的历史引用）
  const lines = content.split("\n");
  let unresolvedCount = 0;
  const issuePattern = /\bMUST\s+FIX\b|必须修复|CRITICAL/gi;
  // 如果行中包含已解决标记，视为历史引用而非未解决问题
  const resolvedPattern = /已修复|已解决|resolved|fixed|✅|不修复则评审不通过/gi;

  for (const line of lines) {
  if (issuePattern.test(line)) {
    // 排除含已解决标记的行（如 "5 条 MUST FIX 已全部修复"）
    if (!resolvedPattern.test(line)) {
    unresolvedCount++;
    }
  }
  }

  if (unresolvedCount > 0) {
  return {
  ok: false,
  output: `[FAIL] ${unresolvedCount} unresolved MUST FIX/CRITICAL item(s) remain`,
  };
  }

  return { ok: true, output: "[PASS] no MUST FIX items" };
}

// ── Git 分支检测 ─────────────────────────────────────────

/**
 * 自动检测当前 git 分支名。
 * 对标 bash auto_detect_branch() 函数。
 *
 * @param projectRoot - 项目根目录（git 仓库目录）
 * @returns 分支名，如果无法检测（非 git 仓库或 detached HEAD）返回 null
 */
export function detectBranch(projectRoot: string): string | null {
  try {
  const branch = execSync("git rev-parse --abbrev-ref HEAD", {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 10_000,
  }).trim();

  if (!branch || branch === "HEAD") {
    return null;
  }
  return branch;
  } catch {
  return null;
  }
}

// ── CLAUDE.md 质量门禁章节解析 ───────────────────────────

/**
 * 从 CLAUDE.md 的质量门禁章节提取命令列表。
 * 对标 bash read_gates() 函数。
 *
 * 查找 `## 质量门禁` 章节，提取反引号中的命令，
 * 根据行内关键词推断命令类型。
 *
 * @param projectRoot - 项目根目录
 * @returns 命令列表，每个元素包含 type 和 command
 */
export function readGates(
  projectRoot: string,
): Array<{ type: string; command: string }> {
  const mdPath = join(projectRoot, "CLAUDE.md");

  if (!existsSync(mdPath)) {
  return [];
  }

  let content: string;
  try {
  content = readFileSync(mdPath, "utf8");
  } catch {
  return [];
  }

  const lines = content.split("\n");
  const results: Array<{ type: string; command: string }> = [];

  let inSection = false;

  for (const line of lines) {
  // 检测 `## 质量门禁` 章节开始
  if (/^##.*质量门禁/.test(line)) {
    inSection = true;
    continue;
  }

  // 遇到下一个二级标题时退出（非质量门禁的 ## 标题）
  if (inSection && /^##[^#]/.test(line) && !/质量门禁/.test(line)) {
    break;
  }

  // 在章节内匹配列表项中的反引号命令
  if (inSection && /^\s*-.*`[^`]+`/.test(line)) {
    const cmdMatch = line.match(/`([^`]+)`/);
    if (!cmdMatch || !cmdMatch[1]) {
    continue;
    }
    const command = cmdMatch[1];
    const lineLower = line.toLowerCase();

    let type: string | undefined;
    if (/编译|build|compile/.test(lineLower)) {
    type = "compile";
    } else if (/测试|test/.test(lineLower)) {
    type = "test";
    } else if (/lint|clippy|eslint/.test(lineLower)) {
    type = "lint";
    } else if (/类型|type/.test(lineLower)) {
    type = "typecheck";
    }

    if (type) {
    results.push({ type, command });
    }
  }
  }

  return results;
}

/**
 * 检查 CLAUDE.md 是否有质量门禁章节，返回警告消息列表。
 * 对标 bash check_claude_md_gates() 函数。
 *
 * 如果 CLAUDE.md 不存在或没有 `## 质量门禁` 章节，
 * 返回包含示例格式的提示消息。
 *
 * @param projectRoot - 项目根目录
 * @returns 警告消息数组，无问题时返回空数组
 */
export function checkClaudeMdGates(projectRoot: string): string[] {
  const mdPath = join(projectRoot, "CLAUDE.md");

  if (!existsSync(mdPath)) {
  return [
    "[WARN] CLAUDE.md not found — no quality gate commands to check",
    "       Add a '## 质量门禁' section with commands like:",
    "       - 编译: `npm run build`",
    "       - 测试: `npm test`",
    "       - Lint: `npm run lint`",
  ];
  }

  let content: string;
  try {
  content = readFileSync(mdPath, "utf8");
  } catch {
  return [];
  }

  if (!/^##.*质量门禁/.test(content)) {
  return [
    "[WARN] CLAUDE.md has no '## 质量门禁' section — no quality commands to check",
    "       Add:",
    "       ## 质量门禁",
    "       - 编译: `npm run build`",
    "       - 测试: `npm test`",
    "       - Lint: `npm run lint`",
  ];
  }

  return [];
}

// ── 命令执行 ──────────────────────────────────────────────

/**
 * 在项目根目录下执行命令并检查退出码。
 * 对标 bash run_cmd() 函数。
 *
 * @param projectRoot - 命令执行的工作目录
 * @param label - 命令的人类可读标签（用于输出）
 * @param command - 要执行的 shell 命令
 * @returns `{ ok: true, output }`（退出码 0）或 `{ ok: false, output }`（非零退出码）
 */
export function runCommand(
  projectRoot: string,
  label: string,
  command: string,
): { ok: boolean; output: string } {
  const infoLine = `[INFO] ${label}: ${command}`;

  try {
  const stdout = execSync(command, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024, // 10MB
    timeout: 120_000, // 120 秒
  });

  // 输出限制 2000 字符
  const truncated = truncateOutput(stdout);
  const output = [`${infoLine}`, `[PASS] ${label}`, truncated]
    .filter(Boolean)
    .join("\n");
  return { ok: true, output };
  } catch (err) {
  const execError = err as { stderr?: Buffer | string; stdout?: Buffer | string; status?: number; message?: string };
  const stderrOutput = execError.stderr ? String(execError.stderr) : "";
  const stdoutOutput = execError.stdout ? String(execError.stdout) : "";
  const combined = (stdoutOutput + "\n" + stderrOutput).trim();

  // 输出限制 2000 字符
  const truncated = truncateOutput(combined || execError.message || String(err));
  const output = [
  infoLine,
  `[FAIL] ${label} (exit ${execError.status ?? "unknown"})`,
  truncated,
  ]
    .filter(Boolean)
    .join("\n");
  return { ok: false, output };
  }
}

/**
 * 将输出截断到 2000 字符。
 * 如果超过限制，保留首尾关键信息并提示截断。
 */
function truncateOutput(text: string, maxLen: number = 2000): string {
  if (text.length <= maxLen) {
  return text;
  }

  const headLen = Math.floor(maxLen * 0.7);
  const tailLen = maxLen - headLen - "...(truncated)...".length;
  const head = text.slice(0, headLen);
  const tail = text.slice(text.length - tailLen);
  return `${head}\n...(truncated)...\n${tail}`;
}

// ── L1 检查调度器 ────────────────────────────────────────

/**
 * L1 检查函数映射表。
 * name → 检查函数，所有函数签名统一为 (evidence, config, cwd?, planPath?) => result。
 */
const L1_CHECK_MAP: Record<
  string,
  (evidence: EvidenceFile, config: LoopConfig, cwd?: string, planPath?: string) => { pass: boolean; output: string }
> = {
  item_coverage,
  executed_per_item,
  verification_round_completed,
  verification_all_executed,
  evidence_files_exist,
};

/**
 * 统一的 L1 检查调度器。
 * 通过 checkName 查找对应预定义检查函数并执行。
 *
 * @param checkName - 检查名称，必须是 L1_CHECK_MAP 中的 key
 * @param evidence - evidence JSON 数据
 * @param config - LoopConfig 或检查配置对象
 * @param cwd - 工作目录（用于文件存在性检查）
 * @param planPath - 可选的 plan 文件路径（用于 item 覆盖率检查）
 * @returns `{ pass, output }`
 */
export function runL1Check(
  checkName: string,
  evidence: EvidenceFile,
  config: LoopConfig,
  cwd: string,
  planPath?: string
): { pass: boolean; output: string } {
  const fn = L1_CHECK_MAP[checkName];
  if (!fn) {
  return {
    pass: false,
    output: `[FAIL] Unknown L1 check: ${checkName}. Available: ${Object.keys(L1_CHECK_MAP).join(", ")}`,
  };
  }
  return fn(evidence, config, cwd, planPath);
}

// ── Phase 3 L1 预定义检查函数 ────────────────────────────

export function item_coverage(
  evidence: EvidenceFile,
  config: LoopConfig,
  cwd?: string,
  itemSourcePath?: string
): { pass: boolean; output: string } {
  // 从 evidence 中收集所有 item_id
  const allItems = new Set<string>();
  for (const round of evidence?.rounds ?? []) {
  for (const item of round.items ?? []) {
    allItems.add(item.item_id);
  }
  }
  for (const item of evidence?.verification_round?.items ?? []) {
  allItems.add(item.item_id);
  }

  // 从 plan 中提取期望的 item 列表
  // 目前从 evidence.state.totalItems 推断，未来可从 itemSourcePath 解析
  const totalExpected = evidence?.state?.totalItems ?? 0;
  if (allItems.size >= totalExpected && totalExpected > 0) {
  return { pass: true, output: `[PASS] item_coverage: ${allItems.size}/${totalExpected} items covered` };
  }
  return {
  pass: false,
  output: `[FAIL] item_coverage: only ${allItems.size}/${totalExpected} items covered. Missing: ${totalExpected - allItems.size} items`
  };
}

export function executed_per_item(
  evidence: EvidenceFile,
  config: LoopConfig
): { pass: boolean; output: string } {
  const completedStatus = config?.completedStatus ?? "EXECUTED";
  const itemIdField = config?.itemIdField ?? "item_id";

  // 收集每个 item 的所有 status
  const itemStatuses = new Map<string, Set<string>>();
  for (const round of evidence?.rounds ?? []) {
  for (const item of round.items ?? []) {
    const id = item[itemIdField];
    if (!id) continue;
    if (!itemStatuses.has(id)) itemStatuses.set(id, new Set());
    itemStatuses.get(id)!.add(item.status);
  }
  }

  const failed: string[] = [];
  for (const [id, statuses] of itemStatuses) {
  if (!statuses.has(completedStatus)) {
    failed.push(id);
  }
  }

  if (failed.length === 0) {
  return { pass: true, output: `[PASS] executed_per_item: all ${itemStatuses.size} items have ${completedStatus} status` };
  }
  return {
  pass: false,
  output: `[FAIL] executed_per_item: ${failed.length} items never reached ${completedStatus}: ${failed.join(", ")}`
  };
}

export function verification_round_completed(
  evidence: EvidenceFile,
  _config: LoopConfig
): { pass: boolean; output: string } {
  const completed = evidence?.verification_round?.completed === true;
  if (completed) {
  return { pass: true, output: "[PASS] verification_round_completed: true" };
  }
  return { pass: false, output: "[FAIL] verification_round_completed: false or missing" };
}

export function verification_all_executed(
  evidence: EvidenceFile,
  config: LoopConfig
): { pass: boolean; output: string } {
  const completedStatus = config?.completedStatus ?? "EXECUTED";
  const items = evidence?.verification_round?.items ?? [];

  if (items.length === 0) {
  return { pass: false, output: "[FAIL] verification_all_executed: no items in verification round" };
  }

  const failed = items.filter((item: { status: string }) => item.status !== completedStatus);
  if (failed.length === 0) {
  return { pass: true, output: `[PASS] verification_all_executed: all ${items.length} items are ${completedStatus}` };
  }
  const failedIds = failed.map((item: { item_id?: string }) => item.item_id ?? "unknown");
  return {
  pass: false,
  output: `[FAIL] verification_all_executed: ${failed.length}/${items.length} items not ${completedStatus}: ${failedIds.join(", ")}`
  };
}

export function evidence_files_exist(
  evidence: EvidenceFile,
  _config: LoopConfig,
  cwd?: string
): { pass: boolean; output: string } {
  const workDir = cwd ?? process.cwd();
  const MIN_SIZE = 1024; // 1KB

  // 收集所有证据文件路径
  const filePaths: string[] = [];
  for (const round of evidence?.rounds ?? []) {
  for (const item of round.items ?? []) {
    const screenshots = item?.evidence?.screenshots ?? [];
    filePaths.push(...screenshots);
  }
  }
  for (const item of evidence?.verification_round?.items ?? []) {
  const screenshots = item?.evidence?.screenshots ?? [];
  filePaths.push(...screenshots);
  }

  if (filePaths.length === 0) {
  // 没有声明任何文件，跳过检查
  return { pass: true, output: "[PASS] evidence_files_exist: no files declared (skipped)" };
  }

  const missing: string[] = [];
  const tooSmall: string[] = [];

  for (const relPath of filePaths) {
  const absPath = join(workDir, relPath);
  if (!existsSync(absPath)) {
    missing.push(relPath);
    continue;
  }
  const stat = statSync(absPath);
  if (stat.size < MIN_SIZE) {
    tooSmall.push(`${relPath} (${stat.size}B)`);
  }
  }

  if (missing.length === 0 && tooSmall.length === 0) {
  return { pass: true, output: `[PASS] evidence_files_exist: all ${filePaths.length} files verified (>1KB)` };
  }

  const parts: string[] = [];
  if (missing.length > 0) parts.push(`Missing: ${missing.join(", ")}`);
  if (tooSmall.length > 0) parts.push(`Too small: ${tooSmall.join(", ")}`);
  return { pass: false, output: `[FAIL] evidence_files_exist: ${parts.join("; ")}` };
}
