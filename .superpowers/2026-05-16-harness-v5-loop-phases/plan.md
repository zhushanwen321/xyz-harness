# Harness V5: Loop-Based Phase Architecture — 实现计划

> **给 agentic worker：** 每个 Wave 包含 2-5 个 Task。使用 superpowers:subagent-driven-development 逐个 Task 执行，每 Task 完成后由审查 subagent 验证。

**目标：** 将 xyz-harness 从 V4 16-stage 线性流水线重构为 V5 5-Phase Loop 架构。

**架构：** 每个 Phase 是独立循环（stages 重复执行直到 gate 通过），Phase 间通过 Pi tree branch summary 压缩上下文。门禁系统 L1（TypeScript 机械检查）+ L2（LLM 防伪造）。不强制 subagent 使用。

**技术栈：** TypeScript (Pi Extension API)、Bash (门禁脚本)、Markdown (agent/skill)、JSON (test case template)

---

## 文件清单

### 创建（14 文件）

| # | 文件 | 职责 |
|---|------|------|
| F1 | `extensions/coding-workflow/types.ts` | 核心类型定义 |
| F2 | `extensions/coding-workflow/stages.ts` | Phase/Stage/Gate 配置 |
| F3 | `extensions/coding-workflow/state-manager.ts` | 工作流状态持久化 |
| F4 | `extensions/coding-workflow/gates/common.ts` | L1 共享工具 |
| F5 | `extensions/coding-workflow/gates/gate_spec.ts` | Phase 1 gate |
| F6 | `extensions/coding-workflow/gates/gate_plan.ts` | Phase 2 gate |
| F7 | `extensions/coding-workflow/gates/gate_dev.ts` | Phase 3 gate |
| F8 | `extensions/coding-workflow/gates/gate_test.ts` | Phase 4 gate |
| F9 | `extensions/coding-workflow/gates/gate_pr.ts` | Phase 5 gate |
| F10 | `extensions/coding-workflow/gate-runner.ts` | Gate dispatch |
| F11 | `extensions/coding-workflow/gate-verifier.ts` | L2 验证 |
| F12 | `extensions/coding-workflow/index.ts` | 扩展主入口 |
| F13 | `agents/harness-retrospect/agent.md` | 复盘 subagent |
| F14 | `extensions/coding-workflow/__tests__/g1-phase-loop.test.ts` | Phase 循环测试 |

### 删除（7 项）

| # | 文件 |
|---|------|
| D1 | `extensions/coding-workflow/loop-engine.ts` |
| D2 | `extensions/coding-workflow/loop-prompts/` |
| D3 | `extensions/coding-workflow/gates/gate_phase3.ts` |
| D4 | `extensions/coding-workflow/__tests__/` (全部旧测试) |
| D5 | `extensions/coding-workflow/__tests__/fixtures/` (e2e fixtures) |
| D6 | `agents/harness-e2e-tester/` |
| D7 | `CLAUDE.md` (更新而非删除) |

---

## Wave 划分

| Wave | 内容 | Task 数 | 预计行数 |
|------|------|---------|---------|
| W1 | 清理 V4 产物 + 项目初始化 | 3 | ~50 |
| W2 | Foundation：types、stages、state-manager、common | 4 | ~400 |
| W3 | Gates：5 个 Phase gate + runner + verifier | 4 | ~400 |
| W4 | Extension：index.ts（工具 + command + 事件） | 3 | ~500 |
| W5 | Agent + Skill：复盘 subagent、CLAUDE.md 更新 | 2 | ~100 |
| W6 | 测试 + 集成验证 | 3 | ~200 |

总计：**19 Tasks，~1650 行**

每个 Wave 的详细实现在子文档中：

- [Wave 1: 清理](./plan-wave1-cleanup.md)
- [Wave 2: Foundation](./plan-wave2-foundation.md)
- [Wave 3: Gates](./plan-wave3-gates.md)
- [Wave 4: Extension](./plan-wave4-extension.md)
- [Wave 5: Agent & Skill](./plan-wave5-agents.md)
- [Wave 6: Testing](./plan-wave6-testing.md)
