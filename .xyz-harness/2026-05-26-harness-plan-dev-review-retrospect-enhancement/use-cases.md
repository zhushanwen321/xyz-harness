---
verdict: pass
---

# Business Use Cases

### UC-1: AI 按 Plan 分步执行并通过 5 步审查

- **Actor**: AI executor（主 agent 或 subagent）
- **Preconditions**: spec.md 已通过 gate，plan.md 已产出，use-cases.md 已产出
- **Main Flow**:
  1. AI 进入 Phase 3 (dev)，按 plan.md 的 Execution Group 逐组执行
  2. 每个 Group 完成 TDD 编码后，触发 Step 4 五步审查
  3. Batch 1: 4 个 subagent 并行执行 BLR/taste/robustness/standards review
  4. Batch 2: 1 个 subagent 执行 integration review（消费 BLR 产出）
  5. 所有 review verdict=pass 且 must_fix=0 → 审查通过
- **Alternative/Exception Paths**:
  - 某步 review must_fix>0 → 修复代码后重新 dispatch 该步 review（最多 2 轮）
  - Python 项目无 taste skill → 从 essence.md 读取通用品味原则
  - 项目无 lint 配置 → standards_review 跳过 Phase A，仅执行 Phase B
- **Postconditions**: 5 个 review 文件全部存在且 verdict=pass，代码变更已提交
- **Module Boundaries**: phase-dev skill → 4 个 reviewer skill → gate-check.py

### UC-2: L2 Plan 通过 Business Logic Review

- **Actor**: Plan review subagent
- **Preconditions**: plan.md complexity=L2，use-cases.md 和 interface_chain.json 已产出
- **Main Flow**:
  1. 主 agent dispatch plan_bl_review subagent
  2. Subagent 读取 use-cases.md + plan.md + interface_chain.json
  3. 逐个 UC 追踪 plan 的 task chain 和 interface contracts
  4. 验证每个 UC 的主流程和异常路径在 plan 中有覆盖
  5. 产出 plan_bl_review_v1.md
- **Alternative/Exception Paths**:
  - UC 的异常路径未在 plan 中覆盖 → MUST_FIX
  - interface_chain.json 缺少 UC 涉及的方法 → LOW
- **Postconditions**: plan_bl_review_v1.md 存在，verdict=pass，must_fix=0
- **Module Boundaries**: business-logic-reviewer skill → plan.md → interface_chain.json

### UC-3: 运行 Retrospect Collector 发现未吸收改进建议

- **Actor**: 项目维护者（人工）
- **Preconditions**: 多个 topic 的 retrospect 文件存在于 `.xyz-harness/` 下
- **Main Flow**:
  1. 运行 `collect.py --root .xyz-harness/`
  2. 脚本递归扫描所有 `*retrospect*.md` 文件
  3. 解析 YAML frontmatter，提取 absorbed/harness_issues
  4. 输出未吸收的复盘列表（含 harness_issues）
  5. 运行 `collect.py --aggregate` 查看频率排序的改进建议
- **Alternative/Exception Paths**:
  - 旧版 retrospect 无 absorbed 字段 → 视为 false（未吸收）
  - harness_issues 为空 → 列表中该条目无 issues 显示
- **Postconditions**: 维护者获得未吸收复盘的完整列表和聚合建议
- **Module Boundaries**: collect.py → `.xyz-harness/` 目录 → retrospect YAML frontmatter

### UC-4: 标记 Retrospect 为已吸收

- **Actor**: 项目维护者（人工）
- **Preconditions**: 已识别需要吸收的 retrospect 文件
- **Main Flow**:
  1. 维护者完成 harness 改进
  2. 运行 `collect.py --absorb <file> --summary "描述改进内容"`
  3. 脚本更新文件 YAML: absorbed=true, absorbed_date=今天, absorption_summary=描述
  4. 下次扫描该文件不再出现
- **Alternative/Exception Paths**:
  - 文件路径错误 → 脚本报错退出
  - YAML frontmatter 格式损坏 → 脚本报错并提示
- **Postconditions**: retrospect 文件 YAML 已更新，下次扫描自动排除
- **Module Boundaries**: collect.py → retrospect 文件 YAML frontmatter

### UC-5: Gate Check 验证新规则通过

- **Actor**: gate-check.py（自动化）
- **Preconditions**: Phase 2 或 Phase 3 交付物已产出
- **Main Flow**:
  1. 运行 `gate-check.py <topic_dir> 2`
  2. Phase 2: 检查 use-cases.md + non-functional-design.md + plan_review
  3. 如果 plan.md complexity=L2: 额外检查 plan_bl_review
  4. 所有检查通过 → gate PASS
- **Alternative/Exception Paths**:
  - L1 plan → 跳过 plan_bl_review 检查
  - 旧 topic（gate-check.py 无新规则前的）→ 不受影响（ADR-0006）
- **Postconditions**: Phase 2 gate 通过，AI 可进入 Phase 3
- **Module Boundaries**: gate-check.py → plan.md YAML → review 文件
