# 专用 Review Agent 模式：多维代码审查场景使用独立 agent

## 状态

已接受

## 上下文

ADR-0004 决定所有 subagent 统一使用 `general-purpose` + task prompt 注入方法论。当时理由是 harness 只有 2 种 subagent（review + retrospect），不值得独立维护。

现在 `code-review-worktree` 有 7 种 subagent prompt（BLR、Standards、Taste、Robustness、Integration、Architecture、Data-Flow），每个 prompt 30-40 行，总计 300+ 行模板内联在 SKILL.md 中，导致文件 622 行（超标 3x）。

主 agent 分派流程是：
1. 读取 SKILL.md（622 行，含全部 prompt 模板）
2. 手动选择对应模板
3. 替换模板变量（{files}, {cwd}, {output_path}）
4. 构造完整 task prompt 给 general-purpose

这个流程的上下文开销大，且 prompt 模板和编排逻辑混在一起，难以维护。

## 决策

**当 subagent 满足以下条件时，使用独立 agent 而非 general-purpose + task prompt：**

1. **模板数量 ≥ 3**：需要 3 种以上不同的 subagent prompt
2. **模板可参数化**：prompt 结构相似，通过维度名 + 文件列表 + 输出路径区分
3. **主 agent 不需要理解 prompt 细节**：编排逻辑只需知道"分派哪个 agent"

不满足以上条件时（subagent 数量少、prompt 简短、主 agent 需要动态构造 prompt），继续使用 general-purpose + task prompt。

## 理由

### 上下文效率

| 方案 | 主 agent 加载 | 分派时上下文 |
|------|-------------|------------|
| general-purpose + task prompt | 622 行 SKILL.md（含全部模板） | 主 agent 读模板 → 拼装 → 传给 subagent |
| 独立 agent | ~120 行 SKILL.md（纯编排逻辑） | `agent: "review-blr", task: "files=..., output=..."` |

独立 agent 方案：主 agent 不需要读 prompt 模板，直接按名称分派。SKILL.md 从 622 行降到 ~120 行，主 agent 上下文节省 ~500 行。

### 关注点分离

- **SKILL.md**：编排逻辑（策略矩阵、分派规则、汇总格式）
- **agent.md × 7**：每个维度的审查方法论和输出格式

每个 agent.md 独立维护，修改一个维度不影响其他维度。

### 复用性

独立 agent 可被多个入口复用：
- `code-review-worktree` skill → 分派 review agent
- `coding-workflow` 的 Phase 3 → 分派同一个 review agent
- 用户手动 `/agent review-robustness` → 直接触发

如果 prompt 内联在 skill 中，只有该 skill 能触发。

### 对 ADR-0004 的修正

ADR-0004 的决策在以下条件下仍然成立：
- subagent 数量 ≤ 2
- prompt 内容简短（< 20 行）
- 不需要跨 skill 复用

本 ADR 限定了 ADR-0004 的适用范围，不推翻其核心原则。

## 创建的 Agent

| Agent | 维度 | 方法论来源 |
|-------|------|-----------|
| `review-blr` | 业务逻辑 | read xyz-harness-business-logic-reviewer |
| `review-standards` | 编码规范 | read xyz-harness-standards-reviewer |
| `review-taste` | 代码品味 | read codetaste 文档 |
| `review-robustness` | 健壮性 | read xyz-harness-robustness-reviewer |
| `review-integration` | 集成 | read xyz-harness-integration-reviewer |
| `review-architecture` | 架构合规 | read CLAUDE.md + docs/ |
| `review-dataflow` | 数据流 | read xyz-harness-integration-reviewer（跳过 BLR） |

每个 agent.md 约 30-50 行，放在 `~/.pi/agent/agents/` 下。

## 跨平台兼容性

agent.md 在 Claude Code 和 Pi 中的行为有差异：

| 字段 | Claude Code | Pi |
|------|------------|-----|
| `name` | agent 发现标识符 | agent 发现标识符 |
| `description` | `/agents` 列表展示 | 列表展示 |
| `model` | 生效（指定子模型） | **不生效**（Pi 用自己的 model-resolve） |
| `tools` | 生效（限制工具集） | **不生效**（Pi subagent 固定 read,bash,write,edit） |
| `maxTurns` | 生效 | 不确定 |
| 正文 | 作为 system prompt 注入 | 作为 system prompt 注入 |

`model` 和 `tools` 字段在 Pi 中不生效，但保留它们不会报错——Claude Code 正常使用这些字段。这是可接受的跨平台差异。

## 安装位置

源文件在 harness 项目中开发，symlink 到运行时目录：

| 工具 | agent 目录 |
|------|-----------|
| Claude Code | `~/.claude/agents/` |
| Pi | `~/.pi/agent/agents/` |

```bash
ln -s /path/to/agents/{name}.md ~/.claude/agents/{name}.md
ln -s /path/to/agents/{name}.md ~/.pi/agent/agents/{name}.md
```

## 后果

- code-review-worktree SKILL.md 从 622 行降到 ~186 行
- 新增 7 个 agent.md 文件（总计约 383 行）
- 主 agent 分派时的上下文消耗大幅降低
- 需要维护 agent.md + skill 的版本一致性
- coding-workflow 扩展可以直接引用 agent name 分派
- `model` 和 `tools` 字段在 Pi 中不生效，但不影响功能
