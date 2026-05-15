// Gate 07 — E2E 测试计划评审验证
// 对标 bash gate_07() 函数
// 检查 .xyz-harness 下是否有 e2e_test_plan_review*.md 评审报告，
// 验证文件存在且无 MUST FIX / 必须修复 / CRITICAL 标记

import {
  checkFile,
  findReviewFile,
  checkNoMustFix,
  createPassFile,
  formatFailMessage,
  type GateResult,
} from "./common";

/**
 * Gate 07：E2E 测试计划评审验证。
 *
 * 在 .xyz-harness 目录下查找 e2e_test_plan_review*.md 评审报告，
 * 验证文件存在且无 MUST FIX / 必须修复 / CRITICAL 标记。
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param signal - 可选的 AbortSignal，用于取消操作
 * @returns `{ passed: true, output }` 或 `{ passed: false, output }`
 */
export async function gate_07(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  try {
  signal?.throwIfAborted();

  // 1. 查找 E2E 测试计划评审报告
  const review = findReviewFile(projectRoot, "e2e_test_plan_review*.md");

  if (!review) {
    return {
    passed: false,
    output: formatFailMessage(
      "07",
      "缺少 E2E 测试计划评审报告",
      "派遣 harness-e2e-test-plan-reviewer subagent 对 e2e-test-plan.md 进行评审，报告写入 .xyz-harness/{主题}/changes/reviews/e2e_test_plan_review_v1.md，修复所有 MUST FIX 后重新调用",
    ),
    };
  }

  signal?.throwIfAborted();

  // 2. 检查文件存在且非空
  const fileCheck = checkFile("e2e review", review);
  if (!fileCheck.ok) {
    return {
    passed: false,
    output: formatFailMessage("07", fileCheck.output),
    };
  }

  signal?.throwIfAborted();

  // 3. 检查无 MUST FIX 标记
  const mustFixCheck = checkNoMustFix(review);
  if (!mustFixCheck.ok) {
    return {
    passed: false,
    output: formatFailMessage(
      "07",
      mustFixCheck.output,
      "根据上述 [FAIL] 项修复评审报告中的问题，确保无 MUST FIX 项后重新调用",
    ),
    };
  }

  // 4. 全部通过
  signal?.throwIfAborted();
  return createPassFile(
    projectRoot,
    "07",
    "gate 07: e2e test plan review validated",
  );
  } catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { passed: false, output: "GATE FAIL: gate 07 — cancelled" };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { passed: false, output: `GATE FAIL: gate 07 — ${message}` };
  }
}
