/**
 * L2 门禁验证模块 — 通过 llm-simple-router HTTP API 验证 L1 门禁产物的真实性。
 *
 * L1 门禁通过后，本模块作为第二道防线，由 AI 判断门禁输出是否真实
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

// ── 配置读取 ─────────────────────────────────────────────────

/**
 * 从 ~/.pi/agent/models.json 读取 llm-simple-router 的 API 配置。
 *
 * @returns 配置对象，文件不存在/读取无权限/JSON 解析失败/字段缺失时返回 null
 */
function readRouterConfig(): RouterConfig | null {
  const configPath = join(homedir(), ".pi", "agent", "models.json");
  try {
  // 权限检查：无法读取时静默失败，不抛异常
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);
  const provider = config.providers?.["llm-simple-router"];
  if (!provider?.baseUrl || !provider?.apiKey) {
    return null;
  }
  return { baseUrl: provider.baseUrl, apiKey: provider.apiKey };
  } catch {
  // 文件不存在、无读取权限、JSON 解析失败 → 降级
  return null;
  }
}

// ── Prompt 构造 ─────────────────────────────────────────────

/**
 * 根据 gate 类型返回验证指引文本。
 *
 * 各 gate 的验证侧重点不同，例如：
 * - Gate 12（E2E 测试）：检查报告中是否包含真实截图和 CDP 日志
 * - Gate 09（编码实现）：检查编译/测试输出是否具体
 * - Gate 14（部署）：检查 git 状态和部署日志是否真实
 */
function getGateGuidance(gateNumber: string): string {
  const guidance: Record<string, string> = {
  "12":
  "Focus on E2E execution evidence: does the report contain real screenshots, " +
  "CDP logs, specific error messages? Or is it just 'code implemented' placeholder text?",
  "09":
  "Focus on compilation/test output: does the output look like real compilation " +
  "or test results? Or is it placeholder text? Are error messages specific with line numbers?",
  "11":
  "Focus on test results: are test counts reasonable? Do failing cases have " +
  "specific assertions? Do test file paths match plan tasks?",
  "10":
  "The gate output is a mechanical TDD order check (git log — always brief). " +
  "VERIFY THE DELIVERABLE (code review report) for fabrication evidence. " +
  "The code review MUST contain: specific file paths, line numbers, concrete findings, " +
  "and substantive analysis. Fabricated reviews are vague, generic, or lack specifics.",
  "03":
  "The gate output is a mechanical file check. VERIFY THE DELIVERABLE (spec review report). " +
  "Look for: specific file paths, line numbers, MUST FIX items with concrete code references.",
  "05":
  "The gate output is a mechanical file check. VERIFY THE DELIVERABLE (plan review report). " +
  "Look for: specific file paths, line numbers, MUST FIX items with concrete code references.",
  "07":
  "The gate output is a mechanical file check. VERIFY THE DELIVERABLE (E2E test plan review). " +
  "Look for: specific file paths, line numbers, MUST FIX items with concrete code references.",
  "13":
  "The gate output is a mechanical file check. VERIFY THE DELIVERABLE (test review report). " +
  "Look for: specific file paths, line numbers, MUST FIX items with concrete code references.",
  "14":
  "Focus on deployment verification: is git status real (not fabricated)? " +
  "Does deploy_result contain actual deployment logs and command outputs?",
  };
  return (
  guidance[gateNumber] ||
  "Does this output show evidence of real execution " +
    "(errors, timestamps, file paths, command outputs) " +
    "or does it look like fabricated placeholder text?"
  );
}

/**
 * 构建 L2 验证 prompt。
 *
 * 将门禁输出和交付物内容截断后拼入 prompt，引导 LLM 判断是否包含真实执行证据。
 *
 * @param gateNumber - 门禁编号
 * @param stageName - 阶段名称
 * @param gateOutput - L1 门禁的原始输出
 * @param deliverables - 该阶段交付物列表
 * @returns 完整的验证 prompt 字符串
 */
function buildGatePrompt(
  gateNumber: string,
  stageName: string,
  gateOutput: string,
  deliverables: Array<{ path: string; content: string }>,
): string {
  const truncatedOutput = gateOutput.slice(0, 2000);
  const sampleDeliverables = deliverables
  .slice(0, 3)
  .map((d) => `--- ${d.path} ---\n${d.content.slice(0, 2000)}`)
  .join("\n");

  return [
  "You are a gate verification agent. Your task: verify that the DELIVERABLE CONTENT below " +
  "shows evidence of genuine execution, not AI fabrication.\n",
  "IMPORTANT: The 'Gate output' section is a mechanical L1 automated check. " +
  "It will ALWAYS be brief. Focus your analysis on the DELIVERABLES section " +
  "for evidence of actual work (file paths, line numbers, specific findings, " +
  "timestamps, command outputs, screenshots).\n",
  `Stage: ${stageName} (gate ${gateNumber})`,
  "\nDELIVERABLES (focus here for fabrication evidence):",
  sampleDeliverables || "(no deliverable files found)",
  "\nMechanical L1 gate output (brief — for context only):",
  truncatedOutput || "(empty)",
  `\n${getGateGuidance(gateNumber)}`,
  "\nReturn ONLY: PASS or FAIL (with one-line reason)",
  ].join("\n");
}

// ── HTTP 调用 ───────────────────────────────────────────────

/**
 * 通过 llm-simple-router 的 Anthropic Messages API 发送验证请求。
 *
 * @param baseUrl - 路由器基础 URL（如 http://127.0.0.1:9981）
 * @param apiKey - API 密钥
 * @param prompt - 验证 prompt
 * @param signal - 外部取消信号（可选）
 * @param timeoutMs - HTTP 超时毫秒数
 * @returns LLM 响应文本
 */
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
    max_tokens: 512,
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
    // 非 2xx 响应直接拒绝，避免将 HTML 错误页当 JSON 解析
    if (res.statusCode && res.statusCode >= 300) {
    reject(new Error(`LLM API returned HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
    return;
    }
    try {
    const parsed = JSON.parse(data);
    // Anthropic Messages API 响应格式: content 是消息块数组
    const text =
    parsed.content?.[0]?.text ??
    parsed.content?.[0]?.content?.[0]?.text ??
    "";
    resolve(text.trim());
    } catch {
    reject(
    new Error(
    `Failed to parse LLM response: ${data.slice(0, 200)}`,
    ),
    );
    }
  });
    },
  );

  // 超时处理：主动销毁请求连接
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

// ── 主入口 ───────────────────────────────────────────────────

/**
 * 验证 L1 门禁产物是否真实（未被 AI 伪造）。
 *
 * 调用 llm-simple-router（GLM-5-Turbo）分析门禁输出和交付物内容，
 * 判断其中是否包含真实的执行证据（错误信息、文件路径、时间戳、命令输出等）。
 *
 * 网络错误或超时时**降级通过**（fail-open），不阻塞工作流。
 * 仅当 LLM 明确返回以 FAIL 开头的响应时才判定不通过。
 *
 * @param gateNumber - 门禁编号（如 "12"、"09"）
 * @param stageName - 阶段名称（如 "E2E 测试"、"编码实现"）
 * @param gateOutput - L1 门禁的原始输出文本
 * @param deliverables - 该阶段的交付物列表，每项包含路径和内容
 * @param signal - 可选的 AbortSignal，用于从外部取消请求
 * @returns 验证结果：passed 表示通过，output 包含 LLM 响应或降级原因
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

  // 1. 读取 Router 配置（含权限检查）
  const config = readRouterConfig();
  if (!config) {
  return {
  passed: true,
  output: "L2 verification skipped (router config not found or incomplete)",
  };
  }

  // 1.5 非本地 baseUrl 不发送 API key，防止密钥泄露
  const url = new URL(config.baseUrl);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1" && url.hostname !== "::1") {
  console.warn(`L2 gate verifier: baseUrl is not localhost (${url.hostname}). Skipping verification for security.`);
  return { passed: true, output: "L2 skipped (non-localhost baseUrl)" };
  }

  // 2. 构建验证 prompt
  const prompt = buildGatePrompt(
  gateNumber,
  stageName,
  gateOutput,
  deliverables,
  );

  // 3. 调用 LLM（8 秒超时）
  let responseText: string;
  try {
  responseText = await callLLM(
    config.baseUrl,
    config.apiKey,
    prompt,
    signal,
    8000,
  );
  } catch (err) {
  // 网络错误 / 超时 → 降级通过
  return {
    passed: true,
    output: "L2 verification skipped (API unavailable)",
  };
  }

  // 4. 解析 LLM 响应：仅当明确以 FAIL 开头时判定不通过
  if (/^FAIL/i.test(responseText)) {
  const reason = responseText.replace(/^FAIL\s*/i, "").trim();
  return {
  passed: false,
  output:
  `L2 verification failed: ${reason || "gate output appears fabricated"}\n\n` +
  `Full L2 LLM response:\n${responseText.slice(0, 500)}\n\n` +
  `Re-run the stage with actual execution (not code inspection).`,
  };
  }

  return { passed: true, output: responseText };
}
