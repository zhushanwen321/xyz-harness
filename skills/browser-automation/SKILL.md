---
name: browser-automation
description: "Use when debugging web pages or Electron apps with screenshots, element inspection, UI interactions, or style checks. Also use for network monitoring, performance analysis, heap snapshots, or accessibility tree inspection. Not for API testing or backend debugging."
---

# Browser Automation

## Overview

**优先 Playwright，特殊场景回退 CDP。** 同一个 CDP 连接，两套工具按需切换。Playwright 提供自动等待和智能选择器，减少 flaky 操作；CDP 提供网络监控、性能分析等底层能力。

## When NOT to Use

- API/后端调试 → 用 HTTP 客户端或后端日志工具
- Playwright 测试框架（`npx playwright test`）→ 用 Playwright CLI，不需要本 skill
- 用户未运行 Chrome/Electron 且未同意新开 → 不能启动浏览器

## 选择策略

| 场景 | 工具 | 原因 |
|------|------|------|
| 截图、点击、填写、导航 | **Playwright** | 自动等待、智能选择器、一键样式检查 |
| DOM 快照 | **Playwright** | 结构化 JSON，含 CSS class |
| 网络请求监控 | **CDP** | Playwright 连接模式无法拦截已有上下文请求 |
| 控制台日志捕获 | **CDP** | 需持久 WebSocket 接收事件流 |
| Performance/Profiler | **CDP** | Playwright 不封装底层性能 API |
| Heap Snapshot | **CDP** | Playwright 不提供内存分析 |
| Accessibility Tree | **CDP** | 需浏览器原生 a11y 树（含 disabled/checked） |
| 对话框处理、文件上传 | **CDP** | Playwright skill 暂未实现 |

## 前置条件

```bash
# 安装 Playwright（一次性，否则 pw.js 报错找不到 playwright 模块）
cd ~/.pi/agent/skills/browser-automation/scripts && npm install
# 不需要 npx playwright install —— 连接已运行的浏览器
```

## ⚠️ 进程管理规范

### 规则 1：明确用户意图

- "看看我的 xxx 应用" → **连接已有进程**
- "打开一个新页面" → **新开进程**
- 不确定 → **问用户**

### 规则 2：连接已有进程（优先）

```bash
# 检测端口是否被占用
lsof -i :9222 2>/dev/null
# 被占用 → 直接连接
node scripts/pw.js http://localhost:9222 list-pages
```

### 规则 3：新开进程（仅在需要时）

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/browser-profile &
CHROME_PID=$!
# 用完：kill $CHROME_PID（严禁 pkill chrome）
```

### 规则 4：精准关闭

```
❌ pkill chrome → 会杀掉用户所有 Chrome 窗口，包括正在工作的标签页
❌ pkill electron / pkill -f "vite" → 同上，误杀无关进程
✅ kill $PID（$! 或 lsof -ti :9222 获取）— 只杀你启动的那个进程
```

## 命令速查

```bash
EP="http://localhost:9222"
PW="node ~/.pi/agent/skills/browser-automation/scripts/pw.js"
CDP="node ~/.pi/agent/skills/browser-automation/scripts/cdp.js"
WS="$(curl -s $EP/json/list | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["webSocketDebuggerUrl"])')"
```

### Playwright（日常操作）

```bash
# 页面管理
$PW $EP list-pages
$PW $EP select-page 0
$PW $EP navigate "https://example.com"

# 截图
$PW $EP screenshot                                    # 全页面
$PW $EP screenshot -s ".user-list" -o user-list.png  # 元素截图

# DOM 快照
$PW $EP snapshot          # 可交互元素（推荐）
$PW $EP snapshot full     # 完整 DOM

# 元素交互（自动等待，默认 10s 超时）
$PW $EP click "text=提交"
$PW $EP dblclick ".row"                        # 双击
$PW $EP click "text=菜单" --button right     # 右键（上下文菜单）
$PW $EP fill "input[name=email]" "test@x.com"  # 清空+填写
$PW $EP type "input[name=search]" "关键词"     # 逐字输入
$PW $EP select "select.country" "CN"            # 下拉选择
$PW $EP check "input[type=checkbox]"            # 勾选
$PW $EP uncheck "input[type=checkbox]"          # 取消勾选
$PW $EP hover ".dropdown-trigger"
$PW $EP press Enter                            # 按键

# 等待与滚动
$PW $EP wait ".loaded-content"                 # 等待元素出现
$PW $EP wait ".loading-mask" hidden            # 等待元素消失
$PW $EP wait "text=操作成功" 5000              # 带超时
$PW $EP scroll down 500                         # 滚动

# 导航
$PW $EP go-back                                # 浏览器后退

# 检查
$PW $EP text "h1"                              # 获取文本
$PW $EP html ".user-card"                      # 获取 HTML
$PW $EP styles ".user-card"                    # computed styles + bounding box

# 执行 JS
$PW $EP evaluate "document.title"
```

选择器：CSS、`text=`、`role=`、`label=`、`placeholder=`、`testid=`、`alt=`

### CDP（底层调试）

```bash
# 网络请求监控
$CDP "$WS" Network.enable '{}'

# 控制台日志
$CDP "$WS" Runtime.enable '{}'

# Performance
$CDP "$WS" Performance.enable '{}'

# Heap Snapshot
$CDP "$WS" HeapProfiler.takeHeapSnapshot '{}'

# Accessibility Tree
$CDP "$WS" Accessibility.getFullAXTree '{}'

# 对话框
$CDP "$WS" Page.handleJavaScriptDialog '{"action":"accept"}'

# 原始截图（base64）
$CDP "$WS" Page.captureScreenshot '{"format":"png"}'
```

详细命令参考：
- Playwright 完整命令 → `references/playwright-commands.md`
- CDP 完整命令 → `references/cdp-commands.md`

## Common Mistakes

| 错误 | 后果 | 修复 |
|------|------|------|
| `pkill chrome` | 杀掉用户所有窗口 | `kill $PID`（精准） |
| 不检测端口直接启动 | 端口冲突，连接失败 | 先 `lsof -i :9222` |
| 用完不关进程 | 后台残留 Chrome | 用完立即 `kill $PID` |
| 把 CDP 当首选 | 手动轮询、代码冗长 | 日常操作用 Playwright |

## Electron 支持

Electron 支持 `--remote-debugging-port`，Playwright 直接连接：

```bash
npx electron . --remote-debugging-port=9222
$PW $EP list-pages
```
