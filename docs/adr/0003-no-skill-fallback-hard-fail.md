# Skill 发现策略：无 fallback，硬失败

coding-workflow 扩展在发现 skill 文件时，只用 Pi 的 `before_agent_start` 注入的 `systemPromptOptions.skills` 列表。不尝试 `~/.pi/agent/skills/{name}/SKILL.md` 等 fallback 路径。如果 skill 不在注入列表中，直接抛异常终止。

三个方案被否决：(1) 3 路径搜索链（原实现，掩盖安装错误，静默读到旧版本）；(2) 调 Python 脚本解析（跨语言调用，gate-check.py 不应承担 skill 发现职责）；(3) TS 侧用 js-yaml 自读文件（re-implement Pi 已有的注入机制）。硬失败的代价是安装必须正确——但这恰好是我们想要的：错误应该在第一时间暴露，而不是在运行中偶然发现读到了错误的 skill 内容。
