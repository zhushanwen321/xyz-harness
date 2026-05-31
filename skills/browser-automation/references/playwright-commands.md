---
name: playwright-automation
description: "浏览器自动化首选工具（优先于 chrome-automation）。基于 Playwright，提供自动等待、智能选择器（文本/角色/标签）、样式检查、DOM 快照等能力。通过 connectOverCDP 连接已运行的 Chrome/Electron。当本 skill 无法满足需求时（如网络请求拦截、Performance 面板、Heap Snapshot），回退使用 chrome-automation。触发词：playwright、浏览器自动化、页面截图、元素检查、UI 调试、前端调试。"
---

# Playwright Automation（浏览器自动化首选）

**这是浏览器自动化的首选 skill。** 日常开发中的截图、元素交互、样式检查、DOM 检查等操作，应优先使用本 skill。

只有当本 skill 无法满足需求时，才回退到 `chrome-automation`（原始 CDP）。具体见下方「何时用 chrome-automation」。

## 相比 chrome-automation 的核心改进

1. **自动等待** — 不需要手动 sleep 或轮询，Playwright 自动等元素出现
2. **智能选择器** — 支持按文本、角色、标签、placeholder、testid 定位，不依赖 CSS 选择器
3. **样式检查** — `styles` 命令直接获取元素的 computed styles + bounding box
4. **DOM 快照** — 两种模式：`interactive`（只有可交互元素）和 `full`（完整 DOM 树）

## 前置条件

### 1. 安装 Playwright（一次性）

```bash
cd ~/.pi/agent/skills/playwright-automation/scripts
npm install
# 不需要 npx playwright install —— 我们连接已运行的浏览器
```

### 2. 连接浏览器

## ⚠️ 进程管理规范（必须遵守）

### 规则 1：明确用户的意图

- 用户说"看看我的 xxx 应用"、"打开页面看看效果" → **连接用户已有的进程**
- 用户说"打开一个新页面看看"、"访问 xxx 网址" → **新开进程**
- 不确定时 → **问用户**，不要自作主张

### 规则 2：连接已有进程（优先）

用户已经在运行 Chrome/Electron 时，直接连接，**不要另开新进程**：

```bash
# 先检测用户是否有进程在监听调试端口
# Chrome 默认调试端口 9222，Electron 可能不同

# 检查端口是否已被占用
lsof -i :9222 2>/dev/null

# 如果端口已被占用 → 直接连接（用户已有的浏览器）
node scripts/pw.js http://localhost:9222 list-pages

# 如果用户的 Electron 用了其他端口，用用户指定的端口
node scripts/pw.js http://localhost:<用户端口> list-pages
```

### 规则 3：新开进程（仅在需要时）

需要新开浏览器时，记录 PID，用完精准关闭：

```bash
# 启动并记录 PID
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/pw-chrome-profile &
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
PID=$(pgrep -f "--remote-debugging-port=9222.*user-data-dir=/tmp/pw-chrome")
kill $PID
```

---

## 命令速查

脚本路径：`scripts/pw.js`（相对于本 skill 目录）

```bash
PW="node ~/.pi/agent/skills/playwright-automation/scripts/pw.js"
CDP="http://localhost:9222"
```

### 页面管理

| 命令 | 说明 |
|------|------|
| `list-pages` | 列出所有标签页 |
| `select-page <index>` | 切换到指定标签页 |
| `navigate <url>` | 导航并等待加载 |

```bash
$PW $CDP list-pages
$PW $CDP select-page 0
$PW $CDP navigate "https://example.com"
```

### 截图

| 命令 | 说明 |
|------|------|
| `screenshot` | 全页面截图 |
| `screenshot -s <selector> -o <file>` | 元素截图 |

```bash
# 全页面截图（保存到 screenshot.png）
$PW $CDP screenshot

# 指定元素截图
$PW $CDP screenshot -s ".user-list" -o user-list.png

# 全页面截图（含滚动区域）
$PW $CDP screenshot --full-page -o full.png
```

AI 收到截图后通过 `analyze_image` 或 `read`（如果图片已保存）查看。

### DOM 快照

| 命令 | 说明 |
|------|------|
| `snapshot` | 可交互元素 + 标题 + 有文本的叶子节点 |
| `snapshot full` | 完整 DOM 树（含容器元素） |

```bash
# 推荐：只看可交互元素，输出精简
$PW $CDP snapshot

# 完整 DOM（调试布局问题时用）
$PW $CDP snapshot full
```

**snapshot interactive 输出示例**：

```json
{
  "tag": "div",
  "cls": "app",
  "children": [
    { "tag": "nav", "children": [
      { "tag": "a", "text": "首页", "href": "/" },
      { "tag": "a", "text": "用户管理", "href": "/users" }
    ]},
    { "tag": "h1", "text": "用户列表" },
    { "tag": "input", "type": "text", "placeholder": "搜索..." },
    { "tag": "table", "children": [
      { "tag": "tr", "children": [
        { "tag": "td", "text": "张三" },
        { "tag": "button", "text": "删除", "cls": "btn-danger" }
      ]}
    ]}
  ]
}
```

### 元素交互

所有交互命令**自动等待**元素出现（默认 10 秒超时）。

```bash
# 点击
$PW $CDP click "button.submit"
$PW $CDP click "text=提交"              # 按可见文本
$PW $CDP click "role=button[name=\"提交\"]" # 按无障碍角色

# 填写（自动清空原内容）
$PW $CDP fill "input[name=email]" "test@example.com"
$PW $CDP fill "placeholder=请输入邮箱" "test@example.com"

# 逐字输入（模拟真实键盘）
$PW $CDP type "input[name=search]" "关键词"

# 悬停
$PW $CDP hover ".dropdown-trigger"

# 选择下拉选项
$PW $CDP select "select.country" "CN"

# 按键
$PW $CDP press Enter
$PW $CDP press Tab
$PW $CDP press Escape
$PW $CDP press Control+a
```

### 元素检查

```bash
# 获取文本内容
$PW $CDP text "h1"

# 获取 HTML
$PW $CDP html ".user-card"

# 获取 computed styles + bounding box
$PW $CDP styles ".user-card"
```

**styles 输出示例**：

```json
{
  "display": "flex",
  "position": "relative",
  "width": "800px",
  "height": "60px",
  "color": "rgb(51, 51, 51)",
  "background-color": "rgb(255, 255, 255)",
  "border": "1px solid rgb(221, 221, 221)",
  "_box": { "top": 120, "left": 40, "width": 800, "height": 60 }
}
```

### 等待与滚动

```bash
# 等待元素出现（默认 15 秒）
$PW $CDP wait ".loaded-content"
$PW $CDP wait "text=操作成功" 5000

# 滚动
$PW $CDP scroll down 500
$PW $CDP scroll up 300
```

### 执行 JS

```bash
$PW $CDP evaluate "document.title"
$PW $CDP evaluate "document.querySelectorAll('button').length"
$PW $CDP evaluate "JSON.stringify({url: location.href, title: document.title})"
```

---

## 选择器语法

| 语法 | 说明 | 示例 |
|------|------|------|
| CSS 选择器 | 默认 | `.btn-primary`, `#login-form input[name=email]` |
| `text=<文本>` | 按可见文本 | `text=提交`, `text=/hello/i` |
| `role=<角色>` | 按无障碍角色 | `role=button`, `role=link` |
| `role=<角色>[name="<名>"]` | 角色 + 名称 | `role=button[name="提交"]` |
| `label=<文本>` | 按关联标签 | `label=邮箱` |
| `placeholder=<文本>` | 按 placeholder | `placeholder=请输入` |
| `testid=<id>` | 按 data-testid | `testid=submit-btn` |
| `alt=<文本>` | 按 alt 文本 | `alt=用户头像` |

---

## 选择策略：什么时候用 Playwright，什么时候用 CDP

### 优先使用本 skill（Playwright）

以下场景**必须用 playwright-automation**，不要用 chrome-automation：

- 截图、元素截图
- 点击、填写、导航等交互操作
- 检查元素样式（computed styles）
- 检查元素文本 / HTML
- 获取页面 DOM 快照
- 等待元素出现
- 按文本/角色/placeholder 定位元素
- 滚动页面
- 日常 UI 调试

原因：Playwright 自动等待、智能选择器、一步到位的样式/文本命令，比手动 CDP 调用高效得多。

### 回退使用 chrome-automation（CDP）

以下场景 Playwright 的 connectOverCDP 模式**无法支持**，需回退到 `chrome-automation`：

| 场景 | CDP 命令 | 原因 |
|------|---------|------|
| 网络请求拦截/监控 | `Network.enable` + 事件监听 | Playwright 连接模式下无法拦截已有上下文的请求 |
| 控制台日志实时捕获 | `Runtime.enable` + 事件监听 | 需要持久 WebSocket 连接接收事件流 |
| Performance/Profiler 分析 | `Performance.*`, `Profiler.*` | Playwright 不封装这些底层性能 API |
| Heap Snapshot（内存快照） | `HeapProfiler.takeHeapSnapshot` | Playwright 不提供内存分析工具 |
| 对话框处理 | `Page.handleJavaScriptDialog` | 本 skill 暂未实现 |
| 文件上传 | `DOM.setFileInputFiles` | 本 skill 暂未实现 |
| Accessibility Tree（原生） | `Accessibility.getFullAXTree` | 需要浏览器原生 a11y 树（含 disabled/checked 状态） |
| Lighthouse 审计 | `lighthouse <url> --output json` | 独立工具，非 Playwright 范畴 |

简单判断规则：**如果操作是"看页面、点元素、查样式"，用 Playwright；如果需要"监听事件、分析性能、调试底层"，用 CDP。**

### 功能对比速查

| 能力 | playwright-automation | chrome-automation (CDP) |
|------|----------------------|------------------------|
| 自动等待 | 内置（默认 10s） | 需手动轮询 |
| 选择器 | CSS + text + role + label + placeholder + testid | CSS 选择器 + JS |
| 截图 | 直接写文件 | base64 解码保存 |
| DOM 快照 | 结构化 JSON（含 CSS class） | Accessibility Tree |
| 样式检查 | `styles` 一键获取 | 需写 JS 表达式 |
| 元素文本 | `text` 一键获取 | 需写 JS 表达式 |
| 网络请求监控 | 不支持 | `Network.enable` |
| 控制台日志 | 不支持 | `Runtime.enable` |
| Performance 分析 | 不支持 | `Performance.*` + `Profiler.*` |
| 内存分析 | 不支持 | `HeapProfiler.*` |
| 依赖 | 需 `npm install playwright` | 零依赖（Node 内置 WebSocket） |

---

## Electron 项目使用

Electron 支持 `--remote-debugging-port`，Playwright 可直接连接：

```bash
# 启动 Electron（开发模式）
npx electron . --remote-debugging-port=9222

# 连接
$PW $CDP list-pages
$PW $CDP screenshot
$PW $CDP snapshot
```

**agentation-vue 也可以用在 Electron + Vue 项目中**：
- 作为 npm 依赖：`npm install agentation-vue`，在 Vue 组件中引入
- 作为 Chrome 扩展：安装 agentation-vue 的 Chrome 扩展，注入到 Electron renderer

---

## 典型调试工作流

### 场景 1："按钮位置不对"

```bash
# 1. 截图看当前状态
$PW $CDP screenshot

# 2. 查看 DOM 结构，找到按钮
$PW $CDP snapshot

# 3. 检查按钮样式
$PW $CDP styles ".submit-btn"

# 4. AI 根据截图 + 样式定位代码并修改

# 5. 再次截图验证
$PW $CDP screenshot
```

### 场景 2："点击之后没有反应"

```bash
# 1. 看页面结构
$PW $CDP snapshot interactive

# 2. 用智能选择器点击
$PW $CDP click "text=提交"

# 3. 等待结果出现
$PW $CDP wait "text=操作成功"

# 4. 查看控制台错误（用 evaluate 捕获）
$PW $CDP evaluate "(function(){window.__errors=[];window.addEventListener('error',function(e){window.__errors.push(e.message)});return 'listening'})()"
```

### 场景 3："这个输入框样式不对"

```bash
# 1. 用 placeholder 定位并检查
$PW $CDP styles "placeholder=请输入邮箱"

# 2. 获取 HTML 结构
$PW $CDP html "placeholder=请输入邮箱"

# 3. 截图该元素
$PW $CDP screenshot -s "placeholder=请输入邮箱" -o input.png
```
