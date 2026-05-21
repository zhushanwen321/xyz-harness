---
review:
  type: code_review
  round: 1
  timestamp: "2026-05-21T10:30:00"
  target: "~/.pi/agent/extensions/coding-workflow/ (index.ts, lib/model-resolve.ts, lib/subagent.ts, gate-check.py)"
  verdict: fail
  summary: "编码评审完成，第1轮，1条MUST FIX，需修改后重审"

statistics:
  total_issues: 6
  must_fix: 1
  must_fix_resolved: 0
  low: 3
  info: 2

issues:
  - id: 1
    severity: MUST_FIX
    location: "lib/subagent.ts:252-253"
    title: "proc.on('error') 丢失 Error 对象信息，spawn 失败时错误消息为 'Unknown error'"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 2
    severity: LOW
    location: "lib/subagent.ts:47"
    title: "formatTokens 百万分支多余 `}`，输出形如 '1.5M}' 而非 '1.5M'"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 3
    severity: LOW
    location: "lib/model-resolve.ts:160-196"
    title: "resolveModel 函数 export 但未被任何文件 import，属于死代码"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 4
    severity: LOW
    location: "index.ts:337-339"
    title: "Phase Start Tool 对缺失 retrospect 文件仅 warn 而非报错，与 spec FR-4 要求不符"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 5
    severity: INFO
    location: "index.ts:291-293"
    title: "parseReviewVerdict 在 mustFix=-1(字段被嵌套/缺失)且 verdict='pass' 时可能误判通过"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 6
    severity: INFO
    location: "index.ts:39-42"
    title: "GATE_SCRIPT_PATH 使用硬编码 os.homedir() 路径而非 import.meta.dir 相对路径"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 编码评审 v1

## 评审记录

- 评审时间：2026-05-21 10:30
- 评审类型：编码评审
- 评审对象：`~/.pi/agent/extensions/coding-workflow/` — 全部 4 个文件（index.ts ~870 行, lib/model-resolve.ts ~167 行, lib/subagent.ts ~322 行, gate-check.py ~449 行）

---

## 1. Spec 合规检查

逐条对照 spec 的 FR-1 到 FR-11：

### FR-1: Workflow 启动
- `/coding-workflow <topic>` 命令实现了状态冲突检测、topic 目录创建、状态初始化、持久化、widget 渲染 ✅
- `sendUserMessage` 通过 `followUp` 触发下一轮 `before_agent_start` 注入 Phase 1 skill ✅

### FR-2: AI 上下文注入（before_agent_start）
- `pi.on("before_agent_start")` 事件正确注入 STRICT MODE 约束 + skill 内容 ✅
- 注入内容包含禁止提前知道后续 phase 的规则（FR-2 核心约束）✅
- Skill 内容通过 `systemPromptOptions.skills` 查找并 `fs.readFileSync` 读取 ✅

### FR-3: Gate Tool（coding-workflow-gate）
- 工具已注册，参数为 `phase: number` ✅
- phase 匹配验证、gate 脚本执行、review subagent dispatch、verdict 解析、retrospect subagent dispatch 链路完整 ✅
- Review subagent 使用 expert-reviewer skill 作为 system prompt ✅
- Retrospect subagent 失败时优雅降级（仅 warn，不阻塞 gate 通过）✅
- Phase 5 gate 通过后不提示调用 phase-start（符合 spec FR-8）✅

### FR-4: Phase Start Tool（coding-workflow-phase-start）
- 校验 gate 已通过 ✅
- 递增 `state.currentPhase` ✅
- Phase > 5 时清理状态 ✅
- `ctx.compact()` 调用正确，包含 `onComplete` 和 `onError` ✅
- **⚠️ 偏差**: 检查 retrospect 文件存在时仅 `console.warn`，但 spec 要求 `报错`（见 issue #4）

### FR-5: TUI Progress Widget
- `ctx.ui.setWidget` 渲染 5 个 phase 进度条 ✅
- `ctx.ui.setStatus` 显示 Phase N/5 ✅
- `updateWidget` 在 `session_start`、`turn_end`、状态变更后调用 ✅

### FR-6: Subagent Dispatch
- `runSingleAgent` 封装了完整的 spawn + JSON 流解析逻辑 ✅
- Spawn 参数正确（`--mode json -p --no-session --model --thinking --tools read,bash,write,edit`）✅
- System prompt 通过 `--append-system-prompt` 传入临时文件 ✅
- `processRegistry` 正确注册/注销子进程 ✅
- `onUpdate` 回调支持 TUI streaming ✅

### FR-7: State Persistence & Recovery
- `pi.appendEntry("coding-workflow", ...)` 持久化 ✅
- `reconstructState` 逆向扫描 session entries 恢复 ✅
- `session_start` 事件中重建状态 ✅

### FR-8: Phase 5 特殊约束
- `before_agent_start` 中 Phase 5 额外注入禁止合并 PR 指令 ✅
- Gate 工具 Phase 5 通过后不引导调用 phase-start ✅

### FR-9: 状态查询与管理
- `/coding-workflow-status` 正确显示进度 ✅
- `/coding-workflow-abort` 正确 kill 子进程 + 重置状态 ✅

### FR-10: Custom Tool Rendering
- `renderCall`/`renderResult` 使用 `Text` 组件 + `theme.fg()` 着色 ✅
- `renderResult` 有限制预览行数（slice 10 行）防止 TUI 溢出 ✅

### FR-11: 错误处理
- Skill 找不到 → throw error ✅
- Gate 脚本失败 → 返回 stderr ✅
- Subagent spawn 失败 → catch error ✅（但错误消息丢失，见 issue #1 MUST FIX）
- Subagent 非零退出 → 返回错误消息 ✅
- Compact 失败 → 跳过 compact，仍注入新 phase 指令 ✅

### AC 覆盖矩阵

| AC | 场景 | 覆盖状态 | 代码位置 |
|----|------|---------|---------|
| AC-1 | 启动与 Phase 1 进入 | ✅ | `registerCommand("coding-workflow")` + `before_agent_start` |
| AC-2 | Gate 检查 | ✅ | `registerTool("coding-workflow-gate")` + `runGateScript` |
| AC-3 | Review & Retrospect Subagent | ✅ | `dispatchReviewSubagent` + `dispatchRetrospectSubagent` |
| AC-4 | Phase Transition | ✅ | `registerTool("coding-workflow-phase-start")` |
| AC-5 | Phase 5 PR 约束 | ✅ | `before_agent_start` phase 5 分支 |
| AC-6 | 状态持久化 | ✅ | `persistState` + `reconstructState` |
| AC-7 | Extension 全局可用 | ✅ | 文件位于 `~/.pi/agent/extensions/coding-workflow/` |

---

## 2. Pi Extension API 使用检查

| API | 使用位置 | 评价 |
|-----|---------|------|
| `pi.registerTool()` | gate + phase-start | ✅ |
| `pi.registerCommand()` | /coding-workflow, /status, /abort | ✅ |
| `pi.on("before_agent_start")` | session 上下文注入 | ✅ |
| `pi.on("session_start")` | 状态恢复 + widget | ✅ |
| `pi.on("turn_end")` | widget 更新 | ✅ |
| `pi.appendEntry()` | 状态持久化 | ✅ |
| `pi.sendUserMessage()` | phase 转换 + workflow 启动 | ✅ |
| `ctx.ui.setWidget()` | progress widget | ✅ |
| `ctx.ui.setStatus()` | footer status | ✅ |
| `ctx.ui.notify()` | 命令反馈 | ✅ |
| `ctx.compact()` | phase 切换 | ✅ |
| `ctx.sessionManager.getEntries()` | 状态扫描恢复 | ✅ |
| `pi.registerMessageRenderer()` | 上下文消息渲染 | ✅ |
| `withFileMutationQueue` | 临时文件写入 | ✅ |
| `Type` (typebox) | 工具参数 schema | ✅ |
| `Text` (pi-tui) | TUI 渲染组件 | ✅ |

**结论**: Pi Extension API 使用正确，无 API 违规。

---

## 3. lib/ 模块提取质量

### lib/model-resolve.ts

从 `xyz-pi-extensions/subagent` 提取的函数：
- `loadSubagentModels()` — 完整保留 ✅
- `resolveModelByComplexity()` — 完整保留 ✅
- `resolveModel()` — 完整保留，但 ⚠️ **未被 index.ts import 或使用**（issue #3）
- `getFallbackRefsForModel()` — 正确保留为内部函数 ✅

提取干净，只包含需要逻辑。类型定义（`TaskComplexity`, `ThinkingLevel`）正确导出。

### lib/subagent.ts

从 `xyz-pi-extensions/subagent` 提取的函数：
- `runSingleAgent()` — 核心 spawn + JSON 流解析，简化正确 ✅
- `getPiInvocation()` — 跨平台兼容 ✅
- `writePromptToTempFile()` — 使用 `withFileMutationQueue` ✅
- `cleanupOldTempFiles()` — 包含目录创建和过期清理 ✅
- `getFinalOutput()` — 从 messages 提取最终文本 ✅
- `formatTokens()` / `formatUsageStats()` — 展示辅助 ✅

`processRegistry` 的 abort 支持正确实现（push 进程 → close 时 splice 移除）。与 index.ts 的 `activeSubprocesses` 联动一致 ✅。

**简化评价**: 正确移除了 parallel/chain/background 逻辑，只保留 single foreground mode。

---

## 4. 发现的问题

### MUST FIX

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | **MUST FIX** | `lib/subagent.ts:252-253` | `proc.on("error", () => { resolve(1); })` 忽略了 Error 对象的 message。当 subagent spawn 失败（如 `pi` 二进制找不到 ENOENT）时，`dispatchReviewSubagent` 中得到的 `result.stderr` 为空，`getFinalOutput` 返回空字符串，最终错误消息为 "Review subagent failed: Unknown error"，完全无法帮助调试。 | 修改为 `proc.on("error", (err) => { result.stderr = err.message; resolve(1); })`，将 Error.message 写入 result.stderr |

### LOW

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 2 | LOW | `lib/subagent.ts:47` | `formatTokens()` 百万分支末尾多一个 `}`：`${(count / 1000000).toFixed(1)}M}`。正确应为 `${(count / 1000000).toFixed(1)}M`。导致类似 "1.5M}" 的输出。仅影响用户可见的 token 统计显示，不影响逻辑。 | 删除多余的 `}` |
| 3 | LOW | `lib/model-resolve.ts:160-196` | `resolveModel()` 函数被 export 但 **未被 index.ts 或其他文件 import**。index.ts 中 gate tool 使用 `resolveModelByComplexity` 而非 `resolveModel`。该函数在 coding-workflow 上下文中是死代码。 | 移除 export 保留为内部函数，或删除（如果在 coding-workflow 中不需要） |
| 4 | LOW | `index.ts:337-339` | Phase Start Tool 中，检查 retrospect 文件不存在的处理为 `console.warn()`，但 spec FR-4 明确要求 "不存在 → 报错"。虽然 `console.warn` 会打印到 Pi 日志，但不会阻止 phase 转换。spec 括号内注明 "正常不应发生"（因为 gate 内部已执行），但实现与 spec 要求不符。 | 改为 `return { content: [...], isError: true }` 阻断流程，或在 spec 确认后可接受 warn 行为 |

### INFO

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 5 | INFO | `index.ts:291-293` | `parseReviewVerdict` 中，如果 `verdict` 在顶层能找到（值为 "pass"）但 `must_fix` 被嵌套在其他字段下（regex 只搜顶层），`mustFix` 保持默认值 -1。检查条件 `if (mustFix > 0 \|\| verdict !== "pass")` 对 -1 和 "pass" 不会触发，导致 nested must_fix 未被检测到。但该函数仅用于门禁工具的 AI 反馈层，独立 gate-check.py 有独立的 YAML 校验，形成防御纵深。 | 可在 mustFix 默认值为 -1 时强制返回 fail（`if (mustFix === -1) { verdict: "fail", ... }`） |
| 6 | INFO | `index.ts:39-42` | `GATE_SCRIPT_PATH` 使用硬编码的 `os.homedir() + "/.pi/agent/extensions/coding-workflow/gate-check.py"`。相比 `import.meta.dir`（ESM）或 `__dirname`（CJS）的相对路径方式，硬编码更脆弱（例如 symlink 或临时安装到其他路径时失效）。当前部署路径固定且正确，此问题不影响功能。 | 可选使用 `import.meta.dir` 构建相对路径：`path.join(import.meta.dir, "gate-check.py")` |

---

## 5. 错误处理检查

### 正常路径
- Gate 脚本执行失败 → 返回 `{isError: true}`，AI 可修复后重试 ✅
- Review 有 must_fix → 返回审查内容，AI 可修复后重试 ✅
- Subagent 非零退出 → 转为 tool error ✅
- Compact 失败 → 跳过 compact，仍注入新 phase ✅

### 异常路径
| 场景 | 行为 | 评价 |
|------|------|------|
| Skill 未安装 | throw Error，before_agent_start 返回 error message | ✅ |
| Gate 脚本 Python 不存在 | spawn 'error' 事件触发 → resolve(1) → "Unknown error" | ❌ 见 issue #1 |
| Topic 目录创建失败 | `fs.mkdirSync` 会 throw，未被命令 handler 捕获 | ⚠️ 会导致命令崩溃但不会损坏系统 |
| `pi` 二进制不存在 | spawn 'error' 事件触发 → resolve(1) → "Unknown error" | ❌ 见 issue #1 |
| `sessionManager.getEntries` 不存在 | `reconstructState` 中直接调用 `ctx.sessionManager.getEntries()`，如果 sessionManager 为 undefined 则 throw | ⚠️ 运行时应有，但无防御 |
| Abort 时进程已死 | `proc.kill("SIGTERM")` 在 catch 中静默处理 | ✅ |

---

## 6. processRegistry abort 支持

`activeSubprocesses` 与 `runSingleAgent` 的 `processRegistry` 联动：

1. **注册**: gate tool 中 `dispatchReviewSubagent` 和 `dispatchRetrospectSubagent` 传入 `processRegistry: activeSubprocesses` ✅
2. **运行时**: `runSingleAgent` 中 `processRegistry.push(proc)` + close 事件中 `splice` 移除 ✅
3. **Abort**: `/coding-workflow-abort` 遍历 `activeSubprocesses` 执行 `kill("SIGTERM")`，然后清空数组 ✅
4. **超时**: SIGTERM 后 5s 未响应则 SIGKILL（`runSingleAgent` 中 `setTimeout` 逻辑）✅

**结论**: abort 支持完整实现。

---

## 7. cachedSkills 生命周期

`cachedSkills` 的填充和使用链路：

1. **填充**: `before_agent_start` 事件中 `cachedSkills = event.systemPromptOptions?.skills ?? []` ✅
2. **使用**: `dispatchReviewSubagent` → `getExpertReviewerContent()` → `getSkillContent(cachedSkills, "xyz-harness-expert-reviewer")` → fallback ✅
3. **注意**: `cachedSkills` 中不包含 "xyz-harness-expert-reviewer" skill（它不是 phase skill），因此第一条路径总是 throw，实际总是走 fallback 读取文件系统。这不影响功能，但第一路径是死代码。

---

## 8. 结论

**判定: fail** — 存在 1 条 MUST FIX 问题，需要修复后重新评审。

### 必须修复的核心问题

1. **`subagent.ts` proc.on("error") 丢失错误消息** — spawn 失败时用户看到 "Unknown error" 无法调试。这是最关键的缺陷。

### 建议修复的低优先级问题

2. `formatTokens` 多余 `}` 符号修复（LOW）

---

## Summary

编码评审完成，第1轮，1条MUST FIX，需修改后重审。
