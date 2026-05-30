# 复盘分析：需求澄清与执行质量改进

> 分析日期：2026-05-31
> 数据来源：4 个项目、15+ 个 harness topic 的 overall/dev/spec retrospect 文件
> 分析目标：定位"需求澄清不清晰"和"执行不理想"两个系统性问题的根因

---

## 一、问题全景

用户反馈的两个问题：

1. **需求澄清环节不清晰** — 总有细节和用户设想不一样，尤其是前端 UI 及其影响的后端功能
2. **有了 spec 和 plan 执行仍不理想** — 即便完成前两个 Phase，最终实现结果仍有差距

---

## 二、根因分析

### 问题一：需求澄清不清晰

根因不是"用户没说清楚"，而是 **AI 在 spec 阶段基于文档假设而非代码事实写 spec**。

| 具体表现 | 出现的 Topic | 后果 |
|---------|-------------|------|
| Spec 假设某接口/RPC 存在，实际没有 | statusline-design（`set_model` RPC）、plugin-remaining-phases（`IConfigService.get/set`） | UI 功能变死代码，后端接口重写 |
| 没扫描现有类型定义 | statusline-design（`thinkingLevelMap` 是动态映射非固定枚举） | 逻辑推倒重来 |
| 文件数/影响范围低估 | fix-modality-overflow（ErrorKind 在 6 处独立声明，初版写 3 文件） | complexity 评估失准 |
| 需求逐步扩展而非一次收敛 | thinking-level-display（中途加模型过滤+耗时列） | Spec 中途扩充，plan 重新规划 |
| 前端组件职责分工不明确 | statusline-design（AppStatusbar 和 SessionStrip 职责重叠） | 多个组件重复实现同一功能 |
| UI 元素位置和用户预期不一致 | statusline-design（branch 3 次移位） | 反复返工 |
| 协议/消息列表分散在多个 FR | plugin-system-frontend-dx（WS 协议 3 轮 review 才收敛） | review 成本高 |

**关键洞察**：对前端 UI 功能，文字 spec 和用户预期之间存在**不可消除的鸿沟**。写 5 轮 spec review 不如一张 HTML wireframe 截图有效。

### 问题二：执行不理想

三个系统性根因：

#### 根因 1：Subagent 产出质量不可控（最严重）

| 失败模式 | 频次 | 具体案例 |
|---------|------|---------|
| **方法语义理解错误** | 4+ 次 | `handleEvent()` vs `activatePlugin()`、`params` vs `parameters`、裸 response vs 包裹格式 |
| **擅自变更接口签名** | 2 次 | `assignWorker` 从同步改异步、返回类型从 `WorkerHandle` 改 `string` |
| **unsafe cast 绕过类型** | 2 次 | `as unknown as BridgeToolExecuteRequest`、RpcResponse 强制转换 |
| **虚构测试/遗漏文件** | 3 次 | 修改实现代码但没创建测试文件、test_results.md 虚构 5 个测试 |
| **框架选错** | 1 次 | node:test vs vitest（subagent 没有 CLAUDE.md 上下文） |
| **留 no-op/placeholder** | 2 次 | `writeSegmentFile` 实现 `void ctx; void segment;`；并行 Task 用 placeholder 引用未完成函数 |
| **逻辑方向反了** | 1 次 | retention window 取 `max()`（宽松），spec 要求 `min()`（严格），2 处都错 |

**根因**：subagent 是无状态隔离进程，task prompt 是它唯一的"记忆"。当 task prompt 缺少完整方法签名、已知约束、禁止事项时，产出质量直接塌方。

#### 根因 2：跨模块/跨进程契约缺乏端到端验证

| 案例 | Phase 发现 | 根因 |
|------|-----------|------|
| RPC response 格式断裂（裸 vs 包裹） | Phase 3 Integration Review | 两个 subagent 各自假设消息格式 |
| `bridge:tool_execute` 参数字段名错误 | Phase 3 BLR Review | `params` vs `parameters` |
| `togglePlugin` 激活全部插件 | Phase 3 BLR Review | `handleEvent()` vs `activatePlugin()` 语义 |
| `handleBridgeIntercept` 丢弃 blocked 结果 | Phase 3 Review | 调用方没检查返回值 |
| 跨进程消息格式不一致 | Phase 3 CRITICAL | 单元测试 mock 无法捕获跨进程问题 |

**根因**：每个 Phase 只验证接口签名，不验证数据从生产到消费的完整路径。

#### 根因 3：并行 Task 的隐式依赖被忽略

| 案例 | 后果 |
|------|------|
| pg-migrate Task 5/6 并行，Task 5 引用 Task 6 未完成函数 | placeholder 占位，多进程功能"假装通过"，部署后完全不工作 |
| plugin-remaining-phases Wave 1 并行冲突 | 3 轮 plan review |

---

## 三、跨 Topic 共性问题统计

| 共性问题 | 出现的 Topic 数 | 占比 |
|---------|----------------|------|
| Subagent task prompt 信息不足 | 8/15 | 53% |
| Spec 阶段未验证代码假设 | 6/15 | 40% |
| 跨模块契约端到端验证缺失 | 5/15 | 33% |
| Review YAML 格式反复踩坑 | 5/15 | 33% |
| Plan 边界条件描述不足 | 5/15 | 33% |
| CI 问题 dev phase 没发现 | 4/15 | 27% |
| 并行 Task 隐式依赖 | 3/15 | 20% |

---

## 四、改进建议（按优先级）

### P0：投入产出比最高

#### 1. Spec 阶段增加"代码事实验证"步骤

**位置**：brainstorming skill（Phase 1），在 Step 5 写 spec 之前

**具体做法**：
- Spec 中引用的每个接口/RPC，用 `grep` + `read` 验证是否真实存在
- 读取相关类型定义文件，确认数据结构假设
- 对前端功能，运行现有页面截图确认当前 UI 布局和组件分工
- 对枚举值/常量，从代码提取实际值而非凭记忆编写

**预期效果**：消除"假设接口存在"和"类型定义错误"两类问题，覆盖 ~40% 的 spec 返工。

#### 2. Subagent task prompt 强制模板

**位置**：subagent-driven-development skill

**模板必填项**：
1. **完整方法签名** — 从代码 `grep` 提取，不是从文档推断
2. **实际枚举值/import 路径** — 禁止凭记忆编写
3. **已知约束** — null guard 策略、错误处理方式、并发模型
4. **禁止事项** — 禁止 unsafe cast、禁止擅自变更签名、禁止留 TODO/no-op/placeholder
5. **必须产出的文件列表** — subagent 完成后自动校验

**预期效果**：消除方法语义错误、placeholder、no-op 三类问题，覆盖 ~50% 的 dev 返工。

### P1：针对特定场景

#### 3. UI 原型确认环节

**位置**：brainstorming skill（Phase 1），涉及前端 UI 变更的 FR

**具体做法**：
- 对每个涉及 UI 的 FR，生成 HTML wireframe（可以是简单 HTML+CSS）
- 截图给用户确认布局、组件位置、信息展示方式
- 用户确认后才写进 spec

**预期效果**：消除 UI 布局/职责偏差问题。statusline-design 的 branch 3 次移位可以减为 1 次。

#### 4. 并行 Task 依赖检查

**位置**：writing-plans skill（Phase 2），Task 拆分步骤

**具体做法**：
- Plan 阶段标注 task 间的接口依赖关系
- 有接口依赖（一个 task 引用另一个 task 产出的函数/类型）的 task 禁止并行
- 在 plan review 中增加"并行安全性"检查项

**预期效果**：消除 placeholder 骗过测试这类最危险的 bug。

#### 5. 端到端数据流验证

**位置**：phase-dev skill（Phase 3），自检清单

**具体做法**：
- 每个 Phase 自检增加"生产者→通道→消费者"完整路径追踪
- 跨进程/跨模块消息格式，用实际端到端脚本验证（而非 mock 单元测试）

**预期效果**：消除 RPC 格式断裂等跨模块问题。

### P2：流程效率

#### 6. L1 小改动轻量流程

- 合并 Phase 3+4（TDD 模式下 Phase 4 纯重复）
- 精简 Phase 2 交付物（e2e-test-plan + use-cases + non-functional-design 合并进 plan.md）
- 5 步审查设改动规模门槛（> 50 行 / > 3 文件才走完整流程）

#### 7. Compact 失败降级策略

- Compact 连续 3 次失败时，允许跳过 compact 直接推进
- 或自动 handoff 到新 session 继续

#### 8. 跨文档一致性自动化

- interface_chain.json 在 dev subagent 的 task prompt 中自动注入相关条目
- 或废弃它，改为在 plan.md 中集中定义接口

#### 9. Review scope 限定

- Review subagent 的 task prompt 注入 `git diff --name-only` 输出
- 约束审查范围为本次变更，避免已有代码被误标 MUST FIX

#### 10. Dev phase 结束强制 CI 预检

- `npm run lint` + `npx tsc --noEmit` + `npx vitest run`（全量）
- 在 dev gate 之前执行，避免 PR phase 才发现 CI 问题

---

## 五、数据来源：关联复盘文件路径

### llm-simple-router（feat-frontend-design worktree）

```
.xyz-harness/2026-05-29-patch-orphan-supplement-strategy/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-28-fix-modality-overflow-failover-filtering/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-29-provider-multi-api-type/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-28-thinking-level-display/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-29-adaptive-concurrency-v3-fix/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md
```

### xyz-agent（feat-statusline worktree）

```
.xyz-harness/2026-05-27-bundle-pi-extensions/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-27-clarify-plugin-phase1/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-28-plugin-system-phase2/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-28-plugin-system-frontend-dx/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-29-plugin-arch-remaining-and-ci-fix/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-30-statusline-design/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

.xyz-harness/2026-05-30-provider-thinking-level-preset/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md
```

### xyz-agent（main worktree，额外 topic）

```
main/.xyz-harness/2026-05-29-plugin-remaining-phases/changes/reviews/
  overall_retrospect.md
```

### dag-executor（main worktree）

```
main/.xyz-harness/2026-05-30-pg-migrate-nuc5-multi-core-worker/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md
```

### xyz-pi-extensions（main worktree）

```
main/.xyz-harness/2026-05-28-infinite-context-engine/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

main/.xyz-harness/2026-05-28-evolve-summarizer-pipeline/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

main/.xyz-harness/2026-05-29-evolve-daily-report/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

main/.xyz-harness/2026-05-29-bash-async-background-extension/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

main/.xyz-harness/2026-05-29-evolve-command-sendusermessage/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

main/.xyz-harness/2026-05-30-fix-dual-compact-trigger/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md

main/.xyz-harness/2026-05-30-progressive-tree-compaction/changes/reviews/
  spec_retrospect.md
  dev_retrospect.md
  overall_retrospect.md
```

### xyz-pi-extensions（fix-evolve-problem worktree）

```
fix-evolve-problem/.xyz-harness/2026-05-30-evolve-skill-architecture-redesign/changes/reviews/
  spec_retrospect.md
  plan_retrospect.md
```
