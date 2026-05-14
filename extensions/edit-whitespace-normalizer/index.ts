/**
 * Edit 空白字符归一化插件
 *
 * Pi 全局扩展，拦截 edit/write 工具的 tool_call 事件，自动修正行首空白字符，
 * 使 oldText/newText 的缩进风格与目标文件一致。
 *
 * 安装位置：~/.pi/agent/extensions/edit-whitespace-normalizer/index.ts
 * 自动发现，无需手动注册，重启 Pi 或 /reload 后生效。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

// ═══════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════

interface IndentStyle {
  type: "tab" | "space";
  /** For space: indent_size (e.g. 2, 4); for tab: 1 (each tab = 1 level) */
  size: number;
}

interface ParsedSection {
  glob: string;
  indent_style?: string;
  indent_size?: number;
}

interface ParsedEditorConfig {
  root: boolean;
  sections: ParsedSection[];
}

/** Indent style detected per file/project */
interface FileIndentCacheEntry {
  style: IndentStyle;
  /** Whether the style came from .editorconfig (true) or heuristic (false) */
  fromEditorConfig: boolean;
}

interface SkipCache {
  [projectRoot: string]: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const SKIP_CACHE_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || "/tmp",
  ".pi/agent/cache/skip-editorconfig-projects.json",
);

const LANGUAGE_DEFAULTS: Record<string, IndentStyle> = {
  ".py": { type: "space", size: 4 },
  ".go": { type: "tab", size: 1 },
  ".java": { type: "space", size: 4 },
  ".rb": { type: "space", size: 2 },
  ".rs": { type: "space", size: 4 },
  ".c": { type: "space", size: 4 },
  ".cpp": { type: "space", size: 4 },
  ".h": { type: "space", size: 4 },
  ".hpp": { type: "space", size: 4 },
  ".kt": { type: "space", size: 4 },
  ".swift": { type: "space", size: 4 },
  ".cs": { type: "space", size: 4 },
  // Default: { type: 'space', size: 2 } (handled in getLanguageDefault)
};

/** 特殊文件名 → 强制缩进风格。Makefile 语法要求必须使用 Tab。 */
const SPECIAL_FILE_NAMES: Record<string, IndentStyle> = {
  Makefile: { type: "tab", size: 1 },
  Dockerfile: { type: "space", size: 4 },
};

// ═══════════════════════════════════════════════════════════════════
// Task 1: Core Whitespace Conversion
// ═══════════════════════════════════════════════════════════════════

function convertLeadingWhitespaceOneLine(
  line: string,
  fromStyle: IndentStyle,
  toStyle: IndentStyle,
): string {
  // Use [\s\S] instead of . to match \r (CR) characters
  const match = line.match(/^([\t ]*)([\s\S]*)$/);
  if (!match) return line;

  const leading = match[1]!;
  const rest = match[2]!;

  if (leading.length === 0) return line;

  let srcLevel: number;
  let srcRemainder: number;

  if (fromStyle.type === "tab") {
    let tabCount = 0;
    let spaceCount = 0;
    for (const ch of leading) {
      if (ch === "\t") tabCount++;
      else spaceCount++;
    }
    srcLevel = tabCount;
    srcRemainder = spaceCount;
  } else {
    // Normalize actual tab characters to spaces before computing level
    const normalizedLeading = leading.replace(/\t/g, " ".repeat(fromStyle.size));
    srcLevel = Math.floor(normalizedLeading.length / fromStyle.size);
    srcRemainder = normalizedLeading.length % fromStyle.size;
  }

  let rebuilt: string;
  if (toStyle.type === "tab") {
    rebuilt = "\t".repeat(srcLevel) + " ".repeat(srcRemainder);
  } else {
    rebuilt = " ".repeat(srcLevel * toStyle.size + srcRemainder);
  }

  return rebuilt + rest;
}

/**
 * 转换多段文本中每一行的行首空白。
 */
function convertLeadingWhitespace(
  text: string,
  fromStyle: IndentStyle,
  toStyle: IndentStyle,
): string {
  // Always run conversion; text may have whitespace not matching declared styles.
  // For example, from={space,4} to={space,4} but text has 2-space indentation.
  // The function is fast (<1ms for typical edit content) so no early return needed.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  return lines
    .map((line) => convertLeadingWhitespaceOneLine(line, fromStyle, toStyle))
    .join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function gcdOfArray(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((acc, n) => gcd(acc, n));
}

function getLanguageDefault(ext: string, name: string): IndentStyle {
  if (SPECIAL_FILE_NAMES[name]) return SPECIAL_FILE_NAMES[name]!;
  if (LANGUAGE_DEFAULTS[ext]) return LANGUAGE_DEFAULTS[ext]!;
  return { type: "space", size: 2 };
}

function resolveFileInfo(
  filePath: string,
  cwd: string,
): { absolutePath: string; projectRoot: string; ext: string; name: string; relativePath: string } {
  const absolutePath = path.resolve(cwd, filePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const name = path.basename(absolutePath);

  let projectRoot = cwd;
  let dir = path.dirname(absolutePath);
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      projectRoot = dir;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const relativePath = path.relative(projectRoot, absolutePath);

  return { absolutePath, projectRoot, ext, name, relativePath };
}

// ═══════════════════════════════════════════════════════════════════
// Task 3: Heuristic Indentation Detection
// ═══════════════════════════════════════════════════════════════════

/**
 * 从文件内容启发式检测缩进风格。
 * 最多扫描 500 行非空缩进行，避免大文件性能问题。
 */
function detectIndentFromContent(content: string): IndentStyle | null {
  const lines = content.split("\n");
  let tabLines = 0;
  let spaceLines = 0;
  const spaceLengths: number[] = [];
  const MAX_SCAN_LINES = 500;
  let indentedLineCount = 0;

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    if (indentedLineCount >= MAX_SCAN_LINES) break;
    const leadingMatch = line.match(/^([\t ]*)/);
    if (!leadingMatch) continue;
    const leading = leadingMatch[1]!;
    if (leading.length === 0) continue;

    indentedLineCount++;
    if (leading[0] === "\t") {
      tabLines++;
    } else {
      spaceLines++;
      spaceLengths.push(leading.length);
    }
  }

  if (tabLines === 0 && spaceLines === 0) return null;

  if (tabLines > spaceLines) {
    return { type: "tab", size: 1 };
  }

  if (spaceLines > 0) {
    const indentSize = gcdOfArray(spaceLengths);
    return indentSize < 2 ? { type: "space", size: 2 } : { type: "space", size: indentSize };
  }

  return { type: "tab", size: 1 };
}

/**
 * 从文件内容或语言默认值检测缩进风格。
 */
function detectIndentFromFile(
  absolutePath: string,
  ext: string,
  name: string,
): IndentStyle {
  if (SPECIAL_FILE_NAMES[name]) return SPECIAL_FILE_NAMES[name]!;

  try {
    const content = fs.readFileSync(absolutePath, "utf-8");
    if (content.length > 0) {
      const detected = detectIndentFromContent(content);
      if (detected) return detected;
    }
  } catch {
    // File unreadable → fall through
  }

  return getLanguageDefault(ext, name);
}

// ═══════════════════════════════════════════════════════════════════
// Task 2: .editorconfig Parser
// ═══════════════════════════════════════════════════════════════════

function simpleGlobMatch(pattern: string, filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");

  let regexStr = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        regexStr += ".*";
        i += 2;
        if (pattern[i] === "/") i++;
      } else {
        regexStr += "[^/]*";
        i++;
      }
    } else if (ch === "\\") {
      // Escape: next character is literal
      i++;
      if (i < pattern.length) {
        regexStr += pattern[i]!;
        i++;
      }
    } else if (/[.+\^${}()\[\]?]/.test(ch)) {
      regexStr += "\\" + ch;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  regexStr += "$";

  try {
    return new RegExp(regexStr).test(normalizedPath);
  } catch {
    return false;
  }
}

/**
 * 解析 .editorconfig 文件内容。
 */
function parseEditorConfig(filePath: string): ParsedEditorConfig | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseEditorConfigContent(content);
  } catch {
    return null;
  }
}

function parseEditorConfigContent(content: string): ParsedEditorConfig {
  const result: ParsedEditorConfig = { root: false, sections: [] };
  let currentSection: ParsedSection | null = null;

  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      if (currentSection) result.sections.push(currentSection);
      currentSection = { glob: sectionMatch[1]! };
      continue;
    }

    // Must be a key-value line
    const kvMatch = line.match(/^([\w_]+)\s*[=:]\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1]!.toLowerCase();
    const value = kvMatch[2]!.trim();

    if (key === "root") {
      // root is a global setting, valid outside any section
      result.root = value.toLowerCase() === "true";
    } else if (currentSection) {
      // indent_style and indent_size are section-level settings
      if (key === "indent_style") {
        currentSection.indent_style = value.toLowerCase();
      } else if (key === "indent_size") {
        const parsed = parseInt(value, 10);
        currentSection.indent_size = isNaN(parsed) ? undefined : parsed;
      }
    }
  }

  if (currentSection) result.sections.push(currentSection);
  return result;
}

/**
 * 根据文件路径匹配 .editorconfig 段。
 */
function matchEditorConfig(
  parsed: ParsedEditorConfig,
  filePath: string,
): { indent_style?: string; indent_size?: number } {
  const result: { indent_style?: string; indent_size?: number } = {};
  const normalizedPath = filePath.replace(/\\/g, "/");

  for (const section of parsed.sections) {
    if (simpleGlobMatch(section.glob, normalizedPath)) {
      if (section.indent_style !== undefined) result.indent_style = section.indent_style;
      if (section.indent_size !== undefined) result.indent_size = section.indent_size;
    }
  }

  return result;
}

function editorConfigToIndentStyle(
  config: { indent_style?: string; indent_size?: number },
): IndentStyle | null {
  if (!config.indent_style) return null;
  if (config.indent_style === "tab") return { type: "tab", size: 1 };
  return { type: "space", size: config.indent_size || 2 };
}

// ═══════════════════════════════════════════════════════════════════
// Indent Style Resolution
// ═══════════════════════════════════════════════════════════════════

function resolveFileIndentStyle(
  fileInfo: { absolutePath: string; projectRoot: string; ext: string; name: string; relativePath: string },
  editorConfigParsed: ParsedEditorConfig | null,
): { style: IndentStyle; fromEditorConfig: boolean } {
  if (editorConfigParsed) {
    // Match against relative path (e.g. "src/app.ts") for directory-based glob patterns
    const matched = matchEditorConfig(editorConfigParsed, fileInfo.relativePath);
    const ecStyle = editorConfigToIndentStyle(matched);
    if (ecStyle) return { style: ecStyle, fromEditorConfig: true };
    // Fallback: match against basename for simple patterns like "*.py" or "Makefile"
    const matchedFallback = matchEditorConfig(editorConfigParsed, fileInfo.name);
    const ecFallbackStyle = editorConfigToIndentStyle(matchedFallback);
    if (ecFallbackStyle) return { style: ecFallbackStyle, fromEditorConfig: true };
  }

  const style = detectIndentFromFile(fileInfo.absolutePath, fileInfo.ext, fileInfo.name);
  return { style, fromEditorConfig: false };
}

function getOldTextFromStyle(fileStyle: IndentStyle): IndentStyle {
  if (fileStyle.type === "tab") {
    return { type: "space", size: 4 }; // Default tab rendering width
  }
  return fileStyle;
}

/** AI's default indentation style for new code generation. */
const AI_DEFAULT_STYLE: IndentStyle = { type: "space", size: 4 };

function getNewTextTargetStyle(
  fileStyle: IndentStyle,
  editorConfigParsed: ParsedEditorConfig | null,
  fileInfo: { name: string; relativePath: string },
): IndentStyle {
  if (editorConfigParsed) {
    // Try relative path first (for directory-based patterns), then basename fallback
    const matched = matchEditorConfig(editorConfigParsed, fileInfo.relativePath);
    const ecStyle = editorConfigToIndentStyle(matched);
    if (ecStyle) return ecStyle;
    const matchedFallback = matchEditorConfig(editorConfigParsed, fileInfo.name);
    const ecFallbackStyle = editorConfigToIndentStyle(matchedFallback);
    if (ecFallbackStyle) return ecFallbackStyle;
  }
  return fileStyle;
}

// ═══════════════════════════════════════════════════════════════════
// Skip Cache (persistent)
// ═══════════════════════════════════════════════════════════════════

function loadSkipCache(): SkipCache {
  try {
    const dir = path.dirname(SKIP_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(SKIP_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(SKIP_CACHE_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function saveSkipCache(cache: SkipCache): void {
  try {
    const dir = path.dirname(SKIP_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SKIP_CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
  } catch { /* best-effort */ }
}

// ═══════════════════════════════════════════════════════════════════
// .editorconfig Auto-Create
// ═══════════════════════════════════════════════════════════════════

function findFilesWithExtension(
  rootDir: string,
  ext: string,
  maxFiles: number,
  visited?: Set<string>,
): string[] {
  const results: string[] = [];
  try {
    // Symlink cycle guard: resolve real path and track visited set
    const realPath = fs.realpathSync(rootDir);
    visited ??= new Set<string>();
    if (visited.has(realPath)) return [];
    visited.add(realPath);

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (entry.name.startsWith(".") || entry.name === "node_modules" ||
          entry.name === "target" || entry.name === "build" ||
          entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findFilesWithExtension(fullPath, ext, maxFiles - results.length, visited));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
  } catch { /* ignore */ }
  return results;
}

function scanProjectIndentStyle(projectRoot: string): IndentStyle | null {
  const scanExtensions = [".ts", ".js", ".py", ".rs", ".go", ".java", ".rb", ".vue", ".c", ".cpp", ".h"];
  const styleCounts: { type: "tab" | "space"; size: number; count: number }[] = [];

  for (const ext of scanExtensions) {
    try {
      const files = findFilesWithExtension(projectRoot, ext, 5);
      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        const detected = detectIndentFromContent(content);
        if (detected) {
          const existing = styleCounts.find(
            (s) => s.type === detected.type && s.size === detected.size,
          );
          if (existing) existing.count++;
          else styleCounts.push({ ...detected, count: 1 });
        }
      }
    } catch { /* skip */ }
  }

  let bestStyle: IndentStyle | null = null;
  let bestCount = 0;
  for (const s of styleCounts) {
    if (s.count > bestCount) {
      bestStyle = { type: s.type, size: s.size };
      bestCount = s.count;
    }
  }

  return bestStyle;
}

function generateEditorConfigTemplate(style: IndentStyle): string {
  const lines: string[] = [
    "root = true",
    "",
    "[*]",
    `indent_style = ${style.type}`,
  ];
  if (style.type === "space") {
    lines.push(`indent_size = ${style.size}`);
  }
  lines.push(
    "end_of_line = lf",
    "charset = utf-8",
    "trim_trailing_whitespace = true",
    "insert_final_newline = true",
    "",
    "[*.py]",
    "indent_size = 4",
    "",
    "[Makefile]",
    "indent_style = tab",
    "",
  );
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// Extension Factory
// ═══════════════════════════════════════════════════════════════════

export default function editWhitespaceNormalizer(pi: ExtensionAPI) {
  // ── Session-level caches ──
  const editorConfigCache = new Map<string, ParsedEditorConfig | null>();
  const fileIndentCache = new Map<string, FileIndentCacheEntry>();
  const promptedProjects = new Set<string>();
  const projectStyleCache = new Map<string, IndentStyle>();
  let skipCache: SkipCache = loadSkipCache();

  // ── Cache helpers ──

  function getOrParseEditorConfig(projectRoot: string): ParsedEditorConfig | null {
    if (editorConfigCache.has(projectRoot)) {
      return editorConfigCache.get(projectRoot)!;
    }
    const editorConfigPath = path.join(projectRoot, ".editorconfig");
    const parsed = parseEditorConfig(editorConfigPath);
    editorConfigCache.set(projectRoot, parsed);
    return parsed;
  }

  function getOrDetectFileIndent(
    fileInfo: { absolutePath: string; ext: string; name: string; projectRoot: string; relativePath: string },
    editorConfigParsed: ParsedEditorConfig | null,
  ): FileIndentCacheEntry {
    const cached = fileIndentCache.get(fileInfo.absolutePath);
    if (cached) return cached;

    const entry = resolveFileIndentStyle(fileInfo, editorConfigParsed);
    fileIndentCache.set(fileInfo.absolutePath, entry);
    return entry;
  }

  // ── Prompt: auto-create .editorconfig ──

  async function promptCreateEditorConfig(ctx: any, projectRoot: string): Promise<void> {
    let detectedStyle = projectStyleCache.get(projectRoot);
    if (!detectedStyle) {
      detectedStyle = scanProjectIndentStyle(projectRoot) ?? { type: "space", size: 2 };
      projectStyleCache.set(projectRoot, detectedStyle);
    }

    const styleLabel = detectedStyle.type === "tab" ? "Tab" : `${detectedStyle.size} 空格`;

  try {
    const CREATE = `确认创建 ✓  检测到缩进风格：${styleLabel}`;
    const SKIP = "跳过本次";
    const SKIP_FOREVER = "永久跳过此项目";

    const choice = await ctx.ui.select(
    "项目没有 .editorconfig（跨编辑器的缩进约定文件）",
    [CREATE, SKIP, SKIP_FOREVER],
    );

    if (choice === CREATE) {
        const template = generateEditorConfigTemplate(detectedStyle);
        const ecPath = path.join(projectRoot, ".editorconfig");
        fs.writeFileSync(ecPath, template, "utf-8");

        const parsed = parseEditorConfig(ecPath);
        editorConfigCache.set(projectRoot, parsed);
        // Invalidate only cache entries for this project root
        const cachePrefix = path.join(projectRoot, path.sep);
        for (const key of fileIndentCache.keys()) {
          if (key.startsWith(cachePrefix)) fileIndentCache.delete(key);
        }

        ctx.ui.notify(`.editorconfig 已创建: ${ecPath}`, "success");
    } else if (choice === SKIP_FOREVER) {
        skipCache[projectRoot] = true;
        saveSkipCache(skipCache);
        ctx.ui.notify("已永久跳过此项目。如需恢复，请删除缓存文件。", "info");
      }
      // "skip" → do nothing, promptedProjects set handles it
    } catch {
      // Non-interactive mode → soft fallback
    }
  }

  // ── Tool Call Interception ──

  pi.on("tool_call", async (event, ctx) => {
    // ── Handle edit tool ──
    if (isToolCallEventType("edit", event)) {
      const input = event.input;
      if (!input.path) return;

      const cwd = ctx.cwd || ".";
      const fileInfo = resolveFileInfo(input.path, cwd);

      // Check permanent skip
      if (skipCache[fileInfo.projectRoot]) return;

      // Resolve .editorconfig
      const editorConfigParsed = getOrParseEditorConfig(fileInfo.projectRoot);

      // Prompt for .editorconfig creation if missing
      if (editorConfigParsed === null && !promptedProjects.has(fileInfo.projectRoot)) {
        promptedProjects.add(fileInfo.projectRoot);
        await promptCreateEditorConfig(ctx, fileInfo.projectRoot);
        // Re-read cache after potential creation
        // (promptCreateEditorConfig updates the cache if .editorconfig was created)
      }

      // Get file indent style (re-read cache in case .editorconfig was just created)
      const currentECParsed = getOrParseEditorConfig(fileInfo.projectRoot);
      const { style: fileStyle } = getOrDetectFileIndent(fileInfo, currentECParsed);

      // Determine conversion styles
      const oldTextFromStyle = getOldTextFromStyle(fileStyle);
      const oldTextToStyle = fileStyle;
      const newTextFromStyle = AI_DEFAULT_STYLE;
      const newTextToStyle = getNewTextTargetStyle(fileStyle, currentECParsed, fileInfo);

      // Handle both modern format (edits[]) and old format (top-level oldText/newText)
      const edits = input.edits || [];

      if (edits.length > 0) {
        // Modern format: { path, edits: [{ oldText, newText }] }
        for (const edit of edits) {
          if (edit.oldText) {
            edit.oldText = convertLeadingWhitespace(edit.oldText, oldTextFromStyle, oldTextToStyle);
          }
          if (edit.newText) {
            edit.newText = convertLeadingWhitespace(edit.newText, newTextFromStyle, newTextToStyle);
          }
        }
      } else if (input.oldText !== undefined || input.newText !== undefined) {
        // Old format: { path, oldText, newText } — mutate top-level fields
        console.warn("[edit-whitespace-normalizer] Detected old-format edit (top-level oldText/newText)");
        if (input.oldText) {
          (input as any).oldText = convertLeadingWhitespace(input.oldText, oldTextFromStyle, oldTextToStyle);
        }
        if (input.newText) {
          (input as any).newText = convertLeadingWhitespace(input.newText, newTextFromStyle, newTextToStyle);
        }
      }

      return; // Don't block
    }

    // ── Handle write tool ──
    if (isToolCallEventType("write", event)) {
      const input = event.input;
      if (!input.path || !input.content) return;

      const cwd = ctx.cwd || ".";
      const fileInfo = resolveFileInfo(input.path, cwd);

      if (skipCache[fileInfo.projectRoot]) return;

      const editorConfigParsed = getOrParseEditorConfig(fileInfo.projectRoot);

      let targetStyle: IndentStyle | null = null;

      if (fs.existsSync(fileInfo.absolutePath)) {
        // Existing file → detect its style
        const { style } = getOrDetectFileIndent(fileInfo, editorConfigParsed);
        targetStyle = style;
      }

      if (!targetStyle) {
        // New file → use .editorconfig or language default
        if (editorConfigParsed) {
          // Try relative path first, then basename fallback
          const matched = matchEditorConfig(editorConfigParsed, fileInfo.relativePath);
          targetStyle = editorConfigToIndentStyle(matched);
          if (!targetStyle) {
            const matchedFallback = matchEditorConfig(editorConfigParsed, fileInfo.name);
            targetStyle = editorConfigToIndentStyle(matchedFallback);
          }
        }
        if (!targetStyle) {
          targetStyle = getLanguageDefault(fileInfo.ext, fileInfo.name);
        }
      }

      input.content = convertLeadingWhitespace(
        input.content,
        AI_DEFAULT_STYLE,
        targetStyle,
      );

      return; // Don't block
    }
  });
}
