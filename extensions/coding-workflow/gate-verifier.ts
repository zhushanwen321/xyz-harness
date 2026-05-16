/**
 * L2 门禁验证模块 — 通过 llm-simple-router HTTP API 验证 L1 门禁产物的真实性。
 *
 * L1 门禁通过后，本模块作为第二道防线，由 AI 逐文件判断交付物是否真实
 *（包含具体的执行证据而非 AI 编造的占位文本）。
 *
 * 网络错误或超时时降级通过（fail-open），避免阻塞工作流。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { request } from "node:http"; // llm-simple-router 使用 HTTP 协议

// ── 类型定义 ────────────────────────────────────────────────

interface RouterConfig {
  baseUrl: string;
  apiKey: string;
}

interface YamlSummary {
  verdict: string | null;
  mustFix: number | null;
  mustFixResolved: number | null;
  totalIssues: number | null;
  issueCount: number;
}

// ── YAML 摘要提取 ──────────────────────────────────────────

/** 从文件内容中提取 YAML frontmatter 摘要 */
function extractYamlSummary(content: string): YamlSummary | null {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const yaml = fm[1];

  const verdictMatch = yaml.match(/^  verdict:\s*([a-z]+)\s*$/m);
  const mustFixMatch = yaml.match(/^  must_fix:\s*(\d+)\s*$/m);
  const resolvedMatch = yaml.match(/^  must_fix_resolved:\s*(\d+)\s*$/m);
  const totalMatch = yaml.match(/^  total_issues:\s*(\d+)\s*$/m);
  // 统计 issues 数组条目数
  const issueCount = (yaml.match(/^\s*- id:/gm) || []).length;

  return {
  verdict: verdictMatch?.[1] ?? null,
  mustFix: mustFixMatch ? parseInt(mustFixMatch[1], 10) : null,
  mustFixResolved: resolvedMatch ? parseInt(resolvedMatch[1], 10) : null,
  totalIssues: totalMatch ? parseInt(totalMatch[1], 10) : null,
  issueCount,
  };
}

// ── 配置读取 ─────────────────────────────────────────────────

function readRouterConfig(): RouterConfig | null {
  const configPath = join(homedir(), ".pi", "agent", "models.json");
  try {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);
  const provider = config.providers?.["llm-simple-router"];
  if (!provider?.baseUrl || !provider?.apiKey) {
    return null;
  }
  return { baseUrl: provider.baseUrl, apiKey: provider.apiKey };
  } catch {
  return null;
  }
}

// ── Prompt 构造 ─────────────────────────────────────────────

/** 每个 gate 的验证指引，告诉 LLM 重点检查什么 */
function getGateGuidance(gateNumber: string): string {
  const guidance: Record<string, string> = {
  "12":
    "E2E execution evidence: look for real screenshots, CDP logs, specific error messages. " +
    "Fabricated: vague '代码已实现', no actual screenshots, no browser interaction evidence.",
  "09":
    "Compilation/test output authenticity: does the output look like real compilation/test results? " +
    "Look for specific error messages with file paths and line numbers. Fabricated: boilerplate output.",
  "11":
    "Test result authenticity: reasonable test counts? Failing cases have specific assertions? " +
    "Test file paths match plan tasks? Fabricated: all pass with no details, or placeholder counts.",
  "10":
    "The L1 gate output is a mechanical TDD order check (always brief). " +
    "VERIFY THE CODE REVIEW DELIVERABLE: must contain specific file paths, line numbers, " +
    "concrete findings with code references. Fabricated: vague, generic, no specifics.",
  "03":
    "The L1 gate output is a mechanical file check. VERIFY THE SPEC REVIEW DELIVERABLE: " +
    "must contain specific file references, concrete issues, not generic 'looks good'.",
  "05":
    "The L1 gate output is a mechanical file check. VERIFY THE PLAN REVIEW DELIVERABLE: " +
    "must contain specific file references, concrete issues, not generic 'looks good'.",
  "07":
    "The L1 gate output is a mechanical file check. VERIFY THE E2E PLAN REVIEW DELIVERABLE: " +
    "must contain specific file references, concrete issues, not generic 'looks good'.",
  "13":
    "The L1 gate output is a mechanical file check. VERIFY THE TEST REVIEW DELIVERABLE: " +
    "must contain specific file references, concrete issues, not generic 'looks good'.",
  "14":
    "Deployment verification authenticity: is git status real (not fabricated)? " +
    "Does deploy_result contain actual deployment logs and command outputs?",
  };
  return (
  guidance[gateNumber] ||
  "Look for evidence of real execution: specific error messages, file paths, " +
    "timestamps, command outputs. Fabricated output is vague and generic."
  );
}

/**
 * 构建逐文件分析 prompt。
 *
 * 包含 YAML frontmatter 摘要和 Markdown 正文，让 LLM 可以交叉校验。
 */
function buildGatePrompt(
  gateNumber: string,
  stageName: string,
  gateOutput: string,
  deliverables: Array<{ path: string; content: string }>,
): string {
  // 每个文件截取前 1500 字符，最多 5 个文件
  const files = deliverables.slice(0, 5).map((d) => {
  const yaml = extractYamlSummary(d.content);
  return {
    path: d.path,
    content: d.content.slice(0, 1500),
    yaml,
  };
  });

  const fileBlocks = files
  .map((f, i) => {
    const yamlInfo = f.yaml
    ? `[YAML] verdict=${f.yaml.verdict ?? "?"} must_fix=${f.yaml.mustFix ?? "?"} must_fix_resolved=${f.yaml.mustFixResolved ?? "?"} total_issues=${f.yaml.totalIssues ?? "?"}`
    : "[YAML] no frontmatter found";
    return `[File ${i + 1}]
PATH: ${f.path}
${yamlInfo}
CONTENT:
${f.content || "(empty)"}`;
  })
  .join("\n\n---\n\n");

  return [
  "You are a gate verification agent. Analyze EACH deliverable file below and " +
    "judge whether it shows evidence of GENUINE EXECUTION (not AI fabrication).",
  "",
  "For files with YAML frontmatter, CROSS-CHECK:",
  "  1. YAML statistics (must_fix count) must match the issues table in the Markdown body",
  "  2. YAML issues[] entries must have corresponding descriptions in the body",
  "  3. verdict must be consistent with actual MUST FIX count in the table",
  "",
  `Stage: ${stageName} (gate ${gateNumber})`,
  "",
  "CRITICAL: The L1 gate output (shown last) is a MECHANICAL automated check — " +
    "it will always be brief. Base your verdict on the DELIVERABLE FILES below.",
  "",
  `Guidance: ${getGateGuidance(gateNumber)}`,
  "",
  `=== DELIVERABLE FILES (${files.length} file(s)) ===`,
  fileBlocks,
  "",
  "=== L1 Gate Output (mechanical, for context only) ===",
  gateOutput.slice(0, 1000) || "(empty)",
  "",
  "=== RESPONSE FORMAT ===",
  "For EACH file above, respond with exactly:",
  "  FILE: <path>",
  "  VERDICT: PASS (genuine evidence found) or FAIL (appears fabricated/YAML inconsistent)",
  "  REASON: <one-line reason citing specific evidence or inconsistency>",
  "",
  "After all files:",
  "  FINAL: PASS (all files genuine) or FAIL (one or more files appear fabricated)",
  ].join("\n");
}

// ── HTTP 调用 ───────────────────────────────────────────────

function callLLM(
  baseUrl: string,
  apiKey: string,
  prompt: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
  const url = `${baseUrl}/v1/messages`;
  const body = JSON.stringify({
    model: "glm-5-turbo",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const req = request(
    url,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "x-client-type": "pi-gate-verifier",
    },
    signal,
    },
    (res) => {
    let data = "";
    res.on("data", (chunk: string) => {
      data += chunk;
    });
    res.on("end", () => {
      if (res.statusCode && res.statusCode >= 300) {
      reject(new Error(`LLM API returned HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      return;
      }
      try {
      const parsed = JSON.parse(data);
      const text =
        parsed.content?.[0]?.text ??
        parsed.content?.[0]?.content?.[0]?.text ??
        "";
      resolve(text.trim());
      } catch {
      reject(new Error(`Failed to parse LLM response: ${data.slice(0, 200)}`));
      }
    });
    },
  );

  req.setTimeout(timeoutMs, () => {
    req.destroy(new Error("Request timeout"));
  });

  req.on("error", (err: Error) => {
    reject(err);
  });

  req.write(body);
  req.end();
  });
}

// ── 响应解析 ────────────────────────────────────────────────

interface FileVerdict {
  path: string;
  verdict: "PASS" | "FAIL";
  reason: string;
}

/** 从 LLM 响应文本中提取逐文件判定和最终结论 */
function parseFileVerdicts(
  responseText: string,
  deliverablePaths: string[],
): { fileVerdicts: FileVerdict[]; finalVerdict: "PASS" | "FAIL" | null } {
  const fileVerdicts: FileVerdict[] = [];
  let finalVerdict: "PASS" | "FAIL" | null = null;

  // 按 "FILE:" 分割，解析每个文件块
  const blocks = responseText.split(/\n(?=FILE:)/);
  for (const block of blocks) {
  const pathMatch = block.match(/^FILE:\s*(.+)$/m);
  const verdictMatch = block.match(/^VERDICT:\s*(PASS|FAIL)/im);
  const reasonMatch = block.match(/^REASON:\s*(.+)$/m);

  if (pathMatch) {
    fileVerdicts.push({
    path: pathMatch[1].trim(),
    verdict: (verdictMatch?.[1]?.toUpperCase() === "FAIL" ? "FAIL" : "PASS"),
    reason: reasonMatch?.[1]?.trim() || "(no reason provided)",
    });
  }
  }

  // 提取 FINAL
  const finalMatch = responseText.match(/^FINAL:\s*(PASS|FAIL)/im);
  if (finalMatch) {
  finalVerdict = finalMatch[1].toUpperCase() as "PASS" | "FAIL";
  }

  // 如果没有找到结构化输出，为每个文件创建默认行
  if (fileVerdicts.length === 0) {
  for (const p of deliverablePaths) {
    fileVerdicts.push({
    path: p,
    verdict: "PASS",
    reason: "(LLM did not provide per-file analysis — see raw response below)",
    });
  }
  }

  return { fileVerdicts, finalVerdict };
}

// ── 主入口 ───────────────────────────────────────────────────

/**
 * 验证 L1 门禁产物是否真实（未被 AI 伪造）。
 *
 * 调用 llm-simple-router（GLM-5-Turbo）逐文件分析交付物内容，
 * 判断每个文件是否包含真实的执行证据。
 *
 * 网络错误或超时时**降级通过**（fail-open），不阻塞工作流。
 *
 * @returns 结构化验证结果，包含文件列表、逐文件判定和最终结论
 */
export async function verifyGateL2(
  gateNumber: string,
  stageName: string,
  gateOutput: string,
  deliverables: Array<{ path: string; content: string }>,
  signal?: AbortSignal,
): Promise<{ passed: boolean; output: string }> {
  // 0. 中断检查
  if (signal?.aborted) {
  return { passed: true, output: "L2 verification skipped (aborted)" };
  }

  // 1. 读取 Router 配置
  const config = readRouterConfig();
  if (!config) {
  return {
    passed: true,
    output: "L2 verification skipped (router config not found)",
  };
  }

  // 1.5 非本地 baseUrl 安全检查
  let url: URL;
  try {
  url = new URL(config.baseUrl);
  } catch {
  return { passed: true, output: "L2 skipped (invalid baseUrl)" };
  }
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1" && url.hostname !== "::1") {
  console.warn(
    `L2 gate verifier: baseUrl is not localhost (${url.hostname}). Skipping for security.`,
  );
  return { passed: true, output: "L2 skipped (non-localhost baseUrl)" };
  }

  // 2. 构建文件列表（含 YAML 摘要，用于输出展示）
  const deliverablePaths = deliverables.map((d) => d.path);
  const fileListLines = [`║ Stage: ${stageName} (gate ${gateNumber})`, `║ Examined ${deliverables.length} deliverable file(s):`];
  for (let i = 0; i < deliverablePaths.length; i++) {
  const yaml = extractYamlSummary(deliverables[i].content);
  let line = `║   ${i + 1}. ${deliverablePaths[i]}`;
  if (yaml) {
    line += `  [YAML: verdict=${yaml.verdict ?? "?"}, must_fix=${yaml.mustFix ?? "?"}, resolved=${yaml.mustFixResolved ?? "?"}]`;
  }
  fileListLines.push(line);
  }
  const fileListHeader =
  `\n╔══ L2 Gate Verification ──────────────────────────╗\n` +
  fileListLines.join("\n") +
  `\n╠══════════════════════════════════════════════════╣`;

  // 3. 构建 prompt 并调用 LLM
  const prompt = buildGatePrompt(gateNumber, stageName, gateOutput, deliverables);

  let responseText: string;
  try {
  responseText = await callLLM(config.baseUrl, config.apiKey, prompt, signal, 8000);
  } catch {
  return {
    passed: true,
    output: `${fileListHeader}\n║ ⚠ L2 verification skipped (API unavailable)\n╚══════════════════════════════════════════════════╝`,
  };
  }

  // 4. 解析逐文件判定
  const { fileVerdicts, finalVerdict } = parseFileVerdicts(responseText, deliverablePaths);

  // 5. 构造逐文件分析展示
  const perFileBlock =
  `║ ── Per-File Analysis ──\n` +
  fileVerdicts
    .map(
    (fv) =>
      `║   ${fv.verdict === "PASS" ? "✅" : "❌"} ${fv.path}\n` +
      `║      ${fv.reason}`,
    )
    .join("\n");

  // 6. 综合结论
  const actualFinal = finalVerdict ?? (fileVerdicts.some((fv) => fv.verdict === "FAIL") ? "FAIL" : "PASS");
  const conclusionBlock =
  `╠══════════════════════════════════════════════════╣\n` +
  `║ FINAL: ${actualFinal === "PASS" ? "✅ ALL GENUINE" : "❌ FABRICATION DETECTED"}\n` +
  `╚══════════════════════════════════════════════════╝`;

  const output = `${fileListHeader}\n${perFileBlock}\n${conclusionBlock}`;

  if (actualFinal === "FAIL") {
  return {
    passed: false,
    output:
    `${output}\n\n` +
    `L2 verification detected fabrication. Re-run the affected stage(s) with actual execution (not code inspection).\n` +
    `Raw LLM response:\n${responseText.slice(0, 800)}`,
  };
  }

  return { passed: true, output };
}
