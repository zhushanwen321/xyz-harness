---
name: vision-analysis
description: "图像/视频理解和分析工具。整合智谱 GLM-4.6V 和 MiniMax VLM 两个视觉引擎，优先使用智谱（功能更丰富、有专用子命令），MiniMax 作为 fallback。当需要分析图片、视频、UI 截图转代码、OCR 提取文字、错误截图诊断、技术图表理解、数据可视化分析、UI 对比检查时使用此 skill。即使用户只是说'看看这个截图'、'图片里写了什么'、'这个界面怎么样'、'帮我分析下这个报错'、'把设计稿转成代码'，也应触发此 skill。"
---

# Vision Analysis — 双引擎图像/视频理解

整合两个视觉引擎，按优先级自动选择：

1. **智谱 GLM-4.6V**（优先）— 8 个专用子命令，内置优化的 system prompt，支持视频和双图对比
2. **MiniMax VLM**（fallback）— 通用图像描述，配额 150次/日，适合智谱失败或配额不足时使用

## 决策流程

```
需要分析图片/视频？
├── 视频分析 → 只能用智谱 analyze-video
├── UI 对比（两张图） → 只能用智谱 ui-diff
├── UI 转代码/规格 → 只能用智谱 ui-to-artifact
├── 其他图片分析 → 先尝试智谱，失败则 fallback 到 mmx vision
```

---

## 智谱 GLM-4.6V（优先）

CLI 脚本：`scripts/zai_vision.py`（相对本 skill 目录）

### 子命令速查

| 任务 | 命令 |
|---|---|
| 通用图像分析 | `python3 scripts/zai_vision.py analyze-image <图片> "<需求>"` |
| 视频分析 | `python3 scripts/zai_vision.py analyze-video <视频> "<需求>"` |
| OCR 文字提取 | `python3 scripts/zai_vision.py extract-text <截图> "<指令>" [--lang python]` |
| 错误截图诊断 | `python3 scripts/zai_vision.py diagnose-error <截图> "<描述>" [--context "场景"]` |
| 技术图表分析 | `python3 scripts/zai_vision.py understand-diagram <图表> "<需求>" [--type architecture]` |
| 数据可视化 | `python3 scripts/zai_vision.py analyze-chart <图表> "<需求>" [--focus trends]` |
| UI 对比 | `python3 scripts/zai_vision.py ui-diff <期望图> <实际图> "<指令>"` |
| UI 转代码/规格 | `python3 scripts/zai_vision.py ui-to-artifact <截图> <类型> "<指令>"` |

UI 转代码的 `<类型>`：`code` / `prompt` / `spec` / `description`

### 限制

- 图片：5MB（jpg/jpeg/png）
- 视频：8MB（MP4/MOV/M4V/AVI/WMV/WebM）
- 环境变量：`Z_AI_API_KEY`（必需）

---

## MiniMax VLM（Fallback）

当智谱调用失败（API 错误、超时、配额耗尽）时使用。

```bash
mmx vision describe --image <路径或URL> --prompt "<问题>" --non-interactive --quiet
```

MiniMax 的优势：
- 无文件大小限制（自动 base64 编码）
- 支持更多图片格式（gif、webp 等）
- 配额 150次/日、15000次/周
- `--output json` 支持结构化输出

---

## 按场景的使用指引

### 通用图片分析

```bash
# 优先智谱
python3 scripts/zai_vision.py analyze-image photo.png "描述图片内容"
```

### OCR 文字提取

```bash
# 智谱有专用 OCR prompt，效果好
python3 scripts/zai_vision.py extract-text screenshot.png "提取所有文字" --lang python

# Fallback
mmx vision describe --image screenshot.png --prompt "请完整提取图片中的所有文字，保持原始格式" --quiet
```

### 错误截图诊断

```bash
# 智谱有专用错误诊断 system prompt，会给出根因和修复方案
python3 scripts/zai_vision.py diagnose-error error.png "构建失败" --context "npm install"

# Fallback
mmx vision describe --image error.png --prompt "分析这个错误截图：1)错误类型 2)根因 3)排查步骤" --quiet
```

### 架构图/流程图

```bash
# 智谱支持图表类型提示
python3 scripts/zai_vision.py understand-diagram arch.png "解释系统架构" --type architecture

# Fallback
mmx vision describe --image arch.png --prompt "分析这个架构图，列出所有组件、连接和数据流" --quiet
```

### 数据图表

```bash
# 智谱支持分析焦点
python3 scripts/zai_vision.py analyze-chart chart.png "提取关键指标" --focus trends

# Fallback
mmx vision describe --image chart.png --prompt "分析图表：类型、趋势、关键数值、异常点" --quiet
```

### UI 对比（仅智谱）

```bash
python3 scripts/zai_vision.py ui-diff design.png impl.png "检查布局和颜色差异"
```

智谱会自动处理双图对比，输出 CRITICAL/HIGH/MEDIUM/LOW 级别的差异和 CSS 修复建议。

### UI 截图转代码（仅智谱）

```bash
# 转前端代码
python3 scripts/zai_vision.py ui-to-artifact mockup.png code "生成 Vue 3 组件代码"

# 转设计规格
python3 scripts/zai_vision.py ui-to-artifact mockup.png spec "生成完整设计规格"

# 转 AI 提示词
python3 scripts/zai_vision.py ui-to-artifact mockup.png prompt "生成可复现此 UI 的提示词"
```

### 视频分析（仅智谱）

```bash
python3 scripts/zai_vision.py analyze-video demo.mp4 "描述视频中的关键操作步骤"
```

---

## 与 Claude read 工具的边界

Claude 的 `read` 工具也能读取图片。以下场景应使用本 skill 而非 read：

- 中文内容的深度理解（zai 和 mmx 的中文能力更强）
- OCR 文字提取（专用 prompt 精度更高）
- 结构化分析（指定分析维度和输出格式）
- 视频、双图对比、UI 转代码（read 做不到）
- 同一图片多角度提问（每次可自定义 prompt）

简单看一眼图片内容、Claude 能直接回答的视觉问题，用 read 即可。

---

## 环境配置

| 工具 | 配置方式 | 配置文件 |
|---|---|---|
| 智谱 | `export Z_AI_API_KEY=xxx` | 环境变量 |
| MiniMax | `mmx auth login --api-key xxx` | `~/.mmx/config.json` |

验证：
```bash
echo $Z_AI_API_KEY          # 智谱
mmx auth status             # MiniMax
```

## 错误处理

智谱失败时的 fallback 模式：

```bash
# 先尝试智谱
python3 scripts/zai_vision.py analyze-image photo.png "分析内容" 2>/dev/null
if [ $? -ne 0 ]; then
  # Fallback 到 MiniMax
  mmx vision describe --image photo.png --prompt "分析内容" --non-interactive --quiet
fi
```

智谱常见错误：
- `未设置 Z_AI_API_KEY` → 检查环境变量
- `文件过大` → 超过 5MB（图片）/ 8MB（视频），改用 mmx vision（无大小限制）
- `API 错误` → 账号/配额问题，fallback 到 mmx

MiniMax 常见退出码：2=参数错误, 3=认证错误, 4=配额耗尽, 10=内容过滤
