# Harness V5 现状评估

基于六维度框架对 xyz-harness V5 当前系统的逐维度符合性评估。本文档回答两个问题：每个维度具体做了什么？还有哪些不足？

评估基准：成熟 AI coding agent 系统（Claude Code、OpenAI Codex、Devin、SWE-Agent）。

---

## 维度一：上下文管理 — 部分符合

### 已实现

| 机制 | 实现位置 | 说明 |
|------|---------|------|
| IL0 系统指令 | Pi 平台自动加载 | CLAUDE.md + 全局配置 + skill 元数据列表 |
| IL1 Phase 指令 | `index.ts` `before_agent_start` | 读取当前 Phase Skill 全文，注入到 `[CODING WORKFLOW]` 消息中 |
| IL2 按需加载 | Skill 文档中指引 AI read | expert-reviewer、backend-dev、frontend-dev、TDD 等 |
| IL3 Gate 指令 | 独立 session 加载 gate skill | gate-check.py + xyz-harness-gate SKILL.md |
| Phase 间压缩 | `index.ts` `ctx.compact()` | phase-start 中调用，清除对话历史，保留 customInstructions |
| 信息隔离 | Skill 注入中不暴露全局结构 | AI 不知道有 5 个 Phase、不知道下一个 Phase 是什么 |

### 不足

| ID | 问题 | 影响 |
|----|------|------|
| G1.1 | Phase 内无压缩 — Phase 3 可能持续数百轮对话，无自动 compact 触发 | 后期响应变慢，关键信息被淹没 |
| G1.2 | 无 token 预算追踪 — 不知道当前上下文窗口用了多少 | 无法预警上下文即将溢出 |
| G1.3 | IL0 无预算管理 — CLAUDE.md 约 200 行 + skill 元数据列表，token 不可控 | IL0 可能占据过多上下文空间 |
| G1.4 | 无跨 Topic 记忆 — 每次 `/coding-workflow` 从零开始 | 项目特定知识（测试框架、目录结构）无法携带 |

---

## 维度二：工具系统 — 部分符合

### 已实现

| 机制 | 实现位置 | 说明 |
|------|---------|------|
| 核心工具集 | Pi 平台提供 | read, bash, write, edit |
| Harness 专用工具 | `index.ts` 注册 | `coding-workflow-gate`（提交验证）、`coding-workflow-phase-start`（推进 Phase） |
| Subagent 工具集 | `subagent.ts` `runSingleAgent` | 默认 `read,bash,write,edit` |
| Subagent 超时 | `subagent.ts` | 10 分钟全局超时 + 5 分钟无活动超时 |
| 进度反馈工具 | `index.ts` Widget | TUI 显示 Phase 进度条 |
| 命令系统 | `index.ts` 注册 | `/coding-workflow`、`/coding-workflow-status`、`/coding-workflow-abort` |

### 不足

| ID | 问题 | 影响 |
|----|------|------|
| G2.1 | Subagent 工具集硬编码 — `runSingleAgent` 写死 `read,bash,write,edit` | Review Subagent 不需要 write/edit，给了多余权限 |
| G2.2 | 无 Phase 级工具白名单 — 每个 Phase AI 拥有相同工具集 | Phase 1 不需要 write/edit，Phase 5 不应有 merge 权限 |
| G2.3 | 不可逆操作仅靠文字约束 — Phase 5 "MUST NOT merge" 写在 Skill 文档里 | AI 可能无视文字约束 |
| G2.4 | 无 Bash 安全机制 — AI 可执行任意命令 | 无沙箱、无命令黑名单、无权限分层 |

---

## 维度三：执行编排 — 部分符合

### 已实现

| 机制 | 实现位置 | 说明 |
|------|---------|------|
| 5 Phase 线性流水线 | `index.ts` `PHASES` 常量 | Spec → Plan → Dev → Test → PR |
| Phase 切换协议 | gate → phase-start → compact → inject | 完整的状态机：`phaseResults[N] === "passed"` 才能推进 |
| 隐式 Loop | gate fail → AI 修复 → 重新 gate | AI 自行响应 fail 消息并修复 |
| 中断机制 | `/coding-workflow-abort` | 杀死所有 subagent，重置状态 |
| 状态持久化 | `pi.appendEntry` + `reconstructState` | 写入 session entries，`session_start` 时重建 |
| TUI 进度展示 | Widget + setStatus | 实时显示 Phase 进度 |

### 不足

| ID | 问题 | 影响 |
|----|------|------|
| G3.1 | Loop 无显式状态机 — V5 spec 定义了循环起点和 runOnce 语义，代码没实现 | AI 可能跳过 runOnce stage 或不回到正确的循环起点 |
| G3.2 | 无 Stage 级追踪 — `WorkflowState` 只有 `currentPhase`，没有 `currentStage` | 崩溃后无法知道 Phase 内部执行到了哪一步 |
| G3.3 | 无检查点/恢复 — abort 后已完成的工作无法恢复 | Phase 3 编码到一半 abort，代码和测试全部浪费 |
| G3.4 | 无并行调度 — 多个独立 task 串行执行 | Phase 3 中跨前后端的 task 理论上可并行 |

---

## 维度四：状态与记忆 — 部分符合

### 已实现

| 机制 | 实现位置 | 说明 |
|------|---------|------|
| 运行时状态 | `WorkflowState` 接口 | isActive, currentPhase, topicDir, topicName, phaseResults |
| 状态持久化 | `persistState()` → `appendEntry` | 写入 Pi session entries |
| 状态恢复 | `reconstructState()` | `session_start` 事件中从最新 entry 重建 |
| 状态验证 | `reconstructState` 中的校验 | currentPhase 范围检查、topicDir 存在性检查 |
| Review 版本管理 | `getNextReviewVersion()` | 自动递增 `_v{N}` 后缀 |

### 不足

| ID | 问题 | 影响 |
|----|------|------|
| G4.1 | 状态仅在 session entries — Pi 崩溃时 entries 可能不完整 | 状态丢失，无法恢复 |
| G4.2 | 无运行指标收集 — 不记录 Phase 耗时、gate 重试次数、token 消耗 | 自评估复盘只能手写，无法量化 |
| G4.3 | 无跨 Topic 记忆 — 每个 topic 完全独立 | 项目特定知识无法积累 |
| G4.4 | Deliverable 无版本历史 — spec.md、plan.md 被覆盖修改 | 无法追溯 deliverable 的变更历程 |

---

## 维度五：评估与观测 — 部分符合（最强维度）

### 已实现

| 机制 | 实现位置 | 说明 |
|------|---------|------|
| GL1 脚本检查 | `gate-check.py` | 5 个 Phase 的完整检查逻辑，验证文件存在性 + YAML 字段 |
| GL2 AI 评审 | `dispatchReviewSubagent()` | 独立 subagent，加载 expert-reviewer skill，不继承主 agent 上下文 |
| Retrospect | `dispatchRetrospectSubagent()` | 独立 subagent，覆盖执行质量 + harness 可用性 |
| AI 反伪造 | GL1 检查 YAML verdict/must_fix 字段 | AI 无法伪造脚本输出（`child_process.spawn` 执行） |
| 结果可见 | gate PASS 消息包含 review + retrospect 状态 | 失败不会被静默吞掉 |
| Review 版本化 | `getNextReviewVersion()` | 评审产出 `*_v1.md`、`*_v2.md`，可追溯评审历程 |
| 必须修复归零 | `parseReviewVerdict` 检查 must_fix === 0 | AI 不能在评审问题未修复时推进 |
| Subagent usage 统计 | `formatUsageStats()` | 显示 turns、input/output tokens、cost、model |

### 不足

| ID | 问题 | 影响 |
|----|------|------|
| G5.1 | 无结构化日志 — 只有 console.warn 和 stderr | 无法回答"Phase 3 gate fail 了 3 次，每次原因是什么？" |
| G5.2 | 评审质量无法衡量 — 不知道 review 发现的问题中多少是真实的 | "AI 审 AI 无信息增量"是主观判断，无客观数据 |
| G5.3 | 无质量趋势 — 多次运行的质量数据没被聚合 | 无法回答"harness 用了 10 次后质量提升了没有？" |
| G5.4 | GL1 覆盖度有限 — 只检查文件存在和 YAML 字段，不检查内容质量 | AI 可以写一个空的 spec.md（只有 frontmatter）通过 GL1 |

---

## 维度六：约束与恢复 — 部分符合

### 已实现

| 机制 | 实现位置 | 说明 |
|------|---------|------|
| 五层防御体系 | CLAUDE.md 设计文档 | L1 上下文隔离 → L2 脚本门禁 → L3 独立评审 → L4 强制复盘 → L5 结果可见 |
| 逃脱模式目录 | CLAUDE.md AI 控制哲学 | 8 种逃脱行为 + 对策（跳过 gate、伪造结果、偷看上下文等） |
| Phase 间信息隔离 | compact + 不暴露全局结构 | AI 不知道 Phase 总数和后续 Phase |
| Retrospect 安全链 | gate → review → retrospect → phase-start 检查 | retrospect 文件不存在则 BLOCKED |
| Phase 5 不可逆约束 | Skill 文档 "MUST NOT merge" | 文字级别约束 |
| Abort 清理 | `/coding-workflow-abort` | 杀死所有 subagent，重置状态 |
| Subagent 超时 | 10 分钟全局 + 5 分钟无活动 | 防止 subagent 无限运行 |
| gate-check.py 超时 | 30 秒 | 防止脚本 hang 住 |

### 不足

| ID | 问题 | 影响 |
|----|------|------|
| G6.1 | 无 gate 重试预算 — AI 可无限重试 gate | 如果 AI 犯同类错误，会无限循环 |
| G6.2 | 无错误分类 — 所有 fail 统一处理 | 文件缺失（确定性）和内容质量问题（不确定）应有不同恢复策略 |
| G6.3 | 无熔断器 — Subagent 连续失败时无限重试 | 模型 API 故障时浪费 token 和时间 |
| G6.4 | 不可逆操作保护弱 — 靠文字约束而非工具级禁令 | "MUST NOT merge" 写在 Skill 里，不写在 bash 工具 prompt 里 |
| G6.5 | 无渐进降级 — 单一的 fail → 重试策略 | 没有"换模型重试"或"降级到手动"的路径 |
| G6.6 | 无 Withholding 机制 — 所有错误都暴露给 AI | 可恢复的小错误（YAML 类型错误）AI 能静默修复，不需要暴露 |

---

## 总结

| 维度 | 符合度 | 最强的点 | 最大的缺口 |
|------|--------|---------|-----------|
| 上下文管理 | 部分 | 四层指令注入 + Phase 间 compact | Phase 内无压缩、无预算追踪 |
| 工具系统 | 部分 | 核心工具集完整 + Subagent 超时 | 无权限分层、工具集不可配置 |
| 执行编排 | 部分 | 5 Phase 线性流水线 + 完整切换协议 | 无 Loop 状态机、无 Stage 追踪、无恢复 |
| 状态与记忆 | 部分 | 运行时状态 + 持久化 + 恢复 | 无指标收集、无跨 Topic 记忆 |
| 评估与观测 | **最强** | GL1+GL2+Retrospect 三层验证 + 反伪造 + 版本化 | 无结构化日志、评审质量无法量化 |
| 约束与恢复 | 部分 | 五层防御体系 + 逃脱模式目录 | 无重试预算、无熔断器、无错误分类 |

六个维度都有覆盖，没有一个是"完全符合"。**评估与观测是最强维度**——这是 harness 的核心价值所在。**执行编排和约束恢复**是最需要补强的，因为当前主要依赖 AI 自觉性和 Skill 文档的文字约束。
