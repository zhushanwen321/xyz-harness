// Workflow Controller — Gate Runner
// 直接导入 TypeScript gate 函数并 dispatch，替代 bash gate-script.sh

import { type GateResult } from "./gates/common.js";
import { gate_03 } from "./gates/gate_03.js";
import { gate_05 } from "./gates/gate_05.js";
import { gate_07 } from "./gates/gate_07.js";
import { gate_09 } from "./gates/gate_09.js";
import { gate_10 } from "./gates/gate_10.js";
import { gate_11 } from "./gates/gate_11.js";
import { gate_12 } from "./gates/gate_12.js";
import { gate_13 } from "./gates/gate_13.js";
import { gate_14 } from "./gates/gate_14.js";

export class GateRunner {
  async run(
  gateNumber: string,
  projectRoot: string,
  signal?: AbortSignal
  ): Promise<GateResult> {
  if (signal?.aborted) {
  return { passed: false, output: "Aborted before gate execution" };
  }

  try {
  switch (gateNumber) {
  case "03": return await gate_03(projectRoot, signal);
  case "05": return await gate_05(projectRoot, signal);
  case "07": return await gate_07(projectRoot, signal);
  case "09": return await gate_09(projectRoot, signal);
  case "10": return await gate_10(projectRoot, signal);
  case "11": return await gate_11(projectRoot, signal);
  case "12": return await gate_12(projectRoot, signal);
  case "13": return await gate_13(projectRoot, signal);
  case "14": return await gate_14(projectRoot, signal);
  // "phase3" 不通过 GateRunner 调度 — LoopEngine.runGate() 直接调用 L1/L2 函数
  // 此处仅做 fallback 防护
  case "phase3":
  return { passed: false, output: "Phase 3 gate must be called via LoopEngine.runGate(), not GateRunner" };
  default:
  return { passed: false, output: `Unknown gate: ${gateNumber}. Valid: 03 05 07 09 10 11 12 14 phase3` };
  }
  } catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return { passed: false, output: `Gate ${gateNumber} threw unexpected error: ${msg}` };
  }
  }
}
