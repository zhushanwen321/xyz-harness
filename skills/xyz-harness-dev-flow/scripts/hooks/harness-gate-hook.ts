/**
 * harness-gate-hook — Pi extension
 *
 * 在 dev-flow 流程中拦截门禁违规。
 * 当 harness 处于活跃状态且 agent 尝试完成 subagent 任务时，
 * 检查当前阶段的 gate 是否已通过。
 *
 * 与 Claude Code 的 hooks/hooks.json 功能等价，
 * 共享同一个 harness-gate-hook.sh 脚本。
 */
import {
  defineExtension,
  ToolCallResult,
  StopResult,
} from "@mariozechner/pi-coding-agent";
import { execFileSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

const SCRIPT_DIR = path.resolve(__dirname);
const HOOK_SCRIPT = path.join(SCRIPT_DIR, "harness-gate-hook.sh");
const STATE_SCRIPT = path.join(SCRIPT_DIR, "harness-state.sh");

function getProjectRoot(cwd: string): string | null {
  // 向上查找包含 .xyz-harness 目录的路径
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, ".xyz-harness"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function runGateCheck(projectRoot: string): {
  passed: boolean;
  message: string;
} {
  try {
    execFileSync(HOOK_SCRIPT, [projectRoot], {
      timeout: 10000,
      encoding: "utf-8",
    });
    return { passed: true, message: "" };
  } catch (e: any) {
    const output = e.stderr || e.stdout || e.message || "";
    return { passed: false, message: output };
  }
}

export default defineExtension({
  name: "harness-gate-hook",
  description: "dev-flow gate enforcement for xyz-harness",

  async onLoad(api) {
    // 监听 subagent 完成（PostToolUse: subagent）
    api.on("tool_call", async (event, ctx) => {
      // 只在 subagent 或 loop_task_tracker 工具调用时检查
      if (
        event.toolName !== "subagent" &&
        event.toolName !== "loop_task_tracker"
      ) {
        return;
      }

      // 只检查完成事件（有 result）
      if (event.phase !== "after") return;

      const projectRoot = getProjectRoot(event.cwd || ctx.cwd || process.cwd());
      if (!projectRoot) return;

      // 检查是否在 harness 流程中
      const stateFile = path.join(projectRoot, ".xyz-harness", "state.json");
      if (!fs.existsSync(stateFile)) return;

      const result = runGateCheck(projectRoot);
      if (!result.passed) {
        return {
          feedback: `[HARNESS GATE] ${result.message}\nDo not proceed until the gate check passes.`,
        };
      }
    });

    // 监听 agent 想停止时（等价于 Claude Code 的 Stop hook）
    api.on("agent_stop", async (event, ctx) => {
      const projectRoot = getProjectRoot(ctx.cwd || process.cwd());
      if (!projectRoot) return;

      const stateFile = path.join(projectRoot, ".xyz-harness", "state.json");
      if (!fs.existsSync(stateFile)) return;

      const result = runGateCheck(projectRoot);
      if (!result.passed) {
        return {
          block: true,
          reason: `[HARNESS GATE] ${result.message}\nComplete the gate check before stopping.`,
        };
      }
    });
  },
});
