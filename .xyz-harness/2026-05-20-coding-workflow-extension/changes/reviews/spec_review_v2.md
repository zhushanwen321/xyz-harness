---
verdict: pass
must_fix: 0
review:
  type: spec_review
  round: 2
  timestamp: "2026-05-21T14:30:00"
  target: ".xyz-harness/2026-05-20-coding-workflow-extension/spec.md"
  summary: "计划评审完成，第2轮，0条MUST FIX，通过"
statistics:
  total_issues: 7
  must_fix_resolved: 3
  low: 1
  info: 1

issues:
  - id: 1
    severity: MUST_FIX
    location: "spec.md:FR-3 Gate Tool / FR-11 错误处理"
    title: "Subagent spawn 失败（非零退出之外的情况）未处理"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 2
    severity: MUST_FIX
    location: "spec.md:FR-1 Workflow 启动"
    title: "缺少并发 workflow 启动的防护——state.isActive 检查"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 3
    severity: MUST_FIX
    location: "spec.md:FR-9 状态查询与管理"
    title: "/coding-workflow-abort 未定义 subagent/子进程生命周期管理"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 4
    severity: LOW
    location: "spec.md:FR-3 Gate Tool"
    title: "Review 版本号自动递增逻辑未在 gate 流程中明确设计"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 5
    severity: LOW
    location: "spec.md:FR-10 Custom Tool Rendering"
    title: "Custom renderCall/renderResult 描述过于模糊"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 6
    severity: INFO
    location: "spec.md:FR-4 Phase Start Tool"
    title: "ctx.compact() 的 customInstructions 参数依赖未验证的 Pi API"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 7
    severity: LOW
    location: "spec.md:FR-3 Gate Tool step 3 vs step 4"
    title: "Review subagent dispatch 未将子进程引用加入 activeSubprocesses，与 retrospect subagent 不一致"
    status: open
    raised_in_round: 2
    resolved_in_round: null
---

# 计划评审 v2

## 评审记录

- 评审时间：2026-05-21 14:30
- 评审类型：计划评审（spec 完整性）
- 评审对象：`.xyz-harness/2026-05-20-coding-workflow-extension/spec.md`
- 评审轮次：第 2 轮（回归验证 v1 的 3 条 MUST FIX）

---

## 验证结果：3 条 MUST FIX 修复检查

### #1: Subagent spawn 失败处理 → ✅ 已修复

**v1 问题**：FR-11 只覆盖了"Subagent 非零退出 → 作为 tool error 返回"，但 spawn 本身可能失败（pi 二进制找不到、PATH 未配置、fork 资源不足等）。gate 流程无 error path。

**当前 spec 对照**：

| 位置 | 内容 | 状态 |
|------|------|------|
| FR-3 step 3 | `spawn 失败 → catch error，返回明确错误消息，AI 可重试` | ✅ |
| FR-3 step 4 | `spawn 失败 → catch error，返回明确错误消息` | ✅ |
| FR-11 | `Subagent spawn 失败（pi 二进制找不到 ENOENT、系统资源不足、fork 失败）→ catch spawn error，返回明确错误消息，AI 可重试` | ✅ |
| FR-11 | `所有 subagent dispatch 使用 try-catch 包裹，确保 spawn 失败不会导致 workflow 卡死` | ✅ |

**判定**：已修复。spawn 失败场景从完全缺失变为有完整的 try-catch 覆盖和恢复路径。

---

### #2: 并发 workflow 启动防护 → ✅ 已修复

**v1 问题**：FR-1 在启动时直接创建目录和初始化状态，未检查 `state.isActive`。用户在工作流进行中再次输入 `/coding-workflow` 会导致 state 被覆盖。

**当前 spec 对照**：

| 位置 | 内容 | 状态 |
|------|------|------|
| FR-1 step 1 | `检查 state.isActive — 如果已有活跃 workflow，报错提示用户先 abort 或等待完成` | ✅ |
| FR-9 step 1 | `检查 state.isActive，未激活则无操作`（abort 前也做检查） | ✅ |

**判定**：已修复。启动入口有前置检查，abort 也有活性检查。

---

### #3: Abort 子进程清理 → ✅ 已修复

**v1 问题**：`/coding-workflow-abort` 没有清理 dispatch 出去的 subagent 进程，导致孤儿进程持续占用资源、可能同时读写文件导致竞争。

**当前 spec 对照**：

| 位置 | 内容 | 状态 |
|------|------|------|
| FR-7 runtime state | `const activeSubprocesses: ChildProcess[] = []; // abort 时清理` | ✅ |
| FR-3 step 4 | `子进程引用加入 activeSubprocesses 列表（abort 时可清理）` | ✅ |
| FR-9 step 2 | `遍历活跃子进程引用列表（activeSubprocesses: ChildProcess[]），对每个调用 kill()` | ✅ |
| FR-9 step 3 | `清理临时文件（subagent 的 prompt 临时文件）` | ✅ |

**判定**：已修复。进程引用追踪 + abort 时 kill + 临时文件清理形成完整生命周期管理。

---

## V1 非 MUST FIX 项回归检查

### LOW #4: Review 版本号自动递增 → ✅ 已修复

v1 指出 FR-3 未设计版本号管理。当前 spec FR-3 step 3 已增加：
```
扫描 {topicDir}/changes/reviews/ 确定 nextVersion（当前最大版本号 + 1）
```
版本号管理方案已明确。

### LOW #5: Custom Tool Rendering 细节 → ✅ 已修复

v1 指出渲染定义模糊。当前 spec FR-10 已为 gate tool 和 phase-start tool 分别定义了：
- **coding-workflow-gate**: renderCall（phase + topicDir）、renderResult 进行中/通过/失败三种状态的展示内容和格式
- **coding-workflow-phase-start**: renderCall（phase 迁移）和 renderResult（完成或 compact 状态）

渲染内容已从模糊描述变为每种状态有具体展示信息。

### INFO #6: compact API 参数 → ⚠️ 未修复（仍为 INFO）

当前 spec FR-4 step 5 仍为：
```
触发 ctx.compact()，customInstructions 指向保留 phase 关键产出物路径
```
仍然假设 `ctx.compact()` 接受 `customInstructions` 参数。此 API 签名是否支持需在实现前验证。维持 INFO 级别，不阻塞。

---

## 新增问题

### #7 (LOW): Review subagent dispatch 缺少 activeSubprocesses 追踪

**位置**：FR-3 Gate Tool step 3 vs step 4

**描述**：
FR-3 step 4（Dispatch retrospect subagent）明确写了 `子进程引用加入 activeSubprocesses 列表`，但 step 3（Dispatch review subagent）没有。这是不一致的设计——如果 Pi 运行时支持在工具执行期间中断并运行 abort 命令，review subagent 不会被子进程清理机制覆盖，成为孤儿进程。

两种可能性：
1. 设计省略——review subagent 先执行，执行完后才检查 must_fix，此时进程已结束，无需追踪
2. 设计遗漏——只是忘记在 step 3 也加上相同的追踪

**修改建议**：
在 FR-3 step 3 的 spawn 调用之后增加与 step 4 一致的子进程引用追踪，确保两个 subagent dispatch 路径的行为一致。即使当前认为是"不需要"，主动追踪也不会有副作用，且保持代码路径统一。

---

## 综合评估

### Spec 整体质量

| 维度 | 评分 | 说明 |
|------|------|------|
| 目标明确性 | ✅ | Background 一段话说明白要做什么 |
| 范围合理性 | ✅ | 11 个 FR + 7 个 AC，边界明确 |
| 验收标准可量化 | ✅ | 所有 AC 可写自动化测试验证 |
| 约束完整性 | ✅ | 技术栈、API 范围、文件结构、Phase-Skill 映射全部明确 |
| 错误处理覆盖 | ✅ | 6 个错误场景均已覆盖（含本次修复的 spawn 失败、并发防护、abort 清理） |
| 遗留未决议项 | ✅ | 无 `[待决议]` 标记 |

### MUST FIX 汇总

| # | 状态 | 原有问题 | 修复位置 |
|---|------|---------|---------|
| 1 | ✅ RESOLVED | Subagent spawn 失败无处理 | FR-3 step 3/4 + FR-11 |
| 2 | ✅ RESOLVED | 并发 workflow 无防护 | FR-1 step 1 + FR-9 step 1 |
| 3 | ✅ RESOLVED | Abort 无子进程清理 | FR-7 state + FR-3 step 4 + FR-9 |

3 条 MUST FIX 全部已修复，0 条 open MUST FIX。

---

## 结论

**通过。** 上一轮 3 条 MUST FIX 均已正确修复：

- **#1 Subagent spawn 失败处理**：已增加 catch error + 明确错误消息 + AI 可重试的恢复路径
- **#2 并发 workflow 防护**：FR-1 启动前置检查 `state.isActive`，重复启动报错提示
- **#3 Abort 子进程清理**：新增 `activeSubprocesses: ChildProcess[]` 运行时状态追踪，abort 时遍历 kill + 清理临时文件

新增 1 条 LOW（review subagent 未加入 activeSubprocesses 追踪的不对称问题）和 1 条 INFO（compact API 参数未验证）不影响 verdict。

Spec 整体质量高——目标明确、范围合理、验收标准可量化、约束完整、所有已知错误路径已覆盖。建议开始 Phase 2 (Plan) 编写。

---

## Summary

计划评审完成，第2轮通过，0条MUST FIX
