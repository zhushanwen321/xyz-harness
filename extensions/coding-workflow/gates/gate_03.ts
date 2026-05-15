/**
 * Gate 03 — Spec 评审验证
 *
 * L1 门禁：检查 spec 评审报告是否已生成且无 MUST FIX 项。
 *
 * 流程：
 * 1. 在 .xyz-harness 目录下按模式 "spec_review*.md" 查找评审报告
 * 2. 验证找到的文件是否存在且非空
 * 3. 检查文件中是否残留 MUST FIX / 必须修复 / CRITICAL 标记
 *
 * 对标 bash gate-script.sh 中的 gate_03() 函数。
 */

import {
  checkFile,
  findReviewFile,
  checkNoMustFix,
  createPassFile,
  formatFailMessage,
  type GateResult,
} from "./common";

/**
 * 执行门禁 03：Spec 评审验证。
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param signal - 可选的 AbortSignal，用于取消操作
 * @returns 通过返回 `{ passed: true, output }`，失败返回 `{ passed: false, output }`
 */
export async function gate_03(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  if (signal?.aborted) {
  return { passed: false, output: "Aborted" };
  }

  // 1. 查找 spec 评审报告
  const review = findReviewFile(projectRoot, "spec_review*.md");
  if (!review) {
  return {
    passed: false,
    output: formatFailMessage(
    "03",
    "缺少 spec 评审报告",
    "派遣 harness-spec-reviewer subagent 对 spec.md 进行评审，" +
      "报告写入 .xyz-harness/{主题}/changes/reviews/spec_review_v1.md，" +
      "确保无 MUST FIX 项后重新调用 harness_stage_complete",
    ),
  };
  }

  // 2. 验证文件存在且非空
  const fileCheck = checkFile("spec review", review);
  if (!fileCheck.ok) {
  return {
    passed: false,
    output: formatFailMessage(
    "03",
    `spec 评审报告文件异常：${fileCheck.output}`,
    "根据上述 [FAIL] 项修复评审报告中的问题，确保无 MUST FIX 项后重新调用 harness_stage_complete",
    ),
  };
  }

  // 3. 检查是否有未解决的 MUST FIX 项
  const mustFixCheck = checkNoMustFix(review);
  if (!mustFixCheck.ok) {
  return {
    passed: false,
    output: formatFailMessage(
    "03",
    `spec 评审报告包含未解决的问题：${mustFixCheck.output}`,
    "根据上述 [FAIL] 项修复评审报告中的问题，确保无 MUST FIX 项后重新调用 harness_stage_complete",
    ),
  };
  }

  // 4. 全部通过，创建 pass 标记文件
  return createPassFile(projectRoot, "03", "gate 03: spec review validated");
}
