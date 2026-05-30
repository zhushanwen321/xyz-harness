---
name: chrome-automation
description: "底层 CDP 浏览器自动化工具，作为 playwright-automation 的补充。日常操作（截图、点击、样式检查）优先用 playwright-automation。本 skill 仅用于 Playwright 不支持的场景：网络请求拦截/监控、控制台日志捕获、Performance/Profiler 分析、Heap Snapshot、Accessibility Tree 原始数据、对话框处理、文件上传。触发词：CDP、网络监控、性能分析、内存快照、a11y tree、chrome-devtools。"
---

# Chrome Automation（底层 CDP 补充工具）

> **优先使用 `playwright-automation`。** 本 skill 是 Playwright 的补充，仅用于 Playwright connectOverCDP 模式无法支持的场景。
>
> **日常操作（截图、点击、填写、样式检查、DOM 快照）→ 用 playwright-automation**
>
> **以下场景 → 用本 skill**

## 本 skill 的专属场景

| 场景 | 为什么 Playwright 做不了 |
|------|------------------------|
| 网络请求拦截/监控 | Playwright 连接模式无法拦截已有上下文的请求 |
| 控制台日志实时捕获 | 需要持久 WebSocket 连接接收事件流 |
| Performance/Profiler 分析 | Playwright 不封装这些底层 API |
| Heap Snapshot（内存快照） | Playwright 不提供内存分析工具 |
| Accessibility Tree 原始数据 | 需要浏览器原生 a11y 树（含 disabled/checked/expanded 状态） |
| 对话框处理（alert/confirm） | Playwright skill 暂未实现 |
| 文件上传 | Playwright skill 暂未实现 |

简单规则：**"看页面、点元素、查样式" → Playwright；"监听事件、分析性能、调试底层" → 本 skill。**

---

本 skill 使用两种方式与 Chrome 通信：
1. **HTTP API**（curl）— 页面列表、新建/关闭/切换标签
2. **WebSocket API**（附带的 `scripts/cdp.js`）— 底层 CDP 命令

> **提示**：页面列表（`list_pages`）、新建/关闭标签等 HTTP API 操作，本 skill 和 playwright-automation 都能做。Playwright 的 `list-pages` / `select-page` 更方便（直接输出结构化 JSON）。这里保留 curl 方式是为了不依赖 Playwright 的后备方案。

## 前置条件

## ⚠️ 进程管理规范（必须遵守）

### 规则 1：明确用户的意图

- 用户说"看看我的 xxx 应用"、"调试页面" → **连接用户已有的进程**
- 用户说"打开一个新页面"、"访问 xxx 网址" → **新开进程**
- 不确定时 → **问用户**，不要自作主张

### 规则 2：连接已有进程（优先）

用户已经在运行 Chrome/Electron 时，直接连接，**不要另开新进程**：

```bash
# 先检测用户是否有进程在监听调试端口
lsof -i :9222 2>/dev/null

# 如果端口已被占用 → 直接连接（用户已有的浏览器）
curl -s http://localhost:9222/json/list

# 如果用户的 Electron 用了其他端口，用用户指定的端口
curl -s http://localhost:<用户端口>/json/list
```

### 规则 3：新开进程（仅在需要时）

需要新开浏览器时，记录 PID，用完精准关闭：

```bash
# 启动并记录 PID
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/cdp-chrome-profile &
CHROME_PID=$!
echo "Chrome PID: $CHROME_PID"

# ... 使用完毕后 ...

# 精准关闭：只杀你启动的那个进程
kill $CHROME_PID
```

### 规则 4：用完必关，精准关闭

```
严禁以下操作：
❌ pkill chrome / pkill Google Chrome   — 会杀掉用户所有 Chrome 窗口
❌ pkill electron                       — 会杀掉用户所有 Electron 应用
❌ killall Chrome                       — 同上
❌ pkill -f "vite" / pkill -f "node"     — 会杀掉所有相关进程
❌ pkill -f "python"                     — 会杀掉所有 Python 进程

正确做法：
✅ kill $PID                             — 只杀你启动的那个进程（用 $! 或 lsof 获取的 PID）
✅ 用完立即关闭，不要留后台进程
```

**获取精准 PID 的方法：**

```bash
# 方法 1：启动时用 $! 记录
command &
MY_PID=$!

# 方法 2：通过端口查找
PID=$(lsof -ti :9222)
kill $PID

# 方法 3：通过精确命令匹配
PID=$(pgrep -f "--remote-debugging-port=9222.*user-data-dir=/tmp/cdp-chrome")
kill $PID
```

---

### Chrome 远程调试

Chrome 需以远程调试模式启动：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

获取 WebSocket URL（后续命令用 `$WS_URL`）：

```bash
WS_URL=$(curl -s http://localhost:9222/json/list | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['webSocketDebuggerUrl'])")
```

---

## HTTP API（curl 直接可用）

| MCP 工具 | 命令 |
|---------|------|
| list_pages | `curl -s http://localhost:9222/json/list \| python3 -m json.tool` |
| new_page | `curl -s "http://localhost:9222/json/new?https://example.com"` |
| close_page | `curl -s "http://localhost:9222/json/close/<pageId>"` |
| select_page | `curl -s "http://localhost:9222/json/activate/<pageId>"` |

浏览器版本：`curl -s http://localhost:9222/json/version`

---

## WebSocket API

使用 `scripts/cdp.js`（基于 Node.js v24 内置 WebSocket，零依赖）。

### navigate_page

```bash
node scripts/cdp.js "$WS_URL" navigate "https://example.com"
```

### evaluate_script

所有元素交互通过 `Runtime.evaluate` + CSS 选择器完成。

```bash
# 获取页面标题
node scripts/cdp.js "$WS_URL" Runtime.evaluate '{"expression":"document.title","returnByValue":true}'

# 获取页面 URL
node scripts/cdp.js "$WS_URL" Runtime.evaluate '{"expression":"location.href","returnByValue":true}'

# 任意 JS 代码
node scripts/cdp.js "$WS_URL" Runtime.evaluate '{"expression":"1+2","returnByValue":true}'
```

### click

使用 CSS 选择器定位并点击（替代 MCP 的 uid 机制）：

```bash
SELECTOR="button.submit"
node scripts/cdp.js "$WS_URL" Runtime.evaluate "{\"returnByValue\":true,\"expression\":\"document.querySelector('$SELECTOR')?.click(); 'clicked'\"}"
```

### fill

```bash
SELECTOR="input[name='email']"
VALUE="test@example.com"
node scripts/cdp.js "$WS_URL" Runtime.evaluate "{\"returnByValue\":true,\"expression\":\"(function(){var el=document.querySelector('$SELECTOR');el.focus();el.value='$VALUE';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 'filled'})()\"}"
```

多字段批量填写（对应 fill_form）：

```bash
node scripts/cdp.js "$WS_URL" Runtime.evaluate "{\"returnByValue\":true,\"expression\":\"(function(){var f={};f['input[name=email]']='a@b.com';f['input[name=name]']='test';for(var s in f){var el=document.querySelector(s);el.focus();el.value=f[s];el.dispatchEvent(new Event('input',{bubbles:true}))};return 'done'})()\"}"
```

### type_text

向当前聚焦的输入框输入文字：

```bash
node scripts/cdp.js "$WS_URL" Input.insertText '{"text":"hello world"}'
```

### press_key

```bash
# Enter 键
node scripts/cdp.js "$WS_URL" Input.dispatchKeyEvent '{"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13}'
node scripts/cdp.js "$WS_URL" Input.dispatchKeyEvent '{"type":"keyUp","key":"Enter","code":"Enter","windowsVirtualKeyCode":13}'
```

常见键码：Enter(13)、Tab(9)、Escape(27)、Backspace(8)、ArrowDown(40)、ArrowUp(38)

组合键（如 Ctrl+A）：

```bash
node scripts/cdp.js "$WS_URL" Input.dispatchKeyEvent '{"type":"keyDown","key":"a","code":"KeyA","windowsVirtualKeyCode":65,"modifiers":2}'
node scripts/cdp.js "$WS_URL" Input.dispatchKeyEvent '{"type":"keyUp","key":"a","code":"KeyA","windowsVirtualKeyCode":65,"modifiers":2}'
# modifiers: 1=Alt, 2=Ctrl, 4=Meta, 8=Shift
```

### hover

```bash
SELECTOR="a.nav-link"
node scripts/cdp.js "$WS_URL" Runtime.evaluate "{\"returnByValue\":true,\"expression\":\"(function(){var el=document.querySelector('$SELECTOR');['mouseenter','mouseover','mousemove'].forEach(function(e){el.dispatchEvent(new MouseEvent(e,{bubbles:true}))});return 'hovered'})()\"}"
```

### take_screenshot

截图并保存为 PNG：

```bash
node scripts/cdp.js "$WS_URL" Page.captureScreenshot '{"format":"png"}' | python3 -c "
import sys, json, base64
r = json.load(sys.stdin)
data = r.get('result',{}).get('result',{}).get('value','')
if data:
    with open('screenshot.png','wb') as f: f.write(base64.b64decode(data))
    print('Saved: screenshot.png')
else:
    print('Screenshot failed:', json.dumps(r, indent=2))
"
```

全页面截图：`'{"format":"png","captureBeyondViewport":true}'`

截图指定元素：

```bash
SELECTOR="div.main-content"
node scripts/cdp.js "$WS_URL" Runtime.evaluate "{\"returnByValue\":true,\"expression\":\"JSON.stringify(document.querySelector('$SELECTOR').getBoundingClientRect())\"}"
# 用返回的坐标调用 Page.captureScreenshot 的 clip 参数
```

### take_snapshot（Accessibility Tree 快照）

获取浏览器计算的真实 Accessibility Tree，包含语义角色、可访问名称、无障碍状态：

```bash
node scripts/cdp.js "$WS_URL" Accessibility.getFullAXTree '{}'
```

返回每个节点的 `nodeId`、`role`（语义角色）、`name`（可访问名称）、`properties`（disabled/checked/expanded 等）、`children`（子节点 ID）。
不可见元素（`display:none`）不会出现。数据量通常 5-20KB（200-800 tokens）。

**精简版**（只保留可交互元素 + heading + 有文本的叶子节点）：

```bash
node scripts/cdp.js "$WS_URL" Accessibility.getFullAXTree '{}' | python3 -c "
import sys, json
raw = json.load(sys.stdin)
for n in raw.get('result',{}).get('nodes',[]):
    role = n.get('role',{}).get('value','')
    name = n.get('name',{}).get('value','')
    interesting = role in {'button','link','textbox','checkbox','combobox','menuitem','tab','switch','searchbox','spinbutton','slider','radio','heading'}
    if not interesting and name and not n.get('childIds') and role not in ('WebArea','generic','paragraph','div'):
        interesting = True
    if not interesting: continue
    props = {p['name']:p['value'] for p in n.get('properties',[]) if p['name'] in ('disabled','checked','expanded','level','url','required','invalid')}
    parts = [n['nodeId'], role]
    if name: parts.append(repr(name))
    if props: parts.append(str(props))
    print(' '.join(str(p) for p in parts))
"
```

**精简版输出示例**：
```
4 link '首页' {'url': '/'}
5 link '用户管理' {'url': '/users'}
6 heading '用户列表' {'level': 1}
9 cell '张三'
10 cell 'admin@example.com'
11 button '删除'
```

**验证元素存在**（基于语义角色和名称，不依赖 CSS 选择器）：

```bash
node scripts/cdp.js "$WS_URL" Accessibility.getFullAXTree '{}' | python3 -c "
import sys, json
raw = json.load(sys.stdin)
found = False
for n in raw.get('result',{}).get('nodes',[]):
    role = n.get('role',{}).get('value','')
    name = n.get('name',{}).get('value','')
    if role == 'button' and name == '删除':
        print(f'FOUND: {n[\"nodeId\"]} {role} {repr(name)}')
        found = True
if not found: print('NOT FOUND')
"
```

**旧版（walk DOM）**：如果需要 CSS 类名、id 等原始 DOM 属性（Accessibility Tree 不提供），仍可用：

```bash
node scripts/cdp.js "$WS_URL" Runtime.evaluate '{"returnByValue":true,"expression":"(function(){function walk(el,d){if(d>8)return[];var t=(el.tagName||\"\").toLowerCase();if(!t||[\"script\",\"style\",\"noscript\",\"svg\",\"path\"].includes(t))return[];var r={tag:t};var role=el.getAttribute(\"role\");if(role)r.role=role;var lbl=el.getAttribute(\"aria-label\");if(lbl)r.ariaLabel=lbl;if(!el.children||el.children.length===0){var txt=(el.textContent||\"\").trim().slice(0,80);if(txt)r.text=txt}if(el.id)r.id=el.id;if(el.className&&typeof el.className===\"string\")r.cls=el.className.split(\" \").filter(Boolean).slice(0,3).join(\".\");var ch=[];for(var i=0;i<el.children.length;i++)ch.push(...walk(el.children[i],d+1));if(ch.length)r.children=ch;return[r]}return JSON.stringify(walk(document.body,0))})()"}'
```

### wait_for

等待文本出现在页面中：

```bash
for i in $(seq 1 30); do
  found=$(node scripts/cdp.js "$WS_URL" Runtime.evaluate "{\"returnByValue\":true,\"expression\":\"document.body.innerText.includes('TARGET_TEXT')\"}" 2>/dev/null)
  if echo "$found" | grep -q '"value":true'; then echo "Found"; break; fi
  sleep 1
done
```

### handle_dialog

```bash
# Accept dialog
node scripts/cdp.js "$WS_URL" Page.handleJavaScriptDialog '{"action":"accept"}'
# Dismiss with prompt text
node scripts/cdp.js "$WS_URL" Page.handleJavaScriptDialog '{"action":"accept","promptText":"hello"}'
```

### upload_file

```bash
SELECTOR="input[type='file']"
FILEPATH="/path/to/file.txt"
node scripts/cdp.js "$WS_URL" Runtime.evaluate "{\"returnByValue\":true,\"expression\":\"(function(){var el=document.querySelector('$SELECTOR');return el?'found':'not found'})()\"}"
# 需通过 DOM.setFileInputFiles — 先获取 node backendNodeId
```

### resize_page

```bash
node scripts/cdp.js "$WS_URL" Emulation.setDeviceMetricsOverride '{"width":1280,"height":720,"deviceScaleFactor":1,"mobile":false}'
```

### emulate

```bash
# 移动设备模拟
node scripts/cdp.js "$WS_URL" Emulation.setDeviceMetricsOverride '{"width":375,"height":812,"deviceScaleFactor":3,"mobile":true}'
node scripts/cdp.js "$WS_URL" Network.setUserAgentOverride '{"userAgent":"Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ..."}'
```

---

## 完整工具对照

下表列出所有 chrome-devtools MCP 工具在本 skill 中的替代方式。
标记了 **[用 Playwright]** 的操作表示 `playwright-automation` 也能完成且体验更好，应优先使用。

| chrome-devtools MCP | 替代方式 | Playwright 优先? |
|-------------------|---------|:---:|
| list_pages | `curl localhost:9222/json/list` | **[用 Playwright]** |
| new_page | `curl localhost:9222/json/new?<url>` | **[用 Playwright]** |
| close_page | `curl localhost:9222/json/close/<id>` | **[用 Playwright]** |
| select_page | `curl localhost:9222/json/activate/<id>` | **[用 Playwright]** |
| navigate_page | `cdp.js navigate <url>` | **[用 Playwright]** |
| take_screenshot | `cdp.js Page.captureScreenshot` | **[用 Playwright]** |
| take_snapshot | `cdp.js Accessibility.getFullAXTree` (精简版: + python3 过滤) | CDP 专属（原生 a11y 树含 disabled/checked 状态） |
| click(uid) | `cdp.js Runtime.evaluate` + `querySelector.click()` | **[用 Playwright]** |
| fill(uid, value) | `cdp.js Runtime.evaluate` + `querySelector.value=` | **[用 Playwright]** |
| fill_form(elements) | `cdp.js Runtime.evaluate` + 批量 JS | **[用 Playwright]** |
| evaluate_script(fn) | `cdp.js Runtime.evaluate` | **[用 Playwright]** |
| type_text(text) | `cdp.js Input.insertText` | **[用 Playwright]** |
| press_key(key) | `cdp.js Input.dispatchKeyEvent` | **[用 Playwright]** |
| hover(uid) | `cdp.js Runtime.evaluate` + mouse events | **[用 Playwright]** |
| wait_for(text) | 轮询 `cdp.js Runtime.evaluate` | **[用 Playwright]** |
| handle_dialog | `cdp.js Page.handleJavaScriptDialog` | CDP 专属 |
| upload_file | `cdp.js DOM.setFileInputFiles` | CDP 专属 |
| resize_page | `cdp.js Emulation.setDeviceMetricsOverride` | 均可 |
| emulate | `cdp.js Emulation.*` + `Network.setUserAgentOverride` | 均可 |
| drag | `cdp.js Input.dispatchMouseEvent` 序列 | 均可 |
| list_network_requests | `cdp.js Network.enable` + 事件监听脚本 | CDP 专属 |
| list_console_messages | `cdp.js Runtime.enable` + 事件监听脚本 | CDP 专属 |
| lighthouse_audit | `lighthouse <url> --output json` CLI | CDP 专属 |
| performance_* | `cdp.js Performance.*` + `cdp.js Profiler.*` | CDP 专属 |
| take_memory_snapshot | `cdp.js HeapProfiler.takeHeapSnapshot` | CDP 专属 |

## 注意事项

- chrome-devtools MCP 使用 uid（a11y tree 的唯一标识），本 skill 改用 CSS 选择器（`querySelector`），更通用
- CDP 命令参考：https://chromedevtools.github.io/devtools-protocol/
- `scripts/cdp.js` 路径：相对本 skill 目录下的 `scripts/cdp.js`
