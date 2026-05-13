#!/usr/bin/env python3
"""智谱 AI 视觉模型 CLI - 替代 @z_ai/mcp-server"""

import argparse
import base64
import json
import os
import ssl
import sys
import urllib.request
import urllib.error
from pathlib import Path

# macOS 上 Python 可能缺少 CA 证书，跳过 SSL 验证
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

API_BASE = os.environ.get("Z_AI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4/")
API_KEY = os.environ.get("Z_AI_API_KEY") or os.environ.get("ZAI_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")
MODEL = os.environ.get("Z_AI_VISION_MODEL", "glm-4.6v")
TIMEOUT = int(os.environ.get("Z_AI_TIMEOUT", "600"))

MAX_IMAGE_MB = 5
MAX_VIDEO_MB = 8
IMG_EXTS = {".jpg", ".jpeg", ".png"}
VID_EXTS = {".mp4", ".mov", ".m4v", ".avi", ".wmv", ".webm"}

MIME_MAP = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v",
    ".avi": "video/x-msvideo", ".wmv": "video/x-ms-wmv", ".webm": "video/webm",
}


def is_url(s: str) -> bool:
    return s.startswith("http://") or s.startswith("https://")


def encode_file(path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext not in MIME_MAP:
        print(f"不支持的文件格式: {ext}", file=sys.stderr)
        sys.exit(1)
    size_mb = os.path.getsize(path) / (1024 * 1024)
    limit = MAX_VIDEO_MB if ext in VID_EXTS else MAX_IMAGE_MB
    if size_mb > limit:
        print(f"文件过大: {size_mb:.1f}MB > {limit}MB", file=sys.stderr)
        sys.exit(1)
    with open(path, "rb") as f:
        return f"data:{MIME_MAP[ext]};base64,{base64.b64encode(f.read()).decode()}"


def resolve_source(source: str, is_video: bool = False) -> str:
    if is_url(source):
        return source
    if not os.path.isfile(source):
        print(f"文件不存在: {source}", file=sys.stderr)
        sys.exit(1)
    return encode_file(source)


def call_api(system_prompt: str | None, content_parts: list[dict]) -> str:
    if not API_KEY:
        print("未设置 Z_AI_API_KEY 环境变量", file=sys.stderr)
        sys.exit(1)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": content_parts})

    # 根据请求体大小估算超时：基础 300s + 每 MB base64 数据额外 30s
    body = json.dumps({
        "model": MODEL,
        "messages": messages,
        "stream": False,
        "temperature": 0.8,
        "top_p": 0.6,
        "max_tokens": 32768,
    }).encode()
    body_mb = len(body) / (1024 * 1024)
    timeout = max(TIMEOUT, 300 + int(body_mb * 30))

    req = urllib.request.Request(
        API_BASE + "chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl_ctx) as resp:
            result = json.loads(resp.read().decode())
            return result["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        err_body = e.read().decode(errors="replace")
        print(f"API 错误 {e.code}: {err_body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"请求失败: {e}", file=sys.stderr)
        sys.exit(1)


def make_image_part(url: str) -> dict:
    return {"type": "image_url", "image_url": {"url": url}}


def make_video_part(url: str) -> dict:
    return {"type": "video_url", "video_url": {"url": url}}


def make_text_part(text: str) -> dict:
    return {"type": "text", "text": text}


# ── System Prompts ──────────────────────────────────────────────

PROMPT_GENERAL = (
    "You are an advanced AI vision model with comprehensive understanding capabilities. "
    "Analyze the provided image(s) based on the user's specific requirements. "
    "Adapt your analysis style to match the request. "
    "Structure: Main Response -> Detailed Observations -> Context & Analysis -> Additional Notes."
)

PROMPT_TEXT_EXTRACT = (
    "You are a professional OCR specialist. Extract all text from the image with precision. "
    "Preserve original formatting, indentation, and structure. "
    "Distinguish ambiguous characters (1/l/I, 0/O). "
    "Structure: Extracted Text -> Content Type -> Language/Format -> OCR Corrections -> Quality Notes."
)

PROMPT_ERROR_DIAG = (
    "You are a senior debugging engineer. Analyze error screenshots, stack traces, and exception messages. "
    "Identify root cause, provide actionable solutions. "
    "Structure: Error Summary -> Root Cause Analysis -> Solution (with code) -> Prevention -> Additional Notes."
)

PROMPT_DIAGRAM = (
    "You are a software architect skilled in reading technical diagrams. "
    "Identify components, relationships, architecture patterns, and design principles. "
    "Structure: Diagram Overview -> Components -> Relationships & Data Flow -> Architecture Analysis -> Textual Representation."
)

PROMPT_DATA_VIZ = (
    "You are a data analyst expert in interpreting data visualizations. "
    "Extract key metrics, trends, anomalies, and actionable recommendations. "
    "Structure: Visualization Summary -> Key Metrics -> Trends & Patterns -> Anomalies & Insights -> Actionable Recommendations."
)

PROMPT_UI_DIFF = (
    "You are a senior QA engineer performing systematic UI comparison. "
    "Compare layout, spacing, colors, fonts, interactive elements, and content between two screenshots. "
    "Structure: Overall Assessment (with match %) -> Detailed Differences (CRITICAL/HIGH/MEDIUM/LOW) "
    "-> Layout Issues -> Content Issues -> Styling Issues -> Recommended Fixes (with CSS) -> Testing Notes."
)

PROMPT_UI_CODE = (
    "You are an expert frontend engineer. Generate pixel-perfect HTML/CSS code from the UI screenshot. "
    "Use modern CSS (flexbox/grid), semantic HTML, and inline styles for portability. "
    "Match colors, spacing, typography, and layout as closely as possible."
)

PROMPT_UI_PROMPT = (
    "You are an AI prompt engineer. Reverse-engineer the UI in the image to create a detailed prompt "
    "that could recreate this UI in another AI tool. Describe layout, colors, components, interactions."
)

PROMPT_UI_SPEC = (
    "You are a design system architect. Generate a comprehensive design specification document "
    "including design tokens (colors, typography, spacing), component definitions, layout rules, and interaction patterns."
)

PROMPT_UI_DESC = (
    "You are a UX writer. Provide a clear, natural language description of the UI in the image. "
    "Describe the layout, purpose, user flow, and key interactive elements."
)

UI_PROMPTS = {"code": PROMPT_UI_CODE, "prompt": PROMPT_UI_PROMPT, "spec": PROMPT_UI_SPEC, "description": PROMPT_UI_DESC}


# ── 子命令实现 ──────────────────────────────────────────────────

def cmd_analyze_image(args):
    url = resolve_source(args.image_source)
    parts = [make_image_part(url), make_text_part(args.prompt)]
    print(call_api(PROMPT_GENERAL, parts))


def cmd_analyze_video(args):
    url = resolve_source(args.video_source, is_video=True)
    parts = [make_video_part(url), make_text_part(args.prompt)]
    print(call_api(None, parts))


def cmd_extract_text(args):
    url = resolve_source(args.image_source)
    prompt = args.prompt
    if args.programming_language:
        prompt += f"\n<language_hint>The code is in {args.programming_language}.</language_hint>"
    parts = [make_image_part(url), make_text_part(prompt)]
    print(call_api(PROMPT_TEXT_EXTRACT, parts))


def cmd_diagnose_error(args):
    url = resolve_source(args.image_source)
    prompt = args.prompt
    if args.context:
        prompt += f"\n<error_context>This error occurred {args.context}.</error_context>"
    parts = [make_image_part(url), make_text_part(prompt)]
    print(call_api(PROMPT_ERROR_DIAG, parts))


def cmd_understand_diagram(args):
    url = resolve_source(args.image_source)
    prompt = args.prompt
    if args.diagram_type:
        prompt += f"\n<diagram_type_hint>This is a {args.diagram_type} diagram.</diagram_type_hint>"
    parts = [make_image_part(url), make_text_part(prompt)]
    print(call_api(PROMPT_DIAGRAM, parts))


def cmd_analyze_chart(args):
    url = resolve_source(args.image_source)
    prompt = args.prompt
    if args.focus:
        prompt += f"\n<analysis_focus>Focus particularly on: {args.focus}.</analysis_focus>"
    parts = [make_image_part(url), make_text_part(prompt)]
    print(call_api(PROMPT_DATA_VIZ, parts))


def cmd_ui_diff(args):
    exp_url = resolve_source(args.expected)
    act_url = resolve_source(args.actual)
    prompt = (
        "<images>The first image is the EXPECTED/REFERENCE design (the target). "
        "The second image is the ACTUAL/CURRENT implementation (what needs to be checked).</images>\n"
        + args.prompt
    )
    parts = [make_image_part(exp_url), make_image_part(act_url), make_text_part(prompt)]
    print(call_api(PROMPT_UI_DIFF, parts))


def cmd_ui_to_artifact(args):
    url = resolve_source(args.image_source)
    system = UI_PROMPTS.get(args.output_type, PROMPT_UI_DESC)
    parts = [make_image_part(url), make_text_part(args.prompt)]
    print(call_api(system, parts))


# ── CLI 入口 ────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="智谱 AI 视觉模型 CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    # analyze-image
    p = sub.add_parser("analyze-image", help="通用图像分析")
    p.add_argument("image_source", help="图片路径或 URL")
    p.add_argument("prompt", help="分析需求描述")
    p.set_defaults(func=cmd_analyze_image)

    # analyze-video
    p = sub.add_parser("analyze-video", help="视频分析")
    p.add_argument("video_source", help="视频路径或 URL (MP4/MOV/M4V, max 8MB)")
    p.add_argument("prompt", help="分析/提取/理解的文本提示")
    p.set_defaults(func=cmd_analyze_video)

    # extract-text
    p = sub.add_parser("extract-text", help="OCR 文本提取")
    p.add_argument("image_source", help="截图路径或 URL")
    p.add_argument("prompt", help="提取指令和格式要求")
    p.add_argument("--lang", dest="programming_language", help="编程语言提示 (python/javascript 等)")
    p.set_defaults(func=cmd_extract_text)

    # diagnose-error
    p = sub.add_parser("diagnose-error", help="错误截图诊断")
    p.add_argument("image_source", help="错误截图路径或 URL")
    p.add_argument("prompt", help="需要帮助的错误描述")
    p.add_argument("--context", help="错误发生场景 (如 'during npm install')")
    p.set_defaults(func=cmd_diagnose_error)

    # understand-diagram
    p = sub.add_parser("understand-diagram", help="技术图表分析")
    p.add_argument("image_source", help="图表路径或 URL")
    p.add_argument("prompt", help="想要理解或提取的内容")
    p.add_argument("--type", dest="diagram_type", help="图表类型 (architecture/flowchart/uml/er-diagram/sequence)")
    p.set_defaults(func=cmd_understand_diagram)

    # analyze-chart
    p = sub.add_parser("analyze-chart", help="数据可视化分析")
    p.add_argument("image_source", help="图表路径或 URL")
    p.add_argument("prompt", help="想要提取的洞察")
    p.add_argument("--focus", help="分析焦点 (trends/anomalies/comparisons/performance metrics)")
    p.set_defaults(func=cmd_analyze_chart)

    # ui-diff
    p = sub.add_parser("ui-diff", help="UI 对比检查")
    p.add_argument("expected", help="预期/参考设计图路径或 URL")
    p.add_argument("actual", help="实际实现截图路径或 URL")
    p.add_argument("prompt", help="对比指令")
    p.set_defaults(func=cmd_ui_diff)

    # ui-to-artifact
    p = sub.add_parser("ui-to-artifact", help="UI 截图转代码/规格")
    p.add_argument("image_source", help="UI 截图路径或 URL")
    p.add_argument("output_type", choices=["code", "prompt", "spec", "description"], help="输出类型")
    p.add_argument("prompt", help="生成内容的详细指令")
    p.set_defaults(func=cmd_ui_to_artifact)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
