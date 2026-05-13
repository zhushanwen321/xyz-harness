---
name: xyz-harness-e2e-test-plan
description: >
  E2E 测试计划编写规范。基于 spec.md + plan.md 生成结构化的端到端测试计划，包含测试环境配置、
  用例分组、依赖关系、操作步骤、验证方法。验证方法采用四层策略：API → DOM/A11y → 视觉对比 → 数据库。
  当用户说"编写 E2E 测试计划"、"端到端测试计划"、"e2e-test-plan"或 Phase 1 Step 5 执行时触发。
---

# E2E 测试计划编写规范

你正在编写端到端测试计划（e2e-test-plan.md）。这份计划将指导 Phase 2 的 AI agent 执行完整的前后端联动验证。

**核心原则：**
1. **这份计划是给 AI agent 的操作手册**，每个步骤都必须精确到可执行的命令或 API 调用
2. **前端测试不是可选的**——如果 spec 涉及任何 UI 变更，必须包含 DOM 验证和/或视觉对比
3. **四层验证策略**：API → DOM/A11y → 视觉对比 → 数据库，每个用例至少覆盖其中两层

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | Phase 1 Step 5（E2E 测试计划编写） |
| 上游 | spec.md + plan.md |
| 下游 | Step 6 计划评审 |
| 产出物 | `.xyz-harness/{topicDir}/e2e-test-plan.md` |

---

## 生成流程

分两步生成，整体方案由主 agent 编写，具体用例通过 subagent 分组并行生成。

### 第一步：整体方案（主 agent 编写）

1. 阅读 spec.md 和 plan.md，确定测试范围
2. **识别 UI 变更点**：spec 中涉及哪些页面/组件的改动？是否有设计稿？
3. 确定测试分组策略（按功能模块 / 按用户场景 / 按数据流）
4. 绘制依赖关系图
5. 确定测试环境配置（前后端启动方式、数据准备）
6. **为每个分组确定验证层级**：
   - 纯后端接口 → Layer 1 (API) + Layer 4 (DB)
   - 有 UI 变更 → Layer 1 (API) + Layer 2 (DOM/A11y) + 可选 Layer 3 (视觉)
   - 有关键视觉设计 → Layer 1-4 全覆盖
7. 编写 e2e-test-plan.md 的框架（前 4 个章节），为每个分组预留用例区域

### 第二步：具体用例（subagent 分组生成）

1. 将每个测试组分配给一个 subagent
2. 每个 subagent 根据整体方案框架 + spec.md + plan.md + 设计稿（如有）生成该组测试用例
3. 并行度 ≤ 3（subagent 并发限制）
4. 汇总所有分组的用例到 e2e-test-plan.md

**subagent 任务模板：**

```
你是 E2E 测试用例编写者。请为测试组 {组号}: {组名} 编写具体测试用例。

## 输入
- spec.md 路径：{spec_path}
- plan.md 路径：{plan_path}
- 设计稿路径：{如有}
- 测试组说明：{组描述和依赖关系}
- 验证层级：{Layer 1-4 中哪些}
- 前端服务启动：{启动方式}
- 后端服务启动：{启动方式}

## 要求
1. 每个用例按 TC-{组号}-{序号} 编号
2. 每个用例必须包含：测试目标、前置条件、测试步骤、期望结果、验证方法、回退影响
3. 测试步骤精确到可执行命令（curl、CDP 命令、SQL 等）
4. 验证方法从四层策略中选择（至少覆盖两层）
5. 如果涉及 UI，必须包含 DOM/A11y 验证（Layer 2）
6. 如果有设计稿，必须包含视觉对比（Layer 3）
7. 标注与其他用例的依赖关系
8. 输出 markdown 格式
```

---

## 四层验证策略

E2E 测试按以下四层组织，每层有不同的成本、速度和覆盖面。**每个测试用例至少覆盖两层**，涉及 UI 的用例必须包含 Layer 2。

```
┌─────────────────────────────────────────────────────┐
│              Layer 3: 视觉对比 (Visual)               │
│  仅用于有设计稿的关键页面                               │
│  工具: CDP 截图 + vision-analysis ui-diff                   │
│  成本: ~$0.05/次 | 速度: 秒级 | 误报率: 中高            │
├─────────────────────────────────────────────────────┤
│            Layer 2: DOM/A11y 验证 (UI)                │
│  用于所有涉及 UI 变更的用例                              │
│  工具: CDP Accessibility Tree + AI 语义断言             │
│  成本: ~$0.01/次 | 速度: 秒级 | 误报率: 低-中           │
├─────────────────────────────────────────────────────┤
│              Layer 1: API 响应 (Interface)             │
│  用于所有涉及后端接口的用例                              │
│  工具: curl + jq                                       │
│  成本: 几乎为零 | 速度: ms 级 | 误报率: 极低            │
├─────────────────────────────────────────────────────┤
│            Layer 4: 数据库/日志 (State)                │
│  用于涉及数据变更的用例                                  │
│  工具: SQL / grep 日志                                  │
│  成本: 几乎为零 | 速度: ms 级 | 误报率: 极低            │
└─────────────────────────────────────────────────────┘
```

### 何时使用哪层

| 场景 | Layer 1 (API) | Layer 2 (DOM) | Layer 3 (Visual) | Layer 4 (DB) |
|------|:---:|:---:|:---:|:---:|
| 纯后端接口（无 UI） | ✅ | - | - | ✅ |
| API + 简单 UI 变更 | ✅ | ✅ | - | 按需 |
| API + 关键页面（有设计稿） | ✅ | ✅ | ✅ | 按需 |
| 表单提交 → 数据持久化 | ✅ | ✅ | - | ✅ |
| 纯前端交互（无后端） | - | ✅ | 按需 | - |

---

## e2e-test-plan.md 文档结构

### 第一章：测试概览

```markdown
# E2E 测试计划：{需求名称}

## 测试概览

### 测试目标
{一句话概括本次 E2E 测试验证的核心功能}

### 测试范围
基于 spec.md 中的以下功能点：
- {功能点 1，引用 spec 章节号}
- {功能点 2}
- ...

### 设计稿引用
{如果 spec 中有设计稿，列出设计稿路径和对应的测试用例}

### 前置条件
- 项目代码已按 plan.md 完成（Phase 2 Stage 1 编码完成后才能执行）
- 测试环境已配置（见第二章）
- 测试数据已准备（见第二章）

### 排除范围
- {不在本次 E2E 测试范围内的功能}
```

### 第二章：测试环境配置

```markdown
## 测试环境配置

### Chrome 浏览器（Layer 2/3 必需）
```bash
# 以远程调试模式启动 Chrome（单实例模式）
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 &

# 验证 Chrome CDP 可用
curl -s http://localhost:9222/json/version | python3 -m json.tool

# 获取 WebSocket URL（后续 CDP 命令需要）
WS_URL=$(curl -s http://localhost:9222/json/list | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['webSocketDebuggerUrl'])")
echo "WS_URL=$WS_URL"
```

#### 多实例隔离模式（多个 AI 进程并行测试时）

每个 AI 进程使用独立的端口号 **和** 独立的用户数据目录。两者缺一不可：
- 不同端口 → 不同 Chrome 进程
- 不同 `--user-data-dir` → Chrome 不会复用已有实例（否则会打开新标签页到已有进程，端口串了）

```bash
# AI 进程 1 — 端口 9222
CHROME_PORT_1=9222
CHROME_DATA_1=/tmp/chrome-e2e-test-1
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=$CHROME_PORT_1 \
  --user-data-dir=$CHROME_DATA_1 \
  --no-first-run \
  --no-default-browser-check &
WS_URL_1=$(curl -s http://localhost:$CHROME_PORT_1/json/list | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['webSocketDebuggerUrl'])")

# AI 进程 2 — 端口 9223
CHROME_PORT_2=9223
CHROME_DATA_2=/tmp/chrome-e2e-test-2
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=$CHROME_PORT_2 \
  --user-data-dir=$CHROME_DATA_2 \
  --no-first-run \
  --no-default-browser-check &
WS_URL_2=$(curl -s http://localhost:$CHROME_PORT_2/json/list | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['webSocketDebuggerUrl'])")
```

| 隔离维度 | 作用 | 不设置的后果 |
|---------|------|------------|
| `--remote-debugging-port` | 区分不同 Chrome 进程的 CDP 端口 | 所有进程连到同一个 Chrome |
| `--user-data-dir` | 阻止 Chrome 复用已有实例 | Chrome 打开新标签页到已有进程，端口失效 |

**清理**：测试完成后关闭对应 Chrome 实例：
```bash
pkill -f "chrome.*--user-data-dir=$CHROME_DATA_1"
rm -rf "$CHROME_DATA_1"
```

### 前端服务
```bash
cd {前端目录} && {启动命令} --port {端口}
# 验证：curl -s http://localhost:{端口} | head -5 有输出
```

### 后端服务
```bash
cd {后端目录} && {启动命令} --port {端口}
# 验证：curl -s http://localhost:{端口}/health 返回 {"status":"ok"}
```

### 数据库初始化
```bash
cd {后端目录} && {迁移命令}
{种子数据命令}
# 验证：{SQL 查询确认初始数据}
```

### 测试数据准备
| 数据 | 创建方式 | 清理方式 |
|------|----------|----------|
| ... | ... | ... |

### 清理方式
```bash
{清理命令}
```
```

### 第三章：测试分组与依赖关系

```markdown
## 测试分组与依赖关系

### 分组列表
| 组号 | 组名 | 用例数 | 验证层级 | 说明 |
|------|------|--------|---------|------|
| G1 | {组名} | {N} | L1+L2+L3 | 有设计稿的关键页面 |
| G2 | {组名} | {N} | L1+L4 | 纯后端接口 |
| G3 | {组名} | {N} | L1+L2+L4 | API+UI+数据 |

### 依赖矩阵
| 测试组 | 前置依赖 | 说明 |
|--------|---------|------|
| G1 | 无 | 基础功能 |
| G2 | G1 | 需要 G1 创建的数据 |
| G3 | G1, G2 | 需要完整环境 |

### 执行顺序
G1 → G2 → G3
```

### 第四章：测试用例

每个测试用例按以下格式编写。**注意验证方法章节的变化——不再是勾选框，而是明确的执行命令。**

```markdown
### TC-{组号}-{序号}: {用例名称}

**测试目标**: {验证什么}

**前置条件**:
- {前置 TC 编号} 已通过
- {环境状态要求}

**测试步骤**:
1. {步骤 1：启动或准备}
2. {步骤 2：操作}
3. {步骤 3：操作}
...

**验证**:

#### Layer 1: API 响应检查
```bash
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:{port}/api/{path} \
  -H 'Content-Type: application/json' \
  -d '{body}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
[ "$HTTP_CODE" = "200" ] || echo "FAIL: expected 200, got $HTTP_CODE"
echo "$BODY" | jq -e '.id' > /dev/null || echo "FAIL: missing .id"
```

#### Layer 2: DOM/A11y 验证（如涉及 UI）
```bash
# 导航到目标页面
node {cdp_script_path} "$WS_URL" navigate "http://localhost:{port}/{path}"
# 等待页面加载
sleep 2
# 获取 Accessibility Tree 快照（浏览器计算的真实语义树）
node {cdp_script_path} "$WS_URL" Accessibility.getFullAXTree '{}'
# 精简版：只看可交互元素 + heading + 有文本的叶子
node {cdp_script_path} "$WS_URL" Accessibility.getFullAXTree '{}' | python3 -c "
import sys, json
raw = json.load(sys.stdin)
for n in raw.get('result',{}).get('nodes',[]):
    role = n.get('role',{}).get('value','')
    name = n.get('name',{}).get('value','')
    interesting = role in {'button','link','textbox','checkbox','combobox','heading','table','row','cell'}
    if not interesting and name and not n.get('childIds') and role not in ('WebArea','generic','paragraph'):
        interesting = True
    if not interesting: continue
    props = {p['name']:p['value'] for p in n.get('properties',[]) if p['name'] in ('disabled','checked','level','url')}
    parts = [n['nodeId'], role]
    if name: parts.append(repr(name))
    if props: parts.append(str(props))
    print(' '.join(str(p) for p in parts))
"
# 验证关键元素存在（基于语义角色和名称）
node {cdp_script_path} "$WS_URL" Accessibility.getFullAXTree '{}' | python3 -c "
import sys, json
raw = json.load(sys.stdin)
found = False
for n in raw.get('result',{}).get('nodes',[]):
    role = n.get('role',{}).get('value','')
    name = n.get('name',{}).get('value','')
    if role == '{expected_role}' and '{expected_text}' in (name or ''):
        print(f'FOUND: {n[\"nodeId\"]} {role} {repr(name)}')
        found = True
if not found: print('NOT FOUND: {expected_role} with text {expected_text}')
"
```

#### Layer 3: 视觉对比（如有设计稿）
```bash
# 截取实际页面
node {cdp_script_path} "$WS_URL" Page.captureScreenshot '{"format":"png"}' | python3 -c "
import sys, json, base64
r = json.load(sys.stdin)
data = r.get('result',{}).get('value','')
if data:
    with open('.xyz-harness/{topicDir}/evidence/tc-{组号}-{序号}_actual.png','wb') as f: f.write(base64.b64decode(data))
"
# 用 AI 视觉对比设计稿与实际截图
python3 scripts/zai_vision.py ui-diff \
  "{设计稿路径}" \
  ".xyz-harness/{topicDir}/evidence/tc-{组号}-{序号}_actual.png" \
  "对比设计稿和实际页面：布局结构、文字内容、颜色、间距是否一致。列出所有差异。"
```

#### Layer 4: 数据库验证（如涉及数据变更）
```bash
RESULT=$({sql_command} "SELECT count(*) FROM {table} WHERE {condition}")
[ "$RESULT" = "1" ] || echo "FAIL: expected 1 row, got $RESULT"
```

**回退影响**: 如果此用例失败，跳过：TC-{...}
**严重程度**: 阻塞 / 重要 / 一般
```

### 第五章：验证方式操作指南

为 AI agent 提供每种验证方式的完整操作手册。

---

## 验证方式详细操作指南

### Layer 1: API 响应检查

```bash
# 基本 GET 请求验证
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:{port}/api/{path})
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

# 状态码断言
[ "$HTTP_CODE" = "200" ] || { echo "FAIL: HTTP $HTTP_CODE"; exit 1; }

# 响应体字段断言（需要 jq）
echo "$BODY" | jq -e '.id' > /dev/null || echo "FAIL: missing .id"
echo "$BODY" | jq -e '.status == "success"' > /dev/null || echo "FAIL: status != success"

# POST 请求
curl -s -X POST http://localhost:{port}/api/{path} \
  -H 'Content-Type: application/json' \
  -d '{"key":"value"}'

# 带认证的请求
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:{port}/api/{path}
```

### Layer 2: DOM/A11y 验证

**核心思路**：不截图，而是获取结构化的 DOM 数据来验证 UI 状态。比截图便宜 20-50x，确定性更强。

#### 2.1 元素存在性检查

```bash
# 检查元素是否存在
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"!!document.querySelector(\"button.submit\")"}'
# 返回 true/false

# 检查元素可见性
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"(function(){var el=document.querySelector(\".user-list\");if(!el)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0})()"}'
```

#### 2.2 文本内容检查

```bash
# 检查元素文本包含指定内容
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"document.querySelector(\".user-list\")?.textContent?.includes(\"张三\") ?? false"}'

# 获取页面主要文本
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"document.body.innerText.slice(0,2000)"}'
```

#### 2.3 表单状态检查

```bash
# 检查输入框的值
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"document.querySelector(\"input[name=email]\")?.value ?? \"\""}'

# 检查 select 选中值
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"document.querySelector(\"select[name=type]\")?.value ?? \"\""}'

# 检查 checkbox 是否选中
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"document.querySelector(\"input[type=checkbox]\")?.checked ?? false"}'
```

#### 2.4 样式/布局检查

```bash
# 获取元素的计算样式
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"JSON.stringify({display:getComputedStyle(document.querySelector(\".modal\")).display,visibility:getComputedStyle(document.querySelector(\".modal\")).visibility})"}'

# 获取元素位置和尺寸
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"JSON.stringify(document.querySelector(\".sidebar\").getBoundingClientRect())"}'
```

#### 2.5 Accessibility Tree 快照（浏览器真实语义树）

```bash
# 获取完整 Accessibility Tree
node scripts/cdp.js "$WS_URL" Accessibility.getFullAXTree '{}'

# 精简版：只保留可交互元素 + heading + 文本叶子节点
node scripts/cdp.js "$WS_URL" Accessibility.getFullAXTree '{}' | python3 -c "
import sys, json
raw = json.load(sys.stdin)
for n in raw.get('result',{}).get('nodes',[]):
    role = n.get('role',{}).get('value','')
    name = n.get('name',{}).get('value','')
    interesting = role in {'button','link','textbox','checkbox','combobox','heading','table','row','cell','alert','dialog','tabpanel','menuitem'}
    if not interesting and name and not n.get('childIds') and role not in ('WebArea','generic','paragraph'):
        interesting = True
    if not interesting: continue
    props = {p['name']:p['value'] for p in n.get('properties',[]) if p['name'] in ('disabled','checked','expanded','level','url','required','invalid')}
    parts = [n['nodeId'], role]
    if name: parts.append(repr(name))
    if props: parts.append(str(props))
    print(' '.join(str(p) for p in parts))
"
```

Accessibility Tree vs walk DOM 的关键区别：
- **语义角色**：`<button>` → `button`，`<nav>` → `navigation`，`<h1>` → `heading`（浏览器推断，无需自己映射）
- **可见性过滤**：`display:none` 的元素不会出现
- **无障碍状态**：disabled/checked/expanded/focusable 等自动计算
- **可访问名称**：从 aria-label、textContent、alt、title 等来源合并计算

#### 2.6 页面交互操作

```bash
# 导航
node scripts/cdp.js "$WS_URL" navigate "http://localhost:3000/users"

# 点击按钮
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"document.querySelector(\"button.submit\")?.click(); \"clicked\""}'

# 填写表单
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"(function(){var el=document.querySelector(\"input[name=email]\");el.focus();el.value=\"test@example.com\";el.dispatchEvent(new Event(\"input\",{bubbles:true}));return \"filled\"})()"}'

# 等待文本出现
for i in $(seq 1 30); do
  found=$(node scripts/cdp.js "$WS_URL" Runtime.evaluate \
    '{"returnByValue":true,"expression":"document.body.innerText.includes(\"Success\")"}' 2>/dev/null)
  if echo "$found" | grep -q '"value":true'; then echo "Found"; break; fi
  sleep 1
done
```

### Layer 3: 视觉对比

**适用场景**：spec 中有设计稿（图片/HTML截图），需要验证实现与设计是否一致。

**为什么不用像素 diff**：像素 diff（如 BackstopJS）对动态内容、字体渲染差异极其敏感，误报率极高。AI 语义对比能理解"这是同一个按钮，只是颜色略有不同"，减少误报。

#### 3.1 截取实际页面

```bash
# 全页面截图
node scripts/cdp.js "$WS_URL" Page.captureScreenshot '{"format":"png"}' | python3 -c "
import sys, json, base64
r = json.load(sys.stdin)
data = r.get('result',{}).get('value','')
if data:
    with open('screenshot.png','wb') as f: f.write(base64.b64decode(data))
    print('Saved: screenshot.png')
"

# 指定元素截图
# 先获取元素坐标
node scripts/cdp.js "$WS_URL" Runtime.evaluate \
  '{"returnByValue":true,"expression":"JSON.stringify(document.querySelector(\".main-content\").getBoundingClientRect())"}'
# 用坐标 clip 截图（替换 x,y,width,height 为实际值）
node scripts/cdp.js "$WS_URL" Page.captureScreenshot \
  '{"format":"png","clip":{"x":0,"y":0,"width":800,"height":600,"scale":1}}'
```

#### 3.2 AI 视觉对比（vision-analysis）

```bash
# 对比设计稿和实际截图
python3 scripts/zai_vision.py ui-diff \
  "design/{设计稿文件}.png" \
  ".xyz-harness/{topicDir}/evidence/tc-{id}_actual.png" \
  "对比设计稿和实际页面：检查布局结构、文字内容、颜色、间距是否一致。列出所有差异，标注严重程度。"
```

**对比维度**（AI 会按此维度分析）：
- 布局结构：元素位置和层级关系
- 文字内容：文案是否一致
- 颜色方案：主色调是否匹配
- 间距对齐：元素间距是否合理
- 交互元素：按钮/表单/链接是否存在

#### 3.3 拼图对比（将设计稿和实际截图拼在一起对比）

当设计稿和实际截图尺寸相近时，可以拼成一张图让 AI 同时看到：

```bash
# 拼接设计稿（左）和实际截图（右）
python3 -c "
from PIL import Image
import sys
design = Image.open(sys.argv[1])
actual = Image.open(sys.argv[2])
# 统一高度
h = max(design.height, actual.height)
design = design.resize((int(design.width * h / design.height), h))
actual = actual.resize((int(actual.width * h / actual.height), h))
combined = Image.new('RGB', (design.width + actual.width + 20, h + 60), 'white')
combined.paste(design, (0, 30))
combined.paste(actual, (design.width + 20, 30))
from PIL import ImageDraw
draw = ImageDraw.Draw(combined)
draw.text((10, 5), 'Design', fill='black')
draw.text((design.width + 30, 5), 'Actual', fill='black')
combined.save(sys.argv[3])
" design.png actual.png combined.png

# 用 AI 分析拼图
python3 scripts/zai_vision.py analyze-image combined.png \
  "左图是设计稿，右图是实际实现。对比两者，列出所有视觉差异，标注严重程度（高/中/低）。"
```

#### 3.4 无设计稿时的视觉基线

如果 spec 没有设计稿，首次执行时截图作为基线保存，后续执行与基线比对：

```bash
# 首次：保存基线截图
EVIDENCE_DIR=".xyz-harness/{topicDir}/evidence"
mkdir -p "$EVIDENCE_DIR/baselines"
# 截图保存到 baselines/

# 后续：与基线比对
python3 scripts/zai_vision.py ui-diff \
  "$EVIDENCE_DIR/baselines/tc-{id}_baseline.png" \
  "$EVIDENCE_DIR/tc-{id}_actual.png" \
  "对比基线截图和当前实现，列出所有视觉变化。"
```

### Layer 4: 数据库/日志验证

```bash
# PostgreSQL
RESULT=$(psql "$DATABASE_URL" -t -A -c "SELECT count(*) FROM {table} WHERE {condition}")
[ "$RESULT" = "1" ] || echo "FAIL: expected 1 row, got $RESULT"

# SQLite
RESULT=$(sqlite3 {db_path} "SELECT count(*) FROM {table} WHERE {condition}")

# 日志检查
grep -q "操作成功" {日志路径} || echo "FAIL: missing expected log message"
```

---

## 测试结果记录格式

Phase 2 执行 E2E 测试后，结果写入 `.xyz-harness/{topicDir}/evidence/e2e-test-report.md`：

```markdown
# E2E 测试执行报告

## 执行信息
- 执行时间: {ISO 时间}
- 环境: {测试环境描述}
- Chrome 版本: {版本}

## 摘要
| 指标 | 值 |
|------|---|
| 总用例数 | X |
| 通过 (PASS) | X |
| 失败 (FAIL) | X |
| 跳过 (SKIP) | X |
| 通过率 | X% |

## 结果明细

### G1: {组名}
| TC 编号 | 用例名 | L1 API | L2 DOM | L3 Visual | L4 DB | 状态 | 耗时 | 备注 |
|---------|--------|--------|--------|-----------|-------|------|------|------|
| TC-1-01 | xxx | ✅ | ✅ | - | ✅ | PASS | 2.3s | |
| TC-1-02 | xxx | ✅ | ❌ | - | - | FAIL | 1.1s | DOM: 缺少 .error-msg 元素 |
| TC-1-03 | xxx | - | - | - | - | SKIP | - | 前置 TC-1-02 失败 |

## 失败分析

### TC-{id}: {用例名}
- **失败层级**: Layer 2 (DOM)
- **期望**: .error-msg 元素可见，包含 "请输入邮箱"
- **实际**: .error-msg 元素不存在
- **DOM 快照**: {附 accessibility tree 片段}
- **截图**: {附截图路径}
- **根因分析**: 表单验证逻辑未正确触发错误提示渲染
- **建议处理**: 回退编码修复

## 视觉对比结果
{如果有 Layer 3，列出每对对比的结论}

### TC-1-01 视觉对比
- 设计稿: design/login.png
- 实际截图: evidence/tc-1-01_actual.png
- AI 判断: {通过/有差异}
- 差异详情: {如果有差异，列出 AI 分析的具体差异}

## 结论
- [ ] 全部通过 — 可进入下一阶段
- [ ] 存在失败 — 需要回退编码修复后重新执行
```

---

## 回退规则

E2E 测试失败时的处理策略：

1. **Layer 1 (API) 失败** → 阻塞级。API 不通说明功能没实现，回退编码
2. **Layer 2 (DOM) 失败** → 阻塞级。UI 元素缺失/错误，回退编码
3. **Layer 3 (Visual) 失败** → 重要级。视觉与设计稿有差异，评估后决定是否回退：
   - 文字内容/交互元素缺失 → 回退编码
   - 间距/颜色微小差异 → 记录但不阻塞，在复盘中处理
4. **Layer 4 (DB) 失败** → 阻塞级。数据不一致，回退编码
5. **依赖链传播**：某用例失败时，自动跳过所有依赖该用例的后置用例

**重试策略**：
- 首次失败：记录错误，继续执行后续无依赖的用例
- 全部执行完毕后：汇总失败用例
- 如果仅 Layer 3 有微小视觉差异，无 Layer 1/2/4 失败 → 允许通过，标记"有条件通过"
- 如果存在 Layer 1/2/4 任何失败 → 必须回退修复

---

## 执行时机

E2E 测试在 Phase 2 Stage 4 执行，前置条件：
- Stage 1（编码实现）已完成
- Stage 2（编码评审）已通过
- Stage 3（单元测试编写）已通过
- Chrome 浏览器已以远程调试模式启动（Layer 2/3 需要）
- 前后端服务可正常启动

**CDP 脚本路径**：使用 `chrome-automation` skill 下的 `scripts/cdp.js`
**AI 视觉脚本路径**：使用 `vision-analysis` skill 下的 `scripts/zai_vision.py`

执行流程：
1. 启动 Chrome 远程调试模式
2. 按测试环境配置章节启动前后端服务
3. 初始化测试数据
4. 按依赖关系图的拓扑顺序执行测试组
5. 每个用例按验证层级逐一检查：
   - Layer 1: curl 发请求，检查状态码和响应体
   - Layer 2: CDP 获取 DOM/A11y 数据，检查元素和文本
   - Layer 3: CDP 截图 + vision-analysis 与设计稿对比
   - Layer 4: SQL 查询验证数据状态
6. 每个用例执行后立即记录结果（含各层结果）
7. 失败用例触发后置依赖用例跳过
8. 全部执行完毕后生成 e2e-test-report.md
9. 根据回退规则决定是否通过或回退
