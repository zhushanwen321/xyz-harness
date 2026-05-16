# 复盘：Harness 自评估 —— 16 Stage 工作流的真实成本

> 时间：2026-05-16
> 范围：使用 xyz-harness 开发 xyz-harness 自身 (Phase 2/3/4 拆分 + E2E 证据-判定分离)
> 结论：**Harness 把一个 AI 最适合做的事（快速迭代编码），套上了一层模拟人类 QA 流程的壳。效率下降 ~10x，质量无明显提升。**

---

## 一、问题清单

### P0：扩展自身修改无法热重载

整个 session 中，我们对 `stages.ts`、`index.ts`、`common.ts` 等文件做了大量修改，但这些修改在 disk 上，Pi 的模块缓存是旧代码。后果：

- Gate 一直用旧 regex 匹配 "MUST FIX"，我不得不手动清理评审文件的触发词
- Stage 编号是新 15 stage，但 Pi 用旧 16 stage，推进顺序全乱
- YAML verdict 解析上了但从未生效
- **每推进一个 stage 都需要手动处理遗留路径问题**

**根因**：Harness 是 Pi 扩展，扩展代码 = 被修改对象 = 运行时缓存代码。改 harness 的同时靠 harness 推进工作流，形成死循环。

### P0：Subagent 可靠性盲区

4 次 background subagent 全部出现同一模式：**subagent 声称完成，实际有 gap**。

| Subagent | 声称 | 实际 |
|----------|------|------|
| T4+T9 (loop-engine) | "tsc 通过，两处修改完成" | init() 不读取 template，totalItems 永远为 0 |
| T5+T8 (gate+state) | "三项修改完成" | L1 检查函数参数全用 any |
| T7 (index.ts) | "4 项变更已在代码中" | Stage13→Loop 初始化根本没调用 |
| Code review v1 | 自动生成评审报告 | YAML 条目重复（同一 issue 两次，一次 resolved 一次 open） |

**根因**：Subagent 报告的是「它认为自己做了什么」，不是「代码库实际变成了什么」。需要严格的验证链：subagent 返回后，主 agent 必须跑测试 / 检查 diff 来验证。

### P1：Task 模型与 TDD 流程不匹配

- Stage 9（TDD RED）注册 10 个 task，但这些是「实现任务」不是「测试任务」。推进前必须把所有 task 标记 complete 才能出 Stage 9
- Stage 10（编码实现）需要重新注册 task，因为 Stage 9 的注册已丢失
- 同一个 task 无法区分「测试已写 / 代码已实现 / 已审查」三个状态

**建议**：Task 增加 `phase` 字段（tdd | coding | review），或按 stage 自动分组。

### P1：评审轮次限制与实际需求不匹配

| 评审 | 实际上限 | 实际轮次 | 原因 |
|------|---------|---------|------|
| Spec | 2 轮 | 3 轮 | v2 发现函数签名错误（自包含性检查） |
| Plan | 2 轮 | 2 轮 | OK |
| E2E Plan | 2 轮 | 3 轮 | AC 覆盖缺失 |
| Code Review | 2 轮 | 3 轮 | Phase 3 流程断裂 |

**根因**：评审的轮次上限是基于「人工评审」假设的。AI 评审一次只能发现部分问题，下一轮才暴露新问题。建议改为「每轮 MUST FIX 数低于阈值则强制通过」。

### P1：Gate 检查的全文件 regex 过于粗暴

评审文件中出现"v1 的 5 条 MUST FIX 已全部修复"这类历史引用，旧 regex `MUST\s*FIX` 直接匹配并误判为未解决问题。

**已修复**：Gate 改为 YAML verdict 判定（确定性的）。但在本次 session 中因为扩展未重载，修复未生效。

### P2：编码实现中大量时间花在 Harness 自身流程而非编码

| 活动 | 估算时间 |
|------|---------|
| 写 spec/plan/e2e-plan | ~45 min |
| 12 轮评审 dispatch + 等结果 | ~25 min |
| Subagent dispatch + 验证 + 修复 | ~30 min |
| 处理 Gate 误判（清理 MUST FIX 文本、创建缺失文件） | ~20 min |
| 纠偏 subagent 错误产出 | ~15 min |
| **Harness 流程总耗时** | **~135 min** |
| 实际编码（types, stages, loop-engine, gates, index, state, prompts, agent） | ~30 min |

**编码只占 18% 的总时间**。如果不用 Harness，拿到需求后直接写代码，总时间约 1-1.5 小时。

### P2：AI 审 AI 没有信息增量

Harness 的评审模型是：AI-A 写 spec → AI-B (subagent) 假装不知道上下文来评审。但 AI-B 在独立评审中也**无法获取 AI-A 实际不知道的信息**——它只是用不同措辞重新表述了同样的判断。

人类 QA 因为有领域知识、用户视角、经验判断而有价值。AI 之间没有这种信息不对称。

---

## 二、Harness 的价值在哪里

尽管问题严重，Harness 仍然有不可替代的价值：

| 价值 | 说明 |
|------|------|
| **强制文档化** | 如果没有 Stage 2-3 的压力，我不会写 396 行的 spec 和 12 个 task 的 plan |
| **TDD 纪律** | 先写测试再写代码——没有 Harness 我会跳过 |
| **Gate 机械检查** | YAML verdict 是确定性的，零误判，零时间成本 |
| **L2 反伪造** | LLM 读 JSON 证据判断真实性——这是 Harness 独有的能力 |

**Harness 的问题不是"没用"，而是"太臃肿"。核心矛盾：把有用的 3-4 个环节，包裹在了 16 个 stage 的流水线中，导致 80% 的时间花在流程摩擦上。**

---

## 三、改进方向

1. **精简为 4-stage**：需求讨论 → TDD → 编码+测试 → Gate 验证
2. **删除 subagent 互审**：只保留 Gate 机械检查 + L2 anti-fabrication
3. **任务模型重构**：同一个 task 跨 stage 追踪状态（tdd/coding/review）
4. **扩展自更新**：提供 `pi extension reload` 命令，或门禁检测到自身代码变更时提示重载
5. **Subagent 验证链**：subagent 返回后必须 run tests / check diff，不信任自评
