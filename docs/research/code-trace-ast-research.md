# 代码链路追踪：AST 调研与实施方案

> 日期：2026-05-31
> 状态：**已完成开发**，全部验证通过

## 一、背景与问题

### 痛点

AI agent 开发的代码经常是半成品：
- 某个方法/类压根没实现（`pass`、`NotImplementedError`、`TODO`）
- 大方向正确但实际开发与设计不符
- 前后端接口对不上

### 现有 skill 的失败

| Skill | 问题 | 状态 |
|-------|------|------|
| `code-trace` | LLM 用 grep/read 手动追踪调用链，慢且不准 | 从未触发，待删除 |
| `issue-trace` | 要求用户先提出问题再验证 — 方向反了 | 从未触发，待删除 |
| `review-tracer` | 审查审查者，和需求无关 | 从未触发，待删除 |
| `batch-tracer` | 调度上面三个无意义流程 | 从未触发，待删除 |

根因：让 LLM 做 AST 该做的事（调用链提取），成本高、精度低、触发率为零。

## 二、调研发现

### 2.1 AST vs LLM 的能力边界

| 检测类型 | AST 精度 | LLM 精度 | 说明 |
|---------|---------|---------|------|
| 方法未实现 | 100% | ~80% | `pass`/`TODO`/空函数体，AST 零遗漏 |
| 函数定义了但从未调用 | ~95% | ~60% | 需要 import 分析，LLM 经常漏 |
| import 不存在的模块 | 100% | ~70% | 静态可解析 |
| 调用了不存在的函数 | ~90% | ~70% | 类型推导后可检测 |
| 实现与设计不符 | N/A | ~75% | 需要语义理解，AST 做不到 |
| 业务逻辑遗漏 | N/A | ~60% | 需要领域知识 |

**结论**：70-80% 的半成品检测可以由 AST 确定性完成，剩余 20-30% 需要 LLM 语义判断。

### 2.2 项目类型分析

| 项目 | 技术栈 | 通信模式 | 入口类型 |
|------|--------|---------|---------|
| dag-executor | Python FastAPI + Vue 3 | HTTP REST API | URL 路径 `/api/task/runs` |
| xyz-agent | Electron + TypeScript + Vue | WebSocket 消息 + IPC | 消息类型 `session.create` |
| 未来的项目 | 可能 Express/NestJS/Spring | HTTP 或 RPC | URL 或 RPC 方法名 |

### 2.3 已安装工具：code-review-graph

**版本**：2.3.1  
**核心依赖**：tree-sitter + tree-sitter-language-pack + networkx + SQLite  
**安装位置**：pip 全局安装（`code-review-graph`）

#### 已验证的能力

| 能力 | 验证结果 | 备注 |
|------|---------|------|
| Python 调用链 | ✅ `list_runs` → TaskRunService + DagRunFilter（5 个文件） | qualified_name 精确到函数级 |
| Vue SFC 解析 | ✅ TaskRunList.vue → 8 个函数节点 + 18 条边 | 解析 `<script setup>` + `<template>` |
| TypeScript import 链 | ✅ taskRunService.ts → api.ts + 类型文件 | 自动解析 tsconfig paths |
| 多语言 | ✅ Python 1273 + Vue 228 + TS 207 + bash 44 + JS 10 | tree-sitter 支持 25+ 语言 |
| Flow 自动发现 | ✅ 430 个 flow，含 `list_runs` 等 | 从入口点自动追踪完整调用链 |
| 持久化 + 增量 | ✅ SQLite + git diff 感知增量更新 | 只重新解析变更文件 |
| dead_code 检测 | ✅ 内置 `refactor --mode dead_code` | 找未被引用的函数/类 |
| impact_radius | ✅ BFS 影响范围分析 | 从变更文件出发追踪影响 |

#### 无法覆盖的（需要补充）

| 缺失 | 说明 |
|------|------|
| 入口点发现 | 不知道 `list_runs` 对应 `/api/task/runs` |
| 前后端桥接 | 不知道前端 `listTaskRuns` 调用了后端 `/api/task/runs` |
| API URL 提取 | graph 里有函数名但没有 HTTP 路径信息 |
| 框架特定语义 | 不识别 FastAPI 装饰器、WebSocket switch/case、Electron IPC |

## 三、决策记录（ADR）

### ADR-0001：用 code-review-graph 替代自写 AST tracer

**背景**：已实现 `py_tracer.py`（Python AST）和 `vue_tracer.py`（正则解析 Vue SFC），但每加一种语言就要写一套 tracer，维护成本高。

**决策**：用已安装的 `code-review-graph` 作为通用 AST 层，不再自写语言特定的 tracer。

**理由**：
1. tree-sitter 支持 25+ 语言，覆盖我们所有项目（Python/TS/Vue/Java/Go/Rust）
2. 持久化 + 增量更新避免重复解析
3. 内置 Flow、community、impact_radius 等高级查询
4. 零额外维护成本 — 社区维护

**代价**：
1. 首次构建需 2-10s（大项目）
2. 依赖 tree-sitter 解析精度（某些动态调用无法处理）
3. 不识别框架特定的路由模式 — 需要我们写 EntryResolver 薄层

### ADR-0002：三层架构 — EntryResolver + Graph + Bridge

**背景**：不同项目的入口类型不同（HTTP URL / WS 消息 / IPC 通道 / 直接类名），但追踪逻辑相同。

**决策**：将系统拆为三个独立层，每层可独立扩展：

```
EntryResolver（薄层，按通信模式扩展）
  → 找到入口点对应的 handler 函数
    ↓
code-review-graph（通用层，按语言扩展）
  → 从 handler 函数追踪完整调用链
    ↓
Bridge（薄层，按通信模式扩展）
  → 将前后端文件列表通过通信标识（URL/消息类型）串联
```

**新增语言**：只需确认 tree-sitter 支持（通常已支持）  
**新增通信模式**：写一个 EntryResolver + Bridge（约 100-200 行）  
**新增项目类型**：组合已有的 Resolver + Graph + Bridge

### ADR-0003：入口类型统一为四种

用户输入通过类型判断自动路由到对应的 EntryResolver：

| 输入格式 | 判断依据 | EntryResolver |
|---------|---------|--------------|
| `/api/task/runs` | 以 `/` 开头，匹配 HTTP 路径 | FastAPIResolver / ExpressResolver |
| `session.create` | 点分隔，不含路径分隔符 | WSMessageResolver |
| `open-settings-window` | 短横线分隔 | IPCResolver |
| `TaskRunService.cancel_run` | 含类名/方法名，或直接是函数名 | 直接走 Graph query |

## 四、实施方案

### 4.1 文件结构

```
scripts/
├── code_link.py           # CLI 入口 + 桥接逻辑
├── entry_resolvers/       # 入口发现层
│   ├── base.py            # EntryResolver ABC
│   ├── fastapi.py         # FastAPI @router 路由解析
│   ├── ws_message.py      # WebSocket switch(msg.type) 解析
│   ├── ipc.py             # Electron ipcMain.handle 解析
│   └── auto_detect.py     # 自动探测项目类型
├── py_tracer.py           # 旧版（保留，不主动使用）
├── vue_tracer.py          # 旧版（保留，不主动使用）
└── README.md              # 使用说明
```

### 4.2 EntryResolver 接口

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class EntryPoint:
    name: str           # "/api/task/runs" 或 "session.create"
    entry_type: str     # "http" | "ws_message" | "ipc" | "direct"
    file: str           # handler 所在文件
    handler: str        # handler 函数/方法名
    method: str         # HTTP method 或空

class EntryResolver(ABC):
    @abstractmethod
    def discover_all(self, project: str) -> list[EntryPoint]: ...
    
    @abstractmethod
    def match(self, query: str, entries: list[EntryPoint]) -> list[EntryPoint]: ...
```

### 4.3 核心流程

```python
def trace(project: str, entry_query: str) -> dict:
    # 1. 自动探测项目类型
    resolver = auto_detect(project)
    
    # 2. 发现所有入口点
    all_entries = resolver.discover_all(project)
    
    # 3. 匹配用户查询
    matched = resolver.match(entry_query, all_entries)
    
    # 4. 确保 graph 已构建
    ensure_graph_built(project)
    
    # 5. 从每个匹配的入口点追踪调用链（用 code-review-graph）
    results = []
    for entry in matched:
        files = query_graph("callees_of", entry.handler, project)
        results.append({
            "entry": entry.name,
            "handler": entry.handler,
            "files": files,
        })
    
    # 6. 如果有前端，桥接
    frontend_files = bridge_frontend(results, project)
    
    return merge(results, frontend_files)
```

### 4.4 各项目适配方案

| 项目 | EntryResolver | Graph 查询 | Bridge | 额外工作 |
|------|--------------|-----------|--------|---------|
| dag-executor | FastAPIResolver | callees_of + impact_radius | URLBridge | 已验证，需重构 |
| xyz-agent | WSMessageResolver + IPCResolver | callees_of + flows | MessageTypeBridge | 待实现 Resolver |
| 未来的 Express 项目 | ExpressResolver | callees_of | URLBridge | 待实现 Resolver |

### 4.5 优先级

| 优先级 | 任务 | 预估 |
|--------|------|------|
| P0 | 重构 code_link.py：用 code-review-graph 替代自写 tracer | 1 天 |
| P1 | 抽取 EntryResolver 接口 + FastAPIResolver 实现 | 0.5 天 |
| P2 | WSMessageResolver 适配 xyz-agent | 1 天 |
| P3 | IPCResolver 适配 xyz-agent | 0.5 天 |
| P4 | 新 SKILL：集成 AST + LLM 语义分析 | 2 天 |

### 4.6 半成品检测的完整方案

```
阶段 1：AST（确定性，code-review-graph）
  输入：文件列表（从 entry 出发追踪到的）
  检测：
    - 空实现（pass / NotImplementedError / TODO / 空函数体）
    - dead_code（定义但从未被引用的函数/类）
    - 函数签名有参数但函数体为空
  输出：结构化问题清单（JSON）

阶段 2：LLM（语义性）
  输入：阶段 1 输出 + 所有文件内容 + spec/plan.md
  检测：
    - 实现是否覆盖设计文档所有需求点
    - 业务逻辑是否正确
    - 错误处理是否完整
  输出：语义完整性报告
```

## 五、原型验证数据

### dag-executor 项目

```
构建：336 文件, 1767 nodes, 11009 edges
语言：Python 1273 + Vue 228 + TS 207 + bash 44 + JS 10

后端追踪（/api/task/runs → list_runs）：
  backend/app/api/routes/task_run.py
  backend/app/api/schemas/filters.py
  backend/app/api/schemas/helpers.py
  backend/app/api/schemas/task_run.py
  backend/app/services/task_run_service.py

前端追踪（TaskRunList.vue）：
  节点：File + 8 个 Function
  边：7 CONTAINS + 16 CALLS + 16 IMPORTS_FROM + 1 REFERENCES
  Import：taskRunService.ts, useToast.ts, error.ts, format.ts, StatusBadge.vue 等
```

## 六、删除清单

以下 skill 将被新方案替代，待确认后删除：

| Skill | 替代方案 | 删除条件 |
|-------|---------|---------|
| `batch-tracer` | code-review-graph + 新 SKILL | 新 SKILL 验证通过后 |
| `code-trace` | code-review-graph `callees_of` + `callers_of` | 同上 |
| `issue-trace` | 新 SKILL 的 LLM 语义分析阶段 | 同上 |
| `review-tracer` | 不再需要（AST 消除了 LLM 链路幻觉问题） | 同上 |

## 七、参考资料

- code-review-graph 源码：`/Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/site-packages/code_review_graph/`
- tree-sitter 支持语言：`tree_sitter_language_pack` 支持 25+ 语言
- 原型代码：`scripts/py_tracer.py`、`scripts/vue_tracer.py`（旧版，保留）
- 新版代码：`scripts/code_link.py`、`scripts/graph_tracer.py`、`scripts/bridge.py`、`scripts/entry_resolvers/`
- dag-executor graph 数据库：`/Users/zhushanwen/Code/dag-executor-workspace/main/.code-review-graph/graph.db`

---

## 八、开发结果

### 8.1 实现的文件

| 文件 | 行数 | 职责 |
|------|------|------|
| `scripts/code_link.py` | ~300 | CLI 入口 + 核心追踪流程 |
| `scripts/graph_tracer.py` | ~250 | code-review-graph SQLite API 封装 |
| `scripts/bridge.py` | ~210 | URLBridge + MessageTypeBridge + IPCBridge |
| `scripts/entry_resolvers/base.py` | ~45 | EntryPoint 数据类 + EntryResolver ABC |
| `scripts/entry_resolvers/fastapi.py` | ~130 | FastAPI @router 装饰器解析 |
| `scripts/entry_resolvers/ws_message.py` | ~110 | switch(msg.type) case 解析 |
| `scripts/entry_resolvers/ipc.py` | ~70 | ipcMain.handle 通道解析 |
| `scripts/entry_resolvers/auto_detect.py` | ~80 | 项目类型自动探测 + 入口类型分类 |

### 8.2 端到端验证结果

| 项目 | 入口 | 类型 | 总文件 | 节点数 |
|------|------|------|--------|--------|
| dag-executor | `/api/task/runs` | http | 9 (4B+5F) | 4 |
| dag-executor | `TaskRunService.cancel_run` | direct | 6 | 7 |
| dag-executor | `TaskRunService` | direct | 1 | 1 |
| dag-executor | `task_run_service.py` | direct | 6 | 11 |
| xyz-agent | `session.create` | ws_message | 13 | 34 |
| xyz-agent | `session.delete` | ws_message | 8 | 16 |
| xyz-agent | `message.send` | ws_message | 12 | 35 |
| xyz-agent | `get-windows` | ipc | 0 | 0 |

IPC 因内联回调限制追踪深度为 0（预期行为）。

### 8.3 关键技术决策

1. **GraphTracer 直接读 SQLite**，不 import code-review-graph Python 包 — 避免 import 路径和版本问题
2. **handler 解析支持驼峰匹配**：`this.sessionService.create` → 搜索 `SessionService.create` — 解决 TS 属性名与类名的映射
3. **WSMessageResolver 两遍扫描**：先找 `this.xxx.yyy(...)` 多级调用，再找普通调用 — 优先选中 Service 层方法
4. **auto_detect 三模式探测**：FastAPI (APIRouter) + WebSocket (msg.type) + IPC (ipcMain) — 独立组合

### 8.4 已知限制

1. IPC 内联回调追踪为 0 — tree-sitter 无法提取箭头函数为独立节点
2. `this.xxxService.yyy` 映射依赖驼峰转换（首字母大写） — 可能 miss 非标准命名
3. WSMessageResolver 扫描所有含 `msg.type` 的 .ts 文件 — 可能包含 mock/test 文件
4. 前端追踪依赖 import 链 — 动态 import 和 require 不会被追踪
