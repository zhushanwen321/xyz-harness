---
name: code-link
description: "Trace code call chains from entry points (HTTP routes, WebSocket messages, IPC channels, class/method names) to all related files. Replaces batch-tracer, code-trace, issue-trace, review-tracer with AST-based graph traversal via code-review-graph. Triggers: trace code, call chain, code-link, find callers, trace route, analyze data flow, linked files. Not for general code review or lint."
---

# Code Link — AST-based Code Tracer

## Overview

从入口点出发，利用 code-review-graph 的持久化 AST 图数据库，BFS 追踪调用链，串联前后端所有相关文件。替代手写的 batch-tracer / code-trace / issue-trace / review-tracer。

## When to Use

- 用户说"追踪链路"、"trace code"、"调用链"、"find callers"、"相关文件"
- 需要知道某个 HTTP 路由/WS 消息/IPC 通道涉及哪些代码文件
- 需要从后端 API 桥接到前端组件
- 需要理解某个类/方法的所有下游调用

**When NOT to use:**
- 通用代码审查 → `code-review-worktree`
- 分析审查工具质量 → 直接在对话中评估
- 验证 bug → `diagnose`

## Quick Start

```bash
# 脚本位于 skill 目录的 scripts/ 下，通过 --project 指定目标项目
# 首次使用自动 build graph.db + 启动 watch 后台监听
SKILL_DIR="~/.pi/agent/skills/code-link"
python3 "$SKILL_DIR/scripts/code_link.py" --project /path/to/project --entry "/api/task/runs"
python3 "$SKILL_DIR/scripts/code_link.py" --project /path/to/project --entry "session.create"
python3 "$SKILL_DIR/scripts/code_link.py" --project /path/to/project --entry "TaskRunService.cancel_run" --bridge backend
```

## Graph DB 生命周期

脚本自动管理 `.code-review-graph/graph.db`：

| 场景 | 行为 |
|------|------|
| graph.db 不存在 | 自动全量 build + 启动 watch |
| graph.db 为空（0 nodes） | 重新 build + 启动 watch |
| graph.db 有数据 + watch 未运行 | 启动 watch 后台监听 |
| graph.db 有数据 + watch 运行中 | 直接使用 |

watch 进程通过 PID 文件 (`.code-review-graph/.watch.pid`) 跟踪，使用 watchdog 监听文件变化并增量更新。

## Entry Types

CLI 自动检测入口类型，无需手动指定：

| 查询格式 | 检测类型 | 解析器 |
|---------|---------|--------|
| `/api/task/runs` | http | FastAPIResolver |
| `session.create` | ws_message | WSMessageResolver |
| `channel:window/api` | ipc | IPCResolver |
| `TaskRunService.cancel_run` | direct | GraphTracer 直接搜索 |

## Output

JSON 格式，包含：

```json
{
  "entry_type": "http",
  "backend": { "files": [...], "entry_points": [...], "trace_nodes": 34 },
  "frontend": { "files": [...], "matches": [...] },
  "all_files": ["sorted", "list"],
  "stats": { "total_files": 13 }
}
```

## Bridge Mode

| Mode | 说明 |
|------|------|
| `--bridge both` | 后端追踪 + 前端桥接（默认） |
| `--bridge backend` | 仅后端追踪 |
| `--bridge frontend` | 仅前端桥接 |

## Common Patterns

read `references/patterns.md` for detailed usage patterns including:
- 单入口追踪
- 批量入口扫描
- 问题验证（替代 issue-trace）
- 审查质量评估（替代 review-tracer）
