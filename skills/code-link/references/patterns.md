# Code Link — 详细使用模式

## 1. 单入口追踪（替代 code-trace）

追踪一个 API 路由涉及的所有文件：

```bash
python3 scripts/code_link.py --project /path/to/project --entry "/api/task/runs"
```

结果中 `all_files` 就是需要审查/理解的完整文件列表。

## 2. 批量入口扫描（替代 batch-tracer）

对项目中所有入口点逐一追踪，汇总文件覆盖率：

```bash
# 1. 列出所有入口点
python3 -c "
from scripts.entry_resolvers import auto_detect
resolvers = auto_detect('/path/to/project')
for r in resolvers:
    for ep in r.discover_all('/path/to/project'):
        print(f'{r.__class__.__name__}\t{ep.name}\t{ep.handler}')
"

# 2. 逐个追踪（可配合 xargs -P 并行）
python3 scripts/code_link.py --project ... --entry "/api/xxx" --bridge backend
```

## 3. 问题验证（替代 issue-trace）

用户报告 bug 时，从相关入口追踪到所有文件，定位问题所在：

1. 确定入口（API 路由 / WS 消息 / 类名）
2. `--bridge both` 获取完整前后端文件
3. 在返回的文件列表中搜索问题关键词

## 4. 审查质量评估（替代 review-tracer）

审查工具输出质量评估的方法：

1. 用 code-link 追踪出正确的文件列表（ground truth）
2. 对比审查工具输出的文件列表与 ground truth 的重叠度
3. 覆盖率低 = 审查工具遗漏多

## 5. 架构理解

理解模块边界和依赖关系：

```bash
# 追踪一个 service 的所有下游
python3 scripts/code_link.py --project ... --entry "TaskRunService" --bridge backend

# 追踪 WS 消息的前后端完整链路
python3 scripts/code_link.py --project ... --entry "message.send" --bridge both
```

## 前置条件

项目必须有 `.code-review-graph/graph.db`。首次使用时自动构建，也可手动：

```bash
cd /path/to/project && code-review-graph build
```

支持的框架：
- FastAPI（`@router.get/post` 装饰器）
- WebSocket（`switch(msg.type)` 模式）
- Electron IPC（`ipcMain.handle` 模式）
- 任意语言（tree-sitter 支持 25+ 语言的调用图）
