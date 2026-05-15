# XYZ Harness Engineering

## 项目背景

xyz-harness 开发流水线框架本身的工程仓库。包含：
- `extensions/coding-workflow/` — Pi 扩展：16-stage 开发流水线控制器，含门禁系统
- `extensions/todolist/` — Pi 扩展：任务追踪
- `extensions/claude-rules-loader/` — Pi 扩展：跨项目规则加载
- `agents/` — 各阶段 subagent 定义（harness-executor、harness-reviewer、harness-tdd-coder 等）
- `skills/` — SKILL.md 技能定义
- `commands/` — Slash 命令定义

技术栈：TypeScript (Pi Extension API)、Bash (门禁脚本)、Markdown (agent/skill 定义)。

## 架构约束

### Extension 架构
- Pi Extension 通过 ESBuild 编译加载，不做类型检查（仅语法检查）
- 导入使用 `.js` 扩展名（ESM 规范）
- 全局类型来自 `@mariozechner/pi-coding-agent`（Pi 运行时）
- 扩展自身目录通过 `import.meta.url` 解析

### 门禁系统（coding-workflow）
- 所有 L1 门禁函数在 `gates/gate_XX.ts` 中，每个导出一个 async 函数
- `common.ts` 提供共享工具（文件检查、git 操作、CLAUDE.md 解析、命令执行）
- `gate-runner.ts` 根据 gate 编号 dispatch 到对应函数
- `gate-verifier.ts` 提供 L2 LLM 防伪造验证
- L2 验证在 `harness_stage_complete` 中 L1 通过后自动执行

### 脚本管理
- 所有脚本统一放在 `extensions/coding-workflow/scripts/`
- Skill 目录通过 symlink 指向 extension 目录（单一源文件原则）

## 文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| Gate 系统设计 | `extensions/coding-workflow/gates/common.ts` | 门禁工具函数 API |
| Stage 定义 | `extensions/coding-workflow/stages.ts` | 16 stage 配置 |
| 状态管理 | `extensions/coding-workflow/state-manager.ts` | 工作流状态持久化 |
| Workflow 控制器 | `extensions/coding-workflow/index.ts` | 主入口 + 工具注册 |
| E2E Tester Agent | `agents/harness-e2e-tester/agent.md` | E2E 测试执行规范 |

## 质量门禁

- 类型检查: `npx tsc --noEmit`
- 测试: `echo "no tests yet"` (本项目暂未编写自动化测试)
- Lint: `npx tsc --noEmit`
- Bash 语法: `bash -n extensions/coding-workflow/scripts/gate-script.sh`
