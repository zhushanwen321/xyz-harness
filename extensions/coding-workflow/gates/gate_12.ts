/**
 * Gate 12 — E2E 执行证据验证
 *
 * L1 + L2 门禁：验证 E2E 测试报告是真实执行结果，而非 subagent 伪造。
 *
 * 四层检查体系：
 *   第一层（文件存在性）：在 .xyz-harness/ 下递归查找 e2e-test-report.md
 *   第二层（内容完整性）：验证执行方式描述、PASS/FAIL/SKIP 统计、"未执行"标记数量
 *   第三层（反伪造检测）：搜索伪造关键词、截图引用、实际截图文件
 *   第四层（L2 LLM 验证）：内联调用 llm-simple-router 判断报告真实性
 *
 * 对标 bash gate-script.sh 中尚未实现的 gate_12 门禁，从零构建。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { request as httpRequest } from "node:http";
import { checkFile, createPassFile, formatFailMessage } from "./common";
import type { GateResult } from "./common";

// ── 常量 ──────────────────────────────────────────────────

const FIX_HINT =
  "重新执行 Stage 13 E2E 测试，必须使用 chrome-automation 或实际浏览器进行 UI 验证。禁止通过代码审查推断 UI 功能状态。无法执行的项标记为 SKIP 并说明原因，不要写'代码已实现'。每个 UI 冒烟测试项必须有截图或 CDP 交互记录。修复后重新调用 harness_stage_complete";

const FORGERY_KEYWORDS = [
  // 中文伪造模式
  "代码已实现", "基于代码审查", "代码推断",
  "代码中已", "代码层面", "通过代码",
  "无需测试", "功能正常",
  "应该正常", "理论.*正确",
  // 英文伪造模式
  "code review.*pass", "implemented.*code",
  "should.*work", "assumed.*ok",
  "not.*actually.*test", "skipped.*browser",
  "skipped.*cdp", "skipped.*chrome",
];

const EXECUTION_METHOD_PATTERN =
  /执行方式|execution method|API|CDP|浏览器/i;

const PASS_FAIL_SKIP_PATTERN = /PASS|FAIL|SKIP|通过|失败|跳过/i;

const NOT_EXECUTED_PATTERN = /未执行|NOT_EXECUTED|SKIP.*原因/i;

// 截图引用匹配模式（不用模块级带 g flag 的正则，避免 lastIndex 状态污染）

// ── 辅助函数 ──────────────────────────────────────────────

/**
 * 在 .xyz-harness 目录下递归查找指定文件名的文件。
 *
 * @param rootDir - 搜索起始目录
 * @param targetFilename - 目标文件名
 * @returns 匹配的文件路径列表，按深度优先排序
 */
function findFileRecursively(rootDir: string, targetFilename: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
    walk(fullPath);
    } else if (entry.isFile() && entry.name === targetFilename) {
    results.push(fullPath);
    }
  }
  }

  if (existsSync(rootDir)) {
  walk(rootDir);
  }
  return results;
}

/**
 * 收集证据目录下所有截图文件的路径。
 *
 * @param evidenceDir - evidence 目录路径
 * @returns 截图文件路径数组
 */
function findScreenshotFiles(evidenceDir: string): string[] {
  const results: string[] = [];
  const extensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

  function walk(dir: string): void {
  let entries: import("node:fs").Dirent[];
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
    const ext = entry.name.toLowerCase().slice(entry.name.lastIndexOf("."));
    if (extensions.has(ext)) {
      results.push(fullPath);
    }
    }
  }
  }

  if (existsSync(evidenceDir)) {
  walk(evidenceDir);
  }
  return results;
}

/**
 * 在 .xyz-harness 目录下查找 evidence 目录。
 * 检查 .xyz-harness/evidence 和 .xyz-harness/**\/evidence 路径。
 *
 * @param projectRoot - 项目根目录
 * @returns 找到的第一个 evidence 目录路径，不存在返回 null
 */
function findEvidenceDir(projectRoot: string): string | null {
  const xyzHarness = join(projectRoot, ".xyz-harness");
  if (!existsSync(xyzHarness)) {
  return null;
  }

  // 先直接检查 .xyz-harness/evidence
  const topLevel = join(xyzHarness, "evidence");
  if (existsSync(topLevel) && statSync(topLevel).isDirectory()) {
  return topLevel;
  }

  // 递归搜索 evidence 目录
  function walk(dir: string): string | null {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
    if (entry.name === "evidence") {
      return fullPath;
    }
    const found = walk(fullPath);
    if (found) return found;
    }
  }
  return null;
  }

  return walk(xyzHarness);
}

// ── 类型定义 ──────────────────────────────────────────────

/** Anthropic Messages API 响应结构（仅取 gate_12 需要的字段） */
interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }> | string;
  error?: { type: string; message: string };
}

// ── L2 LLM 验证 ──────────────────────────────────────────

/**
 * L2 LLM 验证：调用 llm-simple-router 判断 E2E 报告是否为真实执行结果。
 *
 * 读取 ~/.pi/agent/models.json 获取 llm-simple-router 配置，
 * 构造 Anthropic Messages API 格式的请求，让 LLM 分析报告真实性。
 *
 * 网络超时/不可用时降级通过（打 WARN），不阻塞门禁。
 *
 * @param gateOutput - 当前累积的门禁输出信息
 * @param reportPath - e2e-test-report.md 的完整路径
 * @param projectRoot - 项目根目录
 * @param signal - 可选的 AbortSignal
 * @returns `{ passed: true/false, output: string }`
 */
async function l2VerifyE2E(
  gateOutput: string,
  reportPath: string,
  projectRoot: string,
  signal?: AbortSignal,
): Promise<{ passed: boolean; output: string }> {
  if (signal?.aborted) {
  return { passed: false, output: "L2 aborted" };
  }

  // 1. 读取 models.json
  const modelsPath = join(homedir(), ".pi", "agent", "models.json");
  let baseUrl: string | undefined;
  let apiKey: string | undefined;

  try {
  if (!existsSync(modelsPath)) {
    return { passed: true, output: "[WARN] L2 skipped (models.json not found)" };
  }
  const modelsConfig = JSON.parse(readFileSync(modelsPath, "utf8"));
  const router = modelsConfig.providers?.["llm-simple-router"];
  if (!router) {
    return { passed: true, output: "[WARN] L2 skipped (llm-simple-router not configured)" };
  }
  baseUrl = router.baseUrl;
  apiKey = router.apiKey;
  } catch (err) {
  return {
    passed: true,
    output: `[WARN] L2 skipped (failed to read models.json: ${err instanceof Error ? err.message : String(err)})`,
  };
  }

  if (!baseUrl || !apiKey) {
  return { passed: true, output: "[WARN] L2 skipped (missing baseUrl or apiKey)" };
  }

  if (signal?.aborted) {
  return { passed: false, output: "L2 aborted" };
  }

  // 2. 读取 e2e-test-report.md 内容（截取前 5000 字符）
  let reportContent: string;
  try {
  reportContent = readFileSync(reportPath, "utf8").slice(0, 5000);
  } catch (err) {
  return {
    passed: true,
    output: `[WARN] L2 skipped (unable to read report: ${err instanceof Error ? err.message : String(err)})`,
  };
  }

  if (signal?.aborted) {
  return { passed: false, output: "L2 aborted" };
  }

  // 3. 构造验证 prompt
  const prompt = `You are a quality auditor. Your task is to verify whether the following E2E test report reflects actual execution results, not code inspection or fabrication.

Rules:
- A GENUINE report shows evidence of actual browser/API execution: screenshots, CDP logs, specific error messages, timing data, request/response details.
- A FABRICATED report uses vague language like "代码已实现", "基于代码审查", "代码推断", lacks screenshots, has no specific error details, or describes implementation instead of test execution.

Output format — RETURN ONLY ONE LINE:
- If the report appears GENUINE: PASS <reason>
- If the report appears FABRICATED: FAIL <reason>

Here is the E2E test report:

---
${reportContent}
---

Is this report genuine or fabricated?`;

  // 4. 构造 Anthropic Messages API 请求
  const url = new URL("/v1/messages", baseUrl);
  const body = JSON.stringify({
  model: "glm-5-turbo",
  max_tokens: 1024,
  messages: [{ role: "user", content: prompt }],
  });

  // 5. HTTP POST，带 30 秒超时
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  // 如果外部 signal 先中止，也中止内部请求
  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler, { once: true });

  try {
  const llmResponse = await new Promise<string>((resolve, reject) => {
    const req = httpRequest(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey!,
      "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
    },
    (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      resolve(raw);
      });
      res.on("error", (err) => reject(err));
    },
    );
    req.on("error", (err) => reject(err));
    req.write(body);
    req.end();
  });

  clearTimeout(timeoutId);
  signal?.removeEventListener("abort", abortHandler);

  if (signal?.aborted) {
    return { passed: false, output: "L2 aborted" };
  }

  // 6. 解析响应
  let responseData: AnthropicMessageResponse;
  try {
  responseData = JSON.parse(llmResponse) as AnthropicMessageResponse;
  } catch {
  return { passed: true, output: "[WARN] L2 skipped (unable to parse LLM response JSON)" };
  }

  // Anthropic Messages API 响应格式
  const content = responseData?.content;
  let llmText = "";
  if (Array.isArray(content)) {
  for (const block of content) {
  if (block?.type === "text" && typeof block.text === "string") {
    llmText += block.text;
  }
  }
  } else if (typeof content === "string") {
  llmText = content;
  }

  if (!llmText.trim()) {
    return { passed: true, output: "[WARN] L2 skipped (empty LLM response)" };
  }

  // 7. 判断结果
  const firstLine = llmText.trim().split("\n")[0].trim();
  if (/^FAIL\b/i.test(firstLine)) {
    return {
    passed: false,
    output: `[FAIL] L2 LLM 验证未通过: ${firstLine}`,
    };
  }

  return { passed: true, output: `[PASS] L2 LLM 验证通过: ${firstLine}` };
  } catch (err: unknown) {
  clearTimeout(timeoutId);
  signal?.removeEventListener("abort", abortHandler);

  // 网络超时/不可用 → 降级通过（打 WARN），不阻塞
  const errorMsg = err instanceof Error ? err.message : String(err);
  return {
    passed: true,
    output: `[WARN] L2 LLM 验证降级通过（网络错误: ${errorMsg}）`,
  };
  }
}

// ── 主门禁函数 ────────────────────────────────────────────

/**
 * 执行门禁 12：E2E 执行证据验证。
 *
 * 四层检查体系：
 *   第一层 — 在 .xyz-harness/ 下递归查找 e2e-test-report.md，确认存在且非空
 *   第二层 — 验证报告包含执行方式描述、PASS/FAIL/SKIP 统计、"未执行"标记计数
 *   第三层 — 反伪造检测：搜索伪造关键词、截图引用数量、实际截图文件
 *   第四层 — L2 LLM 内联验证，调用 llm-simple-router 判断报告真实性
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param signal - 可选的 AbortSignal，用于在竞态或超时时取消操作
 * @returns 通过返回 `{ passed: true, output }`，失败返回 `{ passed: false, output }`
 */
export async function gate_12(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  if (signal?.aborted) {
  return { passed: false, output: "GATE ABORTED" };
  }

  const xyzHarness = join(projectRoot, ".xyz-harness");
  const outputLines: string[] = [];

  // ── 第一层：文件存在性 ───────────────────────────────────

  // 1. 查找 e2e-test-report.md
  const reports = findFileRecursively(xyzHarness, "e2e-test-report.md");
  if (reports.length === 0) {
  return {
    passed: false,
    output: formatFailMessage("12", "未找到 e2e-test-report.md", FIX_HINT),
  };
  }

  const reportPath = reports[0];
  outputLines.push(`[INFO] 找到 e2e-test-report: ${reportPath}`);

  // 2. 文件必须存在且非空
  const fileCheck = checkFile("e2e-test-report.md", reportPath);
  if (!fileCheck.ok) {
  return {
    passed: false,
    output: formatFailMessage("12", `e2e-test-report.md 文件异常: ${fileCheck.output}`, FIX_HINT),
  };
  }
  outputLines.push(fileCheck.output);

  if (signal?.aborted) {
  return { passed: false, output: "GATE ABORTED" };
  }

  // ── 第二层：内容完整性 ───────────────────────────────────

  let reportContent: string;
  try {
  reportContent = readFileSync(reportPath, "utf8");
  } catch {
  return {
    passed: false,
    output: formatFailMessage("12", "无法读取 e2e-test-report.md", FIX_HINT),
  };
  }

  // 3. 检查包含执行方式描述
  if (!EXECUTION_METHOD_PATTERN.test(reportContent)) {
  outputLines.push("[FAIL] 报告缺少执行方式描述（关键词：执行方式/execution method/API/CDP/浏览器）");
  return {
    passed: false,
    output: formatFailMessage("12", "报告缺少执行方式描述", FIX_HINT),
  };
  }
  outputLines.push("[PASS] 报告包含执行方式描述");

  // 4. 检查包含 PASS/FAIL/SKIP 统计
  if (!PASS_FAIL_SKIP_PATTERN.test(reportContent)) {
  outputLines.push("[FAIL] 报告缺少 PASS/FAIL/SKIP 统计");
  return {
    passed: false,
    output: formatFailMessage("12", "报告缺少 PASS/FAIL/SKIP 统计", FIX_HINT),
  };
  }
  outputLines.push("[PASS] 报告包含 PASS/FAIL/SKIP 统计");

  // 5. 统计"未执行"标记数量
  const notExecutedMatches = reportContent.match(NOT_EXECUTED_PATTERN);
  const notExecutedCount = notExecutedMatches ? notExecutedMatches.length : 0;
  if (notExecutedCount > 0) {
  outputLines.push(`[WARN] 报告包含 ${notExecutedCount} 个"未执行"标记，请确认原因合理`);
  } else {
  outputLines.push('[PASS] 未发现"未执行"标记');
  }

  if (signal?.aborted) {
  return { passed: false, output: "GATE ABORTED" };
  }

  // ── 第三层：反伪造检测 ───────────────────────────────────

  // 6. 搜索伪造关键词
  for (const keyword of FORGERY_KEYWORDS) {
  const keywordRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (keywordRegex.test(reportContent)) {
    const msg = `报告包含伪造关键词: "${keyword}"`;
    outputLines.push(`[FAIL] ${msg}`);
    return {
    passed: false,
    output: formatFailMessage("12", msg, FIX_HINT),
    };
  }
  }
  outputLines.push("[PASS] 未发现伪造关键词");

  // 7. 检查截图引用数量
  const screenshotRefs = reportContent.match(/!\[.*\]\(.*\.(png|jpg|jpeg|webp)\)/gi);
  const screenshotRefCount = screenshotRefs ? screenshotRefs.length : 0;
  outputLines.push(`[INFO] 报告包含 ${screenshotRefCount} 个截图引用`);

  // 8. 检查证据目录下是否有实际截图文件
  const evidenceDir = findEvidenceDir(projectRoot);
  if (evidenceDir) {
  const screenshotFiles = findScreenshotFiles(evidenceDir);
  outputLines.push(`[INFO] 证据目录 ${evidenceDir} 下找到 ${screenshotFiles.length} 个截图文件`);
  if (screenshotFiles.length === 0 && screenshotRefCount === 0) {
    outputLines.push("[WARN] 既无截图引用也无截图文件，报告可能缺乏 UI 证据");
  }
  } else {
  outputLines.push("[WARN] 未找到 evidence 目录，无法验证截图文件");
  }

  if (signal?.aborted) {
  return { passed: false, output: "GATE ABORTED" };
  }

  // ── 第四层：L2 LLM 验证 ────────────────────────────────

  const gateOutput = outputLines.join("\n");
  const l2Result = await l2VerifyE2E(gateOutput, reportPath, projectRoot, signal);

  outputLines.push(l2Result.output);

  if (!l2Result.passed) {
  return {
    passed: false,
    output: formatFailMessage("12", l2Result.output, FIX_HINT),
  };
  }

  // ── 全部通过 ───────────────────────────────────────────

  return createPassFile(projectRoot, "12", "gate 12: E2E execution evidence verified");
}

