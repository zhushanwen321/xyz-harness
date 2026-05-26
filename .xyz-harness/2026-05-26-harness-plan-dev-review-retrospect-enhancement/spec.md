---
verdict: pass
---

# Harness Plan/Dev/Review/Retrospect Enhancement

## Background

xyz-harness V5 当前有三个结构性缺陷：

1. **Plan 阶段缺少业务用例的结构化描述和验证**：plan.md 包含任务分解、接口契约、执行组等，但没有独立的业务用例文档（描述"谁在什么场景下做什么"）。plan_review 的 spec-plan 一致性检查是 AC-by-AC 的覆盖度检查，无法验证"plan 的设计是否支撑每个业务故事的完整路径"。
2. **Dev 阶段审查维度单一**：Phase 3 只有一个 `code_review_v*.md`（由 expert-reviewer 编码评审模式产出），覆盖 spec 合规、代码质量、架构合规、安全性能、集成验证等所有维度。审查者上下文过载，且无法对不同维度采用不同的模型和深度。
3. **Retrospect 缺少吸收追踪**：复盘文件记录了 Phase 执行质量和 Harness 体验问题，但没有结构化的元数据来追踪哪些改进建议已被吸收到 harness 项目中，哪些待处理。复盘的价值无法沉淀。

本次增强将这三块联动改造。

## Functional Requirements

### FR-1: Plan 阶段新增 use-cases.md

Phase 2 产出独立的业务用例文档 `use-cases.md`，从 spec 中提取并细化业务场景。

**格式要求：**
- 每个用例包含：编号（UC-N）、名称、Actor、前置条件、主流程（步骤列表）、异常路径、后置条件、涉及的模块边界
- L1 和 L2 均必须产出
- YAML frontmatter: `verdict: pass`

**上游来源：** spec.md 中应有"业务用例"章节（初版简述，见 FR-9），Phase 2 在此基础上细化。

**下游消费：**
- Plan L2 business logic review（FR-3 plan 模式）读取 use-cases.md 验证设计覆盖
- Dev Phase 3 的 5 步审查中的 business_logic_review 读取 use-cases.md 推演代码执行

### FR-2: Plan 阶段新增 non-functional-design.md

Phase 2 产出独立的非功能性设计文档。

**覆盖维度：**
- 稳定性（容错、降级、重试）
- 数据一致性（事务、幂等、并发控制）
- 性能（关键路径延迟、吞吐量、缓存策略）
- 业务安全（权限、审计、防滥用）
- 数据安全（敏感数据脱敏、传输加密、存储加密）

**格式要求：**
- L1 和 L2 均必须产出（L1 可简版，每个维度 1-3 句）
- YAML frontmatter: `verdict: pass`

### FR-3: Business Logic Reviewer Skill（双模式）

新建 `xyz-harness-business-logic-reviewer` Reference Skill，支持两种模式：

**Plan 模式（仅 L2）：**
- 输入：use-cases.md + plan.md + interface_chain.json + plan 子文档
- 审查方法：对每个业务用例，追踪 plan 的任务链、接口契约、数据流，验证设计方案是否完整支撑业务故事
- 产出：`plan_bl_review_v1.md`（YAML: `verdict`, `must_fix`）
- 触发时机：Phase 2 plan_review 之后（或与 plan_review 并行），仅在 L2 plan 时强制

**Dev 模式（L1 + L2）：**
- 输入：use-cases.md + 实际代码（git diff）
- 审查方法：对每个业务用例，构造模拟业务数据，推演代码执行路径，记录经过的文件/类/方法/预测结果
- 产出：`business_logic_review_v1.md`（YAML: `verdict`, `must_fix`）
- 触发时机：Phase 3 Dev 审查步骤的第一步

**两种模式的差异：**

| 维度 | Plan 模式 | Dev 模式 |
|------|----------|----------|
| 验证对象 | plan 设计方案 | 实际代码 |
| 方法 | 追踪任务链和接口契约 | 构造模拟数据推演代码执行 |
| 捕获问题 | 设计漏洞（缺少接口/字段/流程） | 实现错误（逻辑 bug/数据转换错误） |
| L1/L2 | L2 only | L1 + L2 |

### FR-4: Integration Reviewer Skill

新建 `xyz-harness-integration-reviewer` Reference Skill。

- 输入：business_logic_review 的产出（模拟数据和执行路径）+ 代码
- 审查重点：以分开的模块、前后端上下游的衔接为审查重点，检查模拟的业务代码执行过程在模块边界处是否存在问题
- 产出：`integration_review_v1.md`（YAML: `verdict`, `must_fix`）
- 依赖：需在 business_logic_review 完成后执行（消费其产出的模拟数据路径）

### FR-5: Standards Reviewer Skill

新建 `xyz-harness-standards-reviewer` Reference Skill。

- 输入：git diff + CLAUDE.md + 项目 lint/typecheck 配置
- 审查内容：
  1. 运行项目 lint 和 typecheck，记录结果
  2. AI 对比 CLAUDE.md 中声明的编码规范，检查代码变更是否符合
- 产出：`standards_review_v1.md`（YAML: `verdict`, `must_fix`, `linter_passed` (bool), `typecheck_passed` (bool, optional)）
- 可与其他审查并行执行

### FR-6: Robustness Reviewer Skill

新建 `xyz-harness-robustness-reviewer` Reference Skill。

- 输入：代码文件
- 审查维度：
  1. 错误处理：该 catch 的 catch，该降级的降级
  2. 异常处理：异常是否妥当，是否有静默吞掉异常的情况
  3. 日志：关键路径是否有日志，日志级别是否合理
  4. Fail-fast：该立即失败的路径是否立即失败
  5. 测试友好性：代码是否便于测试（依赖注入、mock 友好）
  6. 用户/调试友好性：错误信息是否有意义，是否方便用户上报问题
- 产出：`robustness_review_v1.md`（YAML: `verdict`, `must_fix`）

### FR-7: Retrospect YAML 元数据增强

更新 `harness-retrospect` skill 的输出格式，增加吸收追踪字段。

**新增 YAML 字段：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `absorbed` | boolean | 是 | false | 是否已被 harness 项目吸收优化 |
| `absorbed_date` | string | 否 | null | 吸收日期（ISO 8601），如 `"2026-05-26"` |
| `absorption_summary` | string | 否 | null | 一句话描述做了什么优化 |
| `topic` | string | 是 | — | 所属 topic 目录名（如 `"2026-05-17-system-setting"`） |
| `harness_issues` | array of string | 否 | [] | 从复盘中提取的具体 harness 改进建议 |

**完整示例：**
```yaml
---
phase: dev
verdict: pass
absorbed: false
topic: "2026-05-17-system-setting"
harness_issues:
  - "Phase 3 review 5步并行导致 subagent semaphore 排队超过2分钟"
  - "gate-check.py 未检查 plan-frontend.md 子文档的存在性"
---
```

**吸收工作流：**
1. retrospect subagent 写文件 → `absorbed: false`（默认）
2. 定期运行 collector 脚本 → 列出未吸收的复盘
3. 人工审查，做 harness 改进
4. 通过 collector 脚本标记 → `absorbed: true, absorbed_date: ..., absorption_summary: ...`
5. 下次扫描自动排除

### FR-8: Retrospect Collector Skill + Script

新建项目级 skill `harness-retrospect-collector`，含 Python 扫描脚本。

**脚本功能：**
```bash
# 列出所有未吸收的复盘（默认）
python3 skills/harness-retrospect-collector/scripts/collect.py

# 列出全部（含已吸收）
python3 .../collect.py --all

# 标记为已吸收
python3 .../collect.py --absorb <file> --summary "优化描述"

# 批量标记
python3 .../collect.py --absorb <file1> <file2> --summary "批量优化"

# 聚合 harness_issues（提取+去重+频率排序）
python3 .../collect.py --aggregate

# JSON 输出
python3 .../collect.py --json

# 指定扫描根目录
python3 .../collect.py --root /path/to/.xyz-harness
```

**默认输出格式：**
```
Retrospect Collector
Scanned: .xyz-harness/
Total: 15 | Absorbed: 8 | Needing absorption: 7

NEEDS ABSORPTION:
[1] 2026-05-17-system-setting / Phase 3 (dev)
    harness_issues:
      - Phase 3 review 5步并行导致 subagent semaphore 排队
      - gate-check.py 未检查 plan-frontend.md
...
```

**聚合输出格式（`--aggregate`）：**
```
Aggregated Harness Issues (from 7 unabsorbed)
[3x] Phase 3 review subagent 等待时间过长
[2x] gate-check.py 新增 deliverable 后需手动更新
...
```

**Skill 位置：** `skills/harness-retrospect-collector/`（项目级），通过 symlink 链接到 `.pi/skills/`。

### FR-9: Phase 1 Spec 增加业务用例章节

在 spec.md 的六要素中增加第七要素"业务用例"。

**要求：**
- Phase 1 brainstorming 产出 spec.md 时，必须包含"业务用例"章节
- 初版简述：每个用例包含 Actor、场景描述、预期结果（不需要细化到前置/后置条件，那是 Phase 2 的工作）
- 产出可为空：纯技术性需求（如"升级依赖版本"）无业务用例时，标注"无业务用例"即可

### FR-10: Phase 3 Dev 审查编排重构

Phase 3 的 Code Review 步骤（Step 4）从单步 `code_review` 改为 5 步专项审查。

**审查步骤和编排：**

```
Batch 1（并行）:
  Step 1: business_logic_review (subagent, read business-logic-reviewer skill)
  Step 2: taste_review (subagent, read ts-taste-check / rust-taste-check skill)
  Step 3: robustness_review (subagent, read robustness-reviewer skill)
  Step 4: standards_review (subagent, read standards-reviewer skill)

Batch 2（依赖 Step 1 的产出）:
  Step 5: integration_review (subagent, read integration-reviewer skill)
```

**每步产出独立的 review 文件：**
- `business_logic_review_v1.md`
- `taste_review_v1.md`
- `robustness_review_v1.md`
- `standards_review_v1.md`
- `integration_review_v1.md`

**每个 review 独立判定** verdict + must_fix。任何一步 must_fix > 0 则该步需修复后重新审查（最多 2 轮）。

**完全替代现有的 code_review：** 现有 `code_review_v*.md` 被 5 个专项 review 替代。expert-reviewer 的编码评审模式（模式二）不再在 Phase 3 dispatch。

**品味审查复用现有 skill：** taste_review 步骤 dispatch subagent 时，根据项目技术栈指定 read 对应的品味检查 skill（ts-taste-check / rust-taste-check）。

**Python 项目 fallback：** Python 项目暂无独立品味检查 skill，taste_review subagent 的 task prompt 中注入通用代码品味检查清单（从 `~/Code/coding_config/.codetaste/essence.md` 读取核心原则），不依赖语言特定 skill。如果 essence.md 不存在，跳过品味审查并在 standards_review 中标注。

### FR-12: Review 文件 review_metrics 字段

所有 Phase 3 的 review 文件 YAML frontmatter 新增可选的 `review_metrics` 字段，用于记录审查价值数据：

```yaml
review_metrics:
  files_reviewed: 12
  issues_found: 3
  must_fix_count: 1
  low_count: 1
  info_count: 1
  duration_estimate: "5"
```

retrospect subagent 读取所有 review 文件的 review_metrics，在 dev_retrospect 中汇总为价值评估报告。

### FR-13: Gate-check.py 更新

**Phase 2 新增 deliverables：**
- `use-cases.md`（verdict: pass）— L1 + L2 均必须
- `non-functional-design.md`（verdict: pass）— L1 + L2 均必须

**Phase 2 新增 reviews（仅 L2）：**
- `plan_bl_review_v*.md`（verdict: pass, must_fix: 0）

L2 条件判断：读取 plan.md 的 YAML frontmatter 中 `complexity` 字段，值为 `"L2"` 时检查 plan_bl_review。

**Phase 3 reviews 替换：**
- 移除：`code_review_v*.md`
- 新增：
  - `business_logic_review_v*.md`（verdict: pass, must_fix: 0）
  - `integration_review_v*.md`（verdict: pass, must_fix: 0）
  - `standards_review_v*.md`（verdict: pass, must_fix: 0, linter_passed: true）
  - `taste_review_v*.md`（verdict: pass, must_fix: 0）
  - `robustness_review_v*.md`（verdict: pass, must_fix: 0）

## Acceptance Criteria

### AC-1: use-cases.md 格式和内容
- use-cases.md 存在且 YAML frontmatter 含 `verdict: pass`
- 每个用例有编号（UC-N）、Actor、前置条件、主流程、异常路径、后置条件
- 所有 spec AC 都能在 use-cases.md 中找到覆盖或显式标注为 [OUT-OF-SCOPE]

### AC-2: non-functional-design.md 覆盖五维度
- 文档覆盖稳定性、数据一致性、性能、业务安全、数据安全五个维度
- L1 plan 每维度至少 1 句描述；L2 plan 每维度有具体设计细节

### AC-3: Business Logic Reviewer 双模式可 dispatch
- Plan 模式：对 L2 plan，能读取 use-cases.md + plan.md + interface_chain.json，产出 plan_bl_review_v1.md
- Dev 模式：对 L1/L2，能读取 use-cases.md + git diff，构造模拟数据，产出 business_logic_review_v1.md 含执行路径记录

### AC-4: Integration Reviewer 可消费上游产出
- integration_review subagent 能读取 business_logic_review 的模拟数据路径
- 产出 integration_review_v1.md 聚焦模块衔接问题

### AC-5: Standards Reviewer 运行 lint + 规范对比
- standards_review_v1.md YAML 含 `linter_passed: true`（布尔值）
- 当项目有 typecheck 配置时，YAML 含 `typecheck_passed: true`
- 当项目无 lint 或 typecheck 配置时（纯文档仓库、配置仓库），`linter_passed` 字段可省略，gate 不检查。审查报告中需明确标注"项目未配置 lint，跳过自动检查"
- 审查报告包含 lint 输出和 CLAUDE.md 规范对比结果

### AC-6: Robustness Reviewer 覆盖六维度
- robustness_review_v1.md 覆盖错误处理、异常处理、日志、fail-fast、测试友好性、调试友好性

### AC-7: Retrospect YAML 含吸收元数据
- 所有新建的 retrospect 文件 YAML 含 `absorbed: false`, `topic: "{topic_dir_name}"`
- harness_issues 数组中的每项是一句具体的改进建议（不含模糊描述）

### AC-8: Retrospect Collector 脚本可用
- `collect.py` 默认输出未吸收的复盘列表
- `--absorb` 命令能更新 YAML frontmatter 的 absorbed/absorbed_date/absorption_summary 字段
- `--aggregate` 输出去重后的 harness_issues 并按频率排序
- 脚本对缺少 absorbed 字段的旧版 retrospect 文件视为"未吸收"（向后兼容）

### AC-9: Phase 1 spec 含业务用例章节
- spec.md 包含"业务用例"章节
- 每个用例有 Actor、场景描述、预期结果
- 纯技术需求标注"无业务用例"也可接受

### AC-10: Phase 3 五步审查可执行
- 5 个 subagent 可按 Batch 1（4 并行）→ Batch 2（1 串行）编排 dispatch
- 每步产出独立 review 文件，YAML 含 verdict + must_fix
- 任何一步 must_fix > 0 触发修复→重审循环（最多 2 轮）

### AC-11: Gate-check.py 通过新规则
- Phase 2 gate 检查 use-cases.md 和 non-functional-design.md 存在且 verdict: pass
- Phase 2 L2 gate 额外检查 plan_bl_review 存在且 verdict: pass, must_fix: 0
- Phase 3 gate 检查 5 个 review 文件全部存在且 verdict: pass, must_fix: 0
- Phase 3 gate 检查 standards_review 的 linter_passed: true
- 旧 topic 目录不受新规则影响（ADR-0006）

### AC-12: Retrospect 记录审查价值
- Phase 3 的 dev_retrospect 中必须记录每个审查步骤的价值评估：
  - business_logic_review: 发现了多少问题（must_fix/LOW/INFO），耗时
  - integration_review: 同上
  - standards_review: 同上
  - taste_review: 同上
  - robustness_review: 同上
- 价值评估数据为后续简化审查步骤提供依据
- 数据来源：每个 review 文件的 YAML frontmatter 中新增 `review_metrics` 字段（见 FR-12）
- 价值评估格式：harness_issues 数组中按 `"review-value: {step_name} found {N} issues in {M}min"` 模式记录

## Constraints

### 技术约束
- 所有新 skill 必须同时支持 Claude Code 和 Pi（双工具兼容）
- Retrospect collector 脚本用 Python 3 标准库（仅依赖 PyYAML）
- Gate-check.py 改动必须保持对旧 topic 的兼容（通过 phase spec 的可选字段实现）
- 不修改 coding-workflow 扩展的核心逻辑（index.ts），只更新 gate-check.py

### 设计约束
- 5 步审查保持独立 subagent（不做合并），后续通过 retrospect 数据决策是否简化
- L2 plan 的 business logic review 是可选的（L1 不强制），与 interface_chain.json 的 L2-only 策略一致
- 品味审查复用现有 ts-taste-check / rust-taste-check skill，不新建品味 skill

### 范围约束
- 不包含 py-taste-check 新建（P2）
- 不包含 gate-check.py 配置外部化（P2）
- 不包含 Phase 5 CI 结果结构化（P2）
- 不包含 coding-workflow 扩展的 index.ts 改动（超出当前 skill 层面）
- 不包含 review 文件子目录分组（P2）

## Complexity Assessment

**L2（复杂）**：跨多个 skill 的联动改造（Phase 1/2/3 skill + 4 个新建 reviewer skill + retrospect skill + collector skill + gate-check.py），涉及 deliverable 格式变更、审查流程重组、脚本逻辑更新。多个 skill 之间存在依赖关系（use-cases.md 的格式影响 plan_bl_review 和 bl_review 的解析）。

## Non-functional Considerations

- **向后兼容：** 旧 topic 的 retrospect 文件缺少 `absorbed` 字段时，collector 脚本视为"未吸收"而非报错。旧 topic 的 gate-check 不受新规则影响。
- **Subagent 调度压力：** Phase 3 从 1 个 review subagent 增加到 5 个（Batch 1 是 4 并行），需要考虑 semaphore 限制（最多 5 并发）。Batch 1 的 4 并行在限制内。
- **Retrospect 文件大小：** 新增 harness_issues 数组不显著增加文件大小。每个 issue 是一句短文本，典型 3-5 个 issues。
