# Retrospect 保留 skill 形态，删除 agent 形态；所有 subagent 用 general-purpose

Retrospect 模块原同时存在于 `skills/harness-retrospect/SKILL.md` 和 `agents/harness-retrospect/agent.md`，内容几乎相同，维护两份。决定：删除 agent 版本，保留 skill 版本。所有 subagent（包括 review、retrospect）统一使用 `general-purpose` agent，通过 task prompt 注入方法论（让 subagent read 对应的 skill 文件）。

否决了"专用 agent"方案。原因：(1) harness 的 subagent 数量有限（review + retrospect），不值得为每个维护独立的 agent.md；(2) general-purpose + task prompt 的模式已经在 review subagent 中验证有效，retrospect 没有理由不同；(3) 统一模式降低维护成本——新增 subagent 类型只需写 skill，不用同时维护 agent。
