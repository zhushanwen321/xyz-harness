# 将 grill-with-docs 实践集成为 Phase 1/2 Skill 内的 Step，而非独立 Phase

术语精确化（CONTEXT.md 产出 + 术语识别）和决策记录（ADR）对复杂需求有明确价值，但自评估复盘显示 harness 的核心问题是流程摩擦而非功能缺失（"编码只占 18% 时间"）。独立 Phase 意味着多一轮 gate/review/retrospect/compact，加剧摩擦。因此将 grill-with-docs 的三个核心实践拆为 MUST + Nullable 的 Step，嵌入现有 Phase 1（brainstorming）和 Phase 2（writing-plans）的 Skill 中：术语识别（Phase 1 Step 2 中）、CONTEXT.md 产出（Phase 1 Step 5 后）、ADR 评估（Phase 1/2 各一次）。Step 必须执行但产出可为空，简单需求不增加交付物负担。
