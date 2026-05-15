# Workflow Controller Extension — 代码审查报告 v1

## 审查信息
- 审查时间: 2026-05-14
- 审查类型: 健壮性审查
- 审查范围: extensions/workflow-controller/src/ (6 files, 949 lines)

## 发现的问题

| # | 优先级 | 文件 | 描述 | 建议 |
|---|--------|------|------|------|
| 1 | **MUST FIX** | state-manager.ts L23-29 | `load()` 对 JSON 解析失败返回 null，但没有区分"文件不存在"和"文件损坏"。损坏的 state 会被静默丢弃，用户丢失进度而不自知 | 区分 ENOENT 和 JSON.parse 错误，后者应抛异常或写日志，而非静默返回 null |
| 2 | **MUST FIX** | state-manager.ts L42 `save()` | `writeFileSync` 无原子性。进程在写入中途被 kill（compact、Ctrl+C）会留下半截 JSON 文件，下次 `load()` 解析失败 → 状态丢失（恰好命中 #1 的静默丢弃） | 先写临时文件再 rename：`writeFileSync(path + ".tmp", ...)` → `renameSync(path + ".tmp", path)` |
| 3 | **MUST FIX** | state-manager.ts `completeTask()` L128 | taskId 不存在时静默 return，不报错。AI 调用 `harness_task_complete({ taskId: "typo" })` 会得到 "Task typo completed" 的成功响应，但实际什么都没做 | 应 throw Error，或至少返回 warning |
| 4 | **MUST FIX** | state-manager.ts `registerTasks()` L117 | 每次调用**覆盖替换**整个 task 列表。如果 AI 分批注册（先注册 3 个，再追加 2 个），第二批会清空前一批 | 要么改为追加模式，要么在覆盖前检查是否已有完成的 task 并拒绝覆盖 |
| 5 | **MUST FIX** | index.ts L24 `SCRIPTS_DIR` | `skills/xyz-harness-dev-flow/scripts` 是相对路径，GateRunner 用 `process.cwd()` 拼接。但 Pi extension 运行时 `process.cwd()` 不一定是项目根目录，而是 Pi 进程的工作目录 | 应使用 `ctx.cwd` 而非 `process.cwd()`，或从 state.projectRoot 解析 |
| 6 | **MUST FIX** | index.ts `harness_stage_complete` L76-86 | 确认点拒绝时 throw Error，但此时 L1 gate 可能已经通过了（pass 文件已写入）。下次重试时 L1 gate 不一定幂等（如 gate 07 检查 push 状态） | 确认点应在 L1 gate 之前执行，或在确认拒绝时回滚 gate pass 文件 |
| 7 | **MUST FIX** | index.ts `harness_stage_complete` L96-103 | `completeStage` 后 `startStage` 之间如果进程崩溃，状态文件中当前 stage 已 pass 但新 stage 还没 start。session_start 恢复时 `currentStage` 指向已完成的 stage | `completeStage` 和 `startStage` 应该是同一个 save 的原子操作，或者 `completeStage` 时直接推进 `currentStage` |
| 8 | **MUST FIX** | widget.ts L22-27 | `ctx.ui.theme.fg()` 的第二个参数包含 ANSI 转义序列，但 `ctx.ui.setStatus` 和 `ctx.ui.setWidget` 的实际渲染行为取决于 TUI 层。如果 Widget 内容是 string[] 而非 Ink 组件，theme.fg 可能不被正确渲染 | 参考 plan-mode 示例确认 `setWidget` 是否支持 theme.fg 的输出 |
| 9 | **HIGH** | gate-runner.ts L19 | `join(process.cwd(), this.scriptsDir, "gate-script.sh")` — 如果脚本路径含空格（macOS 常见），`execFile("bash", [scriptPath, ...])` 会失败 | 已用 execFile（参数数组），不受空格影响。但脚本路径不存在时无明确错误信息 |
| 10 | **HIGH** | gate-runner.ts L21-46 | `execFile` 的 signal 处理有竞态：`signal.addEventListener("abort", ...)` 在 Promise executor 内注册，但 `execFile` 可能已经 spawn 了子进程。AbortSignal 的 listener 不会阻止已 spawn 的进程 | 改为在调用 execFile 前检查 signal.aborted，或用 AbortSignal.timeout 替代 timeout 选项 |
| 11 | **HIGH** | index.ts `harness_stage_complete` L87-101 | stage 推进到下一个 stage 的逻辑用 `WORKFLOW_STAGES.find(s => s.number > state.currentStage)` 查找。如果 WORKFLOW_STAGES 数组不是严格递增排列（如未来重构），这会跳过 stage | 应该用索引或 `number === currentStage + 1` 确保顺序推进 |
| 12 | **HIGH** | state-manager.ts `rollback()` L141-142 | 回退只清除已记录在 `state.stages` 中的 stage。如果某个 stage 从未开始过（没有 stage 记录），回退后 `currentStage` 指向一个没有 `stages[]` 条目的 stage，`stageState` 查找返回 undefined，task 检查被跳过 | `startStage` 在 `rollback` 后需要确保创建 stage 记录，或 rollback 后立即调用 startStage |
| 13 | **HIGH** | types.ts `WorkflowState.currentPhase` | 类型是 `1 \| 2` 字面量联合，但 `startStage` 中用 `stageNumber <= 8 ? 1 : 2` 硬编码推算。如果 stage 定义变更（如 Phase 1 扩展到 9 步），所有推算点都要同步改 | 应从 WORKFLOW_STAGES 定义中查找 stage 对应的 phase，而非硬编码 |
| 14 | **HIGH** | widget.ts `getStageDef()` | 阶段名称硬编码在 widget.ts 的 `STAGE_NAMES` 中，和 stages.ts 的 `WORKFLOW_STAGES` 重复定义。两个地方不同步的风险 | 删除 STAGE_NAMES，直接从 WORKFLOW_STAGES 查找。widget.ts 需要导入 stages.ts |
| 15 | **HIGH** | index.ts `harness_task_complete` L173 | 和 #3 相关：completeTask 不验证 taskId 是否属于 currentStage。如果 AI 在 stage 5 调用了 stage 3 注册的 taskId（因为 id 重复），会错误修改其他 stage 的 task | completeTask 应限定只操作 currentStage 的 task（已做），但报错应更明确 |
| 16 | **LOW** | index.ts `session_start` handler | 恢复状态后只通知用户，但不触发 `sendMessage(triggerTurn)` 让 AI 继续。如果 AI 在 compact/new 后不知道当前 stage，不会自动继续工作 | session_start 后如果 stage 是 active 状态，应 sendMessage 注入 stage prompt |
| 17 | **LOW** | index.ts `turn_end` handler | `ctx.compact()` 在 turn_end 中调用。但 turn_end 在每个 turn 结束时触发，如果 compact 触发了新的 turn（compact 本身不触发），可能形成连续 compact 循环 | 添加去重标志，防止 compact 还在执行时再次触发 |
| 18 | **LOW** | state-manager.ts `buildTopicDir()` | 正则 `[^a-z0-9\u4e00-\u9fff]` 保留中文字符，但文件系统对中文路径的兼容性不一致（某些 git 配置、Windows） | 考虑只保留 ASCII slug，或提供用户自定义 topicDir 的选项 |
| 19 | **LOW** | index.ts `/dev` command | 加载现有 state 后直接跳到 Phase 2 第一个 stage，不验证 Phase 1 的产出物（spec.md, plan.md）是否存在 | 应检查 spec.md 和 plan.md 存在后再允许启动 |
| 20 | **INFO** | index.ts `harness_stage_complete` | 缺少对 `params.summary` 长度的限制。恶意或错误的超长 summary 会膨胀 workflow-state.json | 添加 summary 最大长度限制（如 500 字符） |

## 架构层面问题

### A1. 状态一致性 — 跨操作原子性

`harness_stage_complete` 中的推进流程有 4 个写操作（gate pass → confirm → completeStage → startStage），任何一个环节失败都会留下不一致状态。建议：

1. 将 "complete current + start next" 合并为一个 `advanceTo(state, nextStage)` 原子操作
2. 确认点移到 gate 之前（先确认意愿，再跑 gate，避免确认拒绝后 gate 副作用）

### A2. 错误恢复 — 崩溃安全

当前没有崩溃恢复机制。建议：
- `load()` 检测到损坏文件时，备份为 `.bak` 而非丢弃
- save 使用 write-to-temp + rename 模式
- 新增 `/harness-repair` 命令，手动修复状态文件

### A3. 并发安全

如果用户快速连续调用 `harness_task_complete` 和 `harness_stage_complete`（AI 可能在一次响应中调用多个工具），文件读写之间没有锁。Pi 的 tool_call 是串行的（非并行执行 mode 下），但 extension 自身的 turn_end compact 和 tool execute 可能有交叉。建议对 save/load 加文件锁或 debounce。

## 修复优先级建议

第一批（核心正确性）：#2, #3, #4, #5, #6, #7, #12
第二批（健壮性）：#1, #10, #11, #13, #14, #16
第三批（优化）：#8, #9, #15, #17, #18, #19, #20
