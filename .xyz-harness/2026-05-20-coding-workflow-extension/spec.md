---
verdict: pass
---

# coding-workflow Extension

## Background

xyz-harness V5 采用纯 skill 驱动模式，但存在一个核心失败模式：AI 总是跳过 phase gate，直接进入下一个 phase。根本原因是 AI 能看到全局流程，知道"下一步是什么"，从而跳过验证。

本 extension 通过 Pi Extension API 注册自定义 tools，严格控制 AI 的可见信息，实现自动化的 phase 门禁 + 审查 + 复盘流水线。

### 核心设计约束

- AI 只能感知当前 phase，不知道后续 phase 的存在
- gate 通过是硬性门禁，无法跳过
- 审查和复盘通过 subagent 自动执行，保证客观性
- phase 切换时自动 compact，防止上下文污染

## Functional Requirements

### FR-1: Workflow 启动

用户通过 `/coding-workflow <topic>` 命令启动 workflow。

启动时：
1. **检查 `state.isActive`** — 如果已有活跃 workflow，报错提示用户先 abort 或等待完成
2. 创建 topic 目录 `.xyz-harness/{date}-{topic}/`
3. 初始化内部状态（currentPhase=1, phaseResults={}）
4. 持久化状态到 session entry
5. 渲染 TUI progress widget
6. 向 AI 注入 Phase 1 (Spec) 的 skill 内容和约束指令

### FR-2: AI 上下文注入（before_agent_start）

每轮 LLM 调用前，通过 `before_agent_start` 事件注入：

```
[CODING WORKFLOW — STRICT MODE]

Current Phase: {phaseName}
Topic Directory: {topicDir}

YOUR ONLY GOAL: Produce deliverables for this phase and pass the gate.

RULES (VIOLATION = FAILURE):
- Do NOT start any work outside the current phase scope
- Do NOT plan, design, or implement anything for future phases
- Do NOT ask about or speculate about what comes after this phase
- When deliverables are complete, call coding-workflow-gate(phase={n})
- You will receive new instructions ONLY after passing the gate

--- Phase Skill ---
{skillContent}
--- End Phase Skill ---
```

Skill 内容通过 `systemPromptOptions.skills` 找到目标 skill 对象，用 `fs.readFileSync(skill.filePath)` 读取。

### FR-3: Gate Tool（coding-workflow-gate）

AI 完成交付物后主动调用。参数：`phase: number`。

执行流程：

```
1. 校验 state.currentPhase === phase，不匹配则报错
2. 运行 check_gate.py {topicDir} {phase}
   - 失败 → 返回具体失败项，AI 修复后重新调用 gate
   - 通过 → 继续
3. Dispatch review subagent
   - 扫描 {topicDir}/changes/reviews/ 确定 nextVersion（当前最大版本号 + 1）
   - spawn pi --mode json -p --no-session --model {resolved} --thinking {level} --tools read,bash,write,edit
   - system prompt = expert-reviewer skill 内容（通过 fs.readFileSync 读取）
   - task prompt 包含：审查模式、待审查文件路径、输出路径（含版本号）
   - 审查结果写入 {topicDir}/changes/reviews/{prefix}_v{nextVersion}.md
   - spawn 失败 → catch error，返回明确错误消息，AI 可重试
   - must_fix > 0 → 返回审查结果，AI 修复后重新调用 gate
   - must_fix == 0 → 继续
4. Dispatch retrospect subagent
   - spawn pi --mode json -p --no-session --model {resolved} --thinking {level} --tools read,bash,write,edit
   - system prompt = harness-retrospect agent 内容
   - task prompt 包含：phase 编号、topicDir、交付物路径
   - 复盘写入 {topicDir}/changes/reviews/{prefix}_retrospect.md
   - spawn 失败 → catch error，返回明确错误消息
   - 子进程引用加入 activeSubprocesses 列表（abort 时可清理）
5. 更新 state：phaseResults[phase] = 'passed'
6. 更新 TUI widget
7. 返回："Phase {n} gate PASSED. Call coding-workflow-phase-start to begin the next phase."
```

### FR-4: Phase Start Tool（coding-workflow-phase-start）

Gate 通过后 AI 调用此工具进入下一个 phase。无参数（自动推进）。

执行流程：

```
1. 检查当前 phase 的 gate 已通过（state.phaseResults[currentPhase] === 'passed'）
   - 未通过 → 报错
2. 检查当前 phase 的 retrospect 文件存在
   - 不存在 → 报错（正常不应发生，因为 gate 内部已执行）
3. state.currentPhase += 1
4. 如果 currentPhase > 5（所有 phase 完成）：
   - 返回完成消息，清理 widget
   - 结束
5. 触发 ctx.compact()，customInstructions 指向保留 phase 关键产出物路径
6. compact 完成后，通过 pi.sendUserMessage() 注入新 phase 的启动指令
7. 返回："Compacting and transitioning to Phase {n}..."
```

### FR-5: TUI Progress Widget

使用 `ctx.ui.setWidget("coding-workflow", lines)` 渲染在编辑器上方。

展示内容（仅用户可见，不注入 AI）：
```
Coding Workflow: {topicName}
  ✓ Phase 1: Spec
  → Phase 2: Plan (current)
  ☐ Phase 3: Dev
  ☐ Phase 4: Test
  ☐ Phase 5: PR
```

Footer status：`ctx.ui.setStatus("coding-workflow", "Phase 2/5")`

### FR-6: Subagent Dispatch

复用 `xyz-pi-extensions/subagent` 项目的核心 spawn 逻辑（`runSingleAgent`、`getPiInvocation`、`writePromptToTempFile` 等函数），不重新造轮子。

**模型选择**：根据 `~/.pi/agent/subagent-models.json` 中的 `task-complexity` 配置自动选择：
- Review subagent：`taskComplexity: "medium"`（审查需要平衡质量和速度）
- Retrospect subagent：`taskComplexity: "low"`（复盘是结构化输出，不需要深度推理）

复用 subagent 项目的模型解析逻辑（`resolveModelByComplexity` + `loadSubagentModels`）来确定 `--model` 参数。

Spawn 参数：
```typescript
const args = [
  "--mode", "json", "-p", "--no-session",
  "--model", resolvedModel,          // 由 complexity 路由解析
  "--thinking", thinkingLevel,       // 由 complexity 默认值决定
  "--tools", "read,bash,write,edit", // 限制工具集
  "--append-system-prompt", tmpPromptPath,
  taskPrompt,
];
```

- system prompt 写入临时文件，通过 `--append-system-prompt` 传入
- 使用 `--mode json` 解析输出流，提取 messages
- 通过 tool 的 `onUpdate` 回调 streaming 更新 TUI
- 限制 subagent 的 tools 为 `read,bash,write,edit`，不暴露 coding-workflow 的 tools
- 不指定 `--agent`（不需要 agent 发现逻辑，system prompt 直接构造）

### FR-7: State Persistence & Recovery

状态结构：

```typescript
interface WorkflowState {
  isActive: boolean;
  currentPhase: number;        // 1-5
  topicDir: string;            // .xyz-harness/{date}-{topic}/
  topicName: string;           // 用户输入的主题名
  phaseResults: Record<number, 'passed'>;
}

// 非持久化运行时状态（内存中）
const activeSubprocesses: ChildProcess[] = [];  // abort 时清理
```

- 写入：`pi.appendEntry("coding-workflow", state)`
- 恢复：`session_start` 事件中逆向扫描 session entries 重建 state
- Widget 在 `session_start` 和 `turn_end` 中更新

### FR-8: Phase 5 特殊约束

Phase 5 (PR) 的 `before_agent_start` 注入中额外强调：

```
CRITICAL RULE FOR THIS PHASE:
- You MUST NOT merge the PR under any circumstances
- PR merging requires explicit human approval outside this workflow
- Your task is ONLY to: create the PR, verify CI passes, produce evidence
```

Phase 5 gate 通过后，不调用 phase-start（没有 Phase 6），直接返回完成消息。

### FR-9: 状态查询与管理

用户命令：

| 命令 | 用途 |
|------|------|
| `/coding-workflow <topic>` | 启动 workflow（已有活跃 workflow 时报错） |
| `/coding-workflow-status` | 查看当前进度（notify 弹窗） |
| `/coding-workflow-abort` | 取消 workflow，清理状态 + kill 活跃子进程 |

Abort 清理流程：
1. 检查 `state.isActive`，未激活则无操作
2. 遍历活跃子进程引用列表（`activeSubprocesses: ChildProcess[]`），对每个调用 `kill()`
3. 清理临时文件（subagent 的 prompt 临时文件）
4. 重置 state（isActive=false, currentPhase=0, phaseResults={}）
5. 持久化清理后的 state
6. 清除 TUI widget 和 status

### FR-10: Custom Tool Rendering

gate tool 和 phase-start tool 需要自定义 `renderCall` 和 `renderResult`：

**coding-workflow-gate：**
- renderCall：`Phase {n} Gate Check` + 当前 topicDir
- renderResult（进行中）：`⏳ Running gate check...` 或 `⏳ Dispatching review subagent...`
- renderResult（通过）：`✓ Phase {n} gate PASSED` + usage stats（review 轮次、must_fix 数量）
- renderResult（失败）：`✗ Phase {n} gate FAILED` + 失败项列表（每行一个 ✗）

**coding-workflow-phase-start：**
- renderCall：`Phase Transition → Phase {n+1}`
- renderResult：`✓ Transitioned to Phase {n+1}: {name}` 或 compact 状态

使用 Pi 的 `Text` 组件 + `theme.fg()` 颜色（success/error/accent/muted/dim）

### FR-11: 错误处理

- Skill 找不到（`systemPromptOptions.skills` 中无匹配）→ 报错提示用户检查 skill 安装
- Gate 脚本执行失败 → 返回 stderr，让 AI 修复
- **Subagent spawn 失败**（pi 二进制找不到 ENOENT、系统资源不足、fork 失败）→ catch spawn error，返回明确错误消息，AI 可重试
- Subagent 非零退出 → 作为 tool error 返回，包含 stderr 内容
- compact 失败 → 跳过 compact，直接注入新 phase 指令（不阻塞流程）
- 所有 subagent dispatch 使用 try-catch 包裹，确保 spawn 失败不会导致 workflow 卡死

## Acceptance Criteria

### AC-1: 启动与 Phase 1 进入
- [ ] 用户执行 `/coding-workflow test-feature` 后，topic 目录被创建
- [ ] TUI widget 显示 5 个 phase，Phase 1 标记为 current
- [ ] AI 收到 Phase 1 (brainstorming) skill 内容注入
- [ ] AI 不知道 Phase 2-5 的存在（prompt 中无任何提及）

### AC-2: Gate 检查
- [ ] AI 调用 `coding-workflow-gate(phase=1)` 后，check_gate.py 被执行
- [ ] 脚本检查失败时，AI 收到具体失败项并可以修复
- [ ] 修复后重新调用 gate 可以重新检查
- [ ] 脚本通过后，review subagent 自动 dispatch
- [ ] Review 有 must_fix 时，AI 收到审查结果并可以修复

### AC-3: Review & Retrospect Subagent
- [ ] Review subagent 使用 expert-reviewer skill 作为 system prompt
- [ ] Retrospect subagent 使用 harness-retrospect agent 内容作为 system prompt
- [ ] 两个 subagent 的输出文件路径符合 gate check 脚本的预期
- [ ] Subagent 在 TUI 上有进度展示（通过 onUpdate streaming）

### AC-4: Phase Transition
- [ ] Gate 通过后 AI 调用 `coding-workflow-phase-start`，state.currentPhase 递增
- [ ] compact 被触发
- [ ] compact 完成后新 phase 的 skill 内容被注入
- [ ] TUI widget 更新显示新 phase 为 current

### AC-5: Phase 5 PR 约束
- [ ] Phase 5 的 prompt 注入包含"禁止合并 PR"的指令
- [ ] Phase 5 gate 通过后返回完成消息，不要求调用 phase-start

### AC-6: 状态持久化
- [ ] session 重启后（`/resume`），workflow 状态被正确恢复
- [ ] TUI widget 在恢复后正确渲染

### AC-7: Extension 全局可用
- [ ] extension 位于 `~/.pi/agent/extensions/coding-workflow/index.ts`
- [ ] 任何项目目录下启动 Pi 都可以使用

## Constraints

### 技术栈
- TypeScript（Pi Extension API）
- Pi 内置 imports：`@mariozechner/pi-coding-agent`、`typebox`、`@mariozechner/pi-ai`、`@mariozechner/pi-tui`
- Node.js 内置：`node:fs`、`node:child_process`、`node:path`、`node:os`
- 无外部 npm 依赖

### Pi API 使用范围
| API | 用途 |
|-----|------|
| `pi.registerTool()` | 注册 gate 和 phase-start tools |
| `pi.registerCommand()` | 注册 /coding-workflow 等命令 |
| `pi.on("before_agent_start")` | 注入 phase 上下文 |
| `pi.on("session_start")` | 恢复状态 + 更新 widget |
| `pi.on("turn_end")` | 更新 widget |
| `pi.appendEntry()` | 持久化状态 |
| `pi.sendMessage()` | 注入 phase 转换消息 |
| `pi.sendUserMessage()` | 注入启动指令 |
| `ctx.ui.setWidget()` | Phase progress widget |
| `ctx.ui.setStatus()` | Footer status |
| `ctx.ui.notify()` | 状态查询结果 |
| `ctx.compact()` | Phase 切换时压缩上下文 |
| `ctx.sessionManager` | 逆向扫描恢复状态 |
| `fs.readFileSync()` | 读取 skill/agent 文件内容 |
| `child_process.spawn()` | Dispatch subagent + gate 脚本 |

### Phase-Skill 映射

| Phase | Skill Name | Review Prefix | Retrospect Prefix |
|-------|-----------|---------------|-------------------|
| 1 | xyz-harness-brainstorming | spec_review | spec_retrospect |
| 2 | xyz-harness-writing-plans | plan_review | plan_retrospect |
| 3 | xyz-harness-phase-dev | code_review | dev_retrospect |
| 4 | xyz-harness-phase-test | test_review | test_retrospect |
| 5 | xyz-harness-phase-pr | pr_review | overall_retrospect |

### Skill 文件发现策略
- 通过 `event.systemPromptOptions.skills` 查找 `skill.name === PHASES[n].skillName`
- 找到后用 `fs.readFileSync(skill.filePath, "utf8")` 读取完整内容
- 找不到时 throw error，提示用户检查 skill 安装

### Agent 文件发现策略
- harness-retrospect agent 位于 `~/.pi/agent/agents/harness-retrospect/agent.md`（硬编码路径）
- 备选：通过 `ctx.cwd` 相对路径 `agents/harness-retrospect/agent.md`

### Review Subagent 的 System Prompt 构造
- 读取 `xyz-harness-expert-reviewer` SKILL.md 全文作为 system prompt
- Task prompt 根据当前 phase 构造：
  - Phase 1: “按以下方法论审查，重点检查 spec 完整性”
  - Phase 2: “按以下方法论审查，检查 plan 可行性”
  - Phase 3: “按以下方法论审查，检查代码实现是否满足 spec”
  - Phase 4: “按以下方法论审查，检查测试覆盖度和质量”
  - Phase 5: “按以下方法论审查，检查 PR 变更”

**Review 输出格式要求（关键）**：YAML frontmatter 中 `verdict` 和 `must_fix` 必须在顶层，不能嵌套。gate check 脚本 `check_phase_1/2` 在顶层查找这两个字段。Task prompt 中必须明确指定输出模板：
```yaml
---
verdict: pass  # 或 fail
must_fix: 0
---
```

### Retrospect Subagent 的 System Prompt 构造
- 读取 `harness-retrospect` agent.md 全文作为 system prompt
- Task prompt 包含：phase 编号、名称、topicDir、交付物路径列表

### 文件结构
```
~/.pi/agent/extensions/coding-workflow/
├── index.ts              # 主入口（注册 tools、commands、events）
├── gate-check.py         # Gate check 脚本（从 xyz-harness-gate 复制）
└── lib/
    ├── subagent.ts       # Subagent spawn 逻辑（从 xyz-pi-extensions/subagent 提取核心函数）
    └── model-resolve.ts  # 模型选择逻辑（从 xyz-pi-extensions/subagent 提取）
```

所有代码自包含在 extension 目录下。`lib/` 中的函数从 `xyz-pi-extensions/subagent/src/index.ts` 复制，仅保留 coding-workflow 需要的部分（去掉 parallel/chain/background 逻辑）。

### Gate 脚本路径
- 全局：`~/.pi/agent/extensions/coding-workflow/gate-check.py`（与 extension 放在一起）
- 从 `xyz-harness-gate/scripts/check_gate.py` 复制，保证任何项目目录下都可用
- 运行时使用 `__dirname` + 相对路径定位脚本（不依赖 ctx.cwd）

### Subagent Spawn 参数
```
pi --mode json -p --no-session --model {resolvedModel} --thinking {level} --tools read,bash,write,edit --append-system-prompt {tmpFile} {taskPrompt}
```

不指定 `--agent`（不需要 agent 发现逻辑，system prompt 直接构造）。

模型通过 `taskComplexity` 从 `subagent-models.json` 解析，包含 fallback 逻辑。

## Complexity Assessment

**中高复杂度**。

核心难点：
1. Subagent spawn + JSON 输出流解析（从 xyz-pi-extensions/subagent 复用核心函数）
2. 模型路由逻辑（从 subagent-models.json 解析 + fallback）
3. State 持久化 + 恢复（参考 todolist example）
4. before_agent_start 注入逻辑（相对简单）
5. Gate 脚本执行 + 结果解析（标准 child_process）

预计代码量：1000-1500 行。建议拆分为 index.ts + lib/ 辅助模块。

### 代码复用策略

从 `xyz-pi-extensions/subagent/src/index.ts` 提取以下函数到 `lib/subagent.ts`：
- `getPiInvocation()` — 跨平台 spawn 命令解析
- `writePromptToTempFile()` — system prompt 临时文件
- `runSingleAgent()` — 核心 spawn + JSON 解析（简化版，去掉 agent discovery 和 parallel/chain 逻辑）
- `getFinalOutput()` — 提取最终输出
- `formatTokens()` / `formatUsageStats()` — 展示辅助

从 `xyz-pi-extensions/subagent/src/index.ts` 提取模型相关逻辑到 `lib/model-resolve.ts`：
- `loadSubagentModels()` — 加载 subagent-models.json
- `resolveModelByComplexity()` — 按 complexity 路由模型
- `resolveModel()` — 按 provider/model 解析 + fallback

这些函数均为纯函数或仅依赖 Node.js 内置模块 + Pi 内置包，可以安全复制到 `lib/` 目录下。所有代码自包含在 `~/.pi/agent/extensions/coding-workflow/` 中，不依赖外部项目。

风险点：
- compact 回调时机（`onComplete` 是否可靠）
- Review 版本号自动递增逻辑需要扫描已有文件
- Gate 脚本复制后需要保持与 xyz-harness-gate 版本同步
