/**
 * Gate 05: Plan 评审验证
 *
 * 检查 plan.md 的评审报告是否存在，以及其中是否包含 MUST FIX / CRITICAL 项。
 * 对标 bash gate-script.sh 中的 gate_05() 函数。
 *
 * 检查项：
 *   1. plan_review*.md 评审报告存在
 *   2. 评审报告文件非空
 *   3. 评审报告中无 MUST FIX / CRITICAL 标记
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param signal - 可选的 AbortSignal，用于取消操作
 * @returns GateResult — passed=true 时同时创建 .pass 标记文件
 */

import {
  checkFile,
  findReviewFile,
  checkNoMustFix,
  createPassFile,
  formatFailMessage,
  type GateResult,
} from "./common";

export async function gate_05(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  try {
  signal?.throwIfAborted();

  // 1. 查找 plan 评审报告
  const review = findReviewFile(projectRoot, "plan_review*.md");

  if (!review) {
  return {
  passed: false,
  output: formatFailMessage(
    "05",
    "缺少 plan 评审报告",
    "派遣 harness-reviewer subagent 对 plan.md 进行评审，报告写入 .xyz-harness/{主题}/changes/reviews/plan_review_v1.md，修复所有 MUST FIX 后重新调用 harness_stage_complete",
  ),
  };
  }

  signal?.throwIfAborted();

  // 2. 检查文件存在且非空
  const fileCheck = checkFile("plan review", review);
  if (!fileCheck.ok) {
  return {
  passed: false,
  output: formatFailMessage("05", fileCheck.output),
  };
  }

  signal?.throwIfAborted();

  // 3. 检查 MUST FIX 项
  const mustFixCheck = checkNoMustFix(review);
  if (!mustFixCheck.ok) {
  return {
  passed: false,
  output: formatFailMessage(
    "05",
    mustFixCheck.output,
    "根据上述 [FAIL] 项修复评审报告中的问题，确保无 MUST FIX 项后重新调用 harness_stage_complete",
  ),
  };
  }

  // 4. 通过
  signal?.throwIfAborted();
  return createPassFile(projectRoot, "05", "gate 05: plan review validated");
  } catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") {
  return { passed: false, output: "GATE FAIL: gate 05 — cancelled" };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { passed: false, output: `GATE FAIL: gate 05 — ${message}` };
  }
}
