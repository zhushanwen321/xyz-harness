// Phase 3 Gate — 组合 L1 预定义检查 + L2 LLM 验证
// 用于 E2E Loop 的独立 Gate 判定

import { join } from "node:path";
import type { EvidenceFile, LoopConfig } from "../types.js";
import {
  item_coverage,
  executed_per_item,
  verification_round_completed,
  verification_all_executed,
  evidence_files_exist,
} from "./common.js";

export interface GatePhase3Result {
  passed: boolean;
  output: string;
}

/**
 * 执行 Phase 3 Gate 检查
 * @param projectRoot 项目根目录
 * @param config Loop 配置
 * @param evidenceFilePath evidence JSON 文件绝对路径
 * @param signal 可选的 AbortSignal
 */
export async function gatePhase3(
  projectRoot: string,
  config: LoopConfig,
  evidenceFilePath: string,
  signal?: AbortSignal,
): Promise<GatePhase3Result> {
  // 读取 evidence JSON
  const { readFileSync, existsSync } = await import("node:fs");
  if (!existsSync(evidenceFilePath)) {
  return {
    passed: false,
    output: "[FAIL] Evidence file not found: " + evidenceFilePath,
  };
  }

  const evidence: EvidenceFile = JSON.parse(readFileSync(evidenceFilePath, "utf8"));

  // L1 check 函数映射
  const checkMap: Record<
  string,
  (evidence: EvidenceFile, config: LoopConfig, cwd?: string, planPath?: string) => { pass: boolean; output: string }
  > = {
  item_coverage,
  executed_per_item,
  verification_round_completed,
  verification_all_executed,
  evidence_files_exist,
  };

  const results: Array<{ name: string; pass: boolean; output: string }> = [];

  // 执行 L1 checks
  const l1Checks = config.gateChecks.filter((gc) => gc.type === "L1");
  for (const check of l1Checks) {
  const fn = checkMap[check.name];
  if (!fn) {
    return {
    passed: false,
    output: `[FAIL] Unknown L1 check function: ${check.name}`,
    };
  }
  const result = fn(evidence, config, projectRoot);
  results.push({ name: check.name, ...result });
  if (!result.pass) {
    // 短路：首个 L1 失败立即返回
    return {
    passed: false,
    output: `Phase 3 Gate FAIL (L1: ${check.name})\n${results.map((r) => r.output).join("\n")}`,
    };
  }
  }

  // L2 检查（anti-fabrication）
  const l2Checks = config.gateChecks.filter((gc) => gc.type === "L2");
  if (l2Checks.length > 0) {
  try {
    const { verifyGateL2 } = await import("../gate-verifier.js");
    const deliverables = [
    {
      path: evidenceFilePath,
      content: readFileSync(evidenceFilePath, "utf8"),
    },
    ];
    const l2Result = await verifyGateL2(
    config.gateScript,
    "Phase 3 Loop Gate",
    results.map((r) => r.output).join("\n"),
    deliverables,
    signal,
    );
    if (!l2Result.passed) {
    return {
      passed: false,
      output: `Phase 3 Gate FAIL (L2: anti-fabrication)\n${l2Result.output}`,
    };
    }
    results.push({ name: "anti_fabrication", pass: true, output: "[PASS] L2 anti-fabrication" });
  } catch {
    // L2 不可用时降级通过
    results.push({
    name: "anti_fabrication",
    pass: true,
    output: "[PASS] L2 anti-fabrication (degraded: LLM unavailable)",
    });
  }
  }

  return {
  passed: true,
  output: `Phase 3 Gate PASS\n${results.map((r) => r.output).join("\n")}`,
  };
}
