/**
 * Gate 13 — 测试评审验证
 *
 * L1 门禁：检查测试代码评审报告是否已生成且无 MUST FIX 项。
 *
 * 流程：
 * 1. 在 .xyz-harness 目录下按模式 "test_review*.md" 查找评审报告
 * 2. 验证找到的文件是否存在且非空
 * 3. 检查文件中是否残留 MUST FIX / 必须修复 / CRITICAL 标记
 *
 * 对标 bash gate-script.sh 中的 gate_13() 函数。
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
 * 执行门禁 13：测试评审验证。
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param signal - 可选的 AbortSignal，用于取消操作
 * @returns 通过返回 `{ passed: true, output }`，失败返回 `{ passed: false, output }`
 */
export async function gate_13(
  projectRoot: string,
  signal?: AbortSignal,
): Promise<GateResult> {
  try {
  signal?.throwIfAborted();

  // 1. 查找测试评审报告
  const review = findReviewFile(projectRoot, "test_review*.md");

  if (!review) {
    return {
    passed: false,
    output: formatFailMessage(
      "13",
      "缺少测试评审报告",
      "派遣 harness-reviewer subagent 对测试代码进行评审，报告写入 .xyz-harness/{主题}/changes/reviews/test_review_v1.md，修复所有 MUST FIX 后重新调用 harness_stage_complete",
    ),
    };
  }

  signal?.throwIfAborted();

  // 2. 检查文件存在且非空
  const fileCheck = checkFile("test review", review);
  if (!fileCheck.ok) {
    return {
    passed: false,
    output: formatFailMessage("13", fileCheck.output),
    };
  }

  signal?.throwIfAborted();

  // 3. 检查无 MUST FIX 标记
  const mustFixCheck = checkNoMustFix(review);
  if (!mustFixCheck.ok) {
    return {
    passed: false,
    output: formatFailMessage(
      "13",
      mustFixCheck.output,
      "根据上述 [FAIL] 项修复评审报告中的问题，确保无 MUST FIX 项后重新调用 harness_stage_complete",
    ),
    };
  }

  // 4. 全部通过
  signal?.throwIfAborted();
  return createPassFile(
    projectRoot,
    "13",
    "gate 13: test review validated",
  );
  } catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { passed: false, output: "GATE FAIL: gate 13 — cancelled" };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { passed: false, output: `GATE FAIL: gate 13 — ${message}` };
  }
}
