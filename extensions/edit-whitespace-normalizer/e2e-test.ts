#!/usr/bin/env npx tsx
/**
 * E2E 端到端测试 — edit-whitespace-normalizer 扩展
 *
 * 模拟 Pi 运行时环境，验证 tool_call 拦截逻辑的完整流程。
 *
 * 用法：cd ~/.pi/agent/extensions/edit-whitespace-normalizer && npx tsx e2e-test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ═══════════════════════════════════════════════════════════════════
// Test Infrastructure
// ═══════════════════════════════════════════════════════════════════

const TMP_DIR = path.join(process.env.HOME!, ".pi/e2e-test-" + Date.now());

interface IndentStyle {
  type: "tab" | "space";
  size: number;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function runTests(tests: { name: string; fn: () => Promise<void> | void }[]) {
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (e: any) {
      console.log(`  ✗ ${t.name} [${e.message}]`);
      failed++;
      failures.push(t.name);
    }
  }
}

function assertEq<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Copied functions from extension (simplified versions for testing)
// ═══════════════════════════════════════════════════════════════════

interface ParsedSection { glob: string; indent_style?: string; indent_size?: number }
interface ParsedEditorConfig { root: boolean; sections: ParsedSection[] }

function convertLeadingOne(line: string, from: IndentStyle, to: IndentStyle): string {
  const m = line.match(/^([\t ]*)([\s\S]*)$/); if (!m) return line;
  const lead = m[1]!; const rest = m[2]!; if (lead.length === 0) return line;
  let level: number, rem: number;
  if (from.type === "tab") {
    let tc = 0, sc = 0; for (const ch of lead) { if (ch === "\t") tc++; else sc++; }
    level = tc; rem = sc;
  } else {
    const nl = lead.replace(/\t/g, " ".repeat(from.size));
    level = Math.floor(nl.length / from.size); rem = nl.length % from.size;
  }
  return (to.type === "tab" ? "\t".repeat(level) + " ".repeat(rem) : " ".repeat(level * to.size + rem)) + rest;
}

function convertLeading(text: string, from: IndentStyle, to: IndentStyle): string {
  // Always run conversion; text may have whitespace not matching declared styles.
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map(l => convertLeadingOne(l, from, to)).join("\n");
}

function gcd(a: number, b: number): number { while (b) { [a, b] = [b, a % b]; } return a; }
function gcdArr(arr: number[]): number { return arr.length ? arr.reduce((a, b) => gcd(a, b)) : 0; }

const LANG_DEFAULTS: Record<string, IndentStyle> = {
  ".py": { type: "space", size: 4 }, ".go": { type: "tab", size: 1 },
  ".java": { type: "space", size: 4 }, ".rb": { type: "space", size: 2 },
  ".rs": { type: "space", size: 4 }, ".c": { type: "space", size: 4 }, ".cs": { type: "space", size: 4 },
};
const SPECIAL: Record<string, IndentStyle> = { Makefile: { type: "tab", size: 1 } };
function langDefault(ext: string, name: string): IndentStyle {
  if (SPECIAL[name]) return SPECIAL[name]!;
  return LANG_DEFAULTS[ext] || { type: "space", size: 2 };
}

function resolvePath(filePath: string, cwd: string) {
  const abs = path.resolve(cwd, filePath);
  const ext = path.extname(abs).toLowerCase();
  const name = path.basename(abs);
  let root = cwd;
  let dir = path.dirname(abs);
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, ".git"))) { root = dir; break; }
    const p = path.dirname(dir); if (p === dir) break; dir = p;
  }
  return { abs, root, ext, name, rel: path.relative(root, abs) };
}

function detectContent(content: string): IndentStyle | null {
  let tabL = 0, spcL = 0; const lens: number[] = [];
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) continue;
    const m = line.match(/^([\t ]*)/); if (!m) continue;
    const lead = m[1]!; if (lead.length === 0) continue;
    if (lead[0] === "\t") tabL++; else { spcL++; lens.push(lead.length); }
  }
  if (tabL === 0 && spcL === 0) return null;
  if (tabL > spcL) return { type: "tab", size: 1 };
  if (spcL > 0) { const s = gcdArr(lens); return { type: "space", size: s < 2 ? 2 : s }; }
  return { type: "tab", size: 1 };
}

function detectFile(abs: string, ext: string, name: string): IndentStyle {
  if (SPECIAL[name]) return SPECIAL[name]!;
  try {
    const c = fs.readFileSync(abs, "utf-8");
    if (c.length > 0) { const d = detectContent(c); if (d) return d; }
  } catch {}
  return langDefault(ext, name);
}

function simpleGlob(p: string, fp: string): boolean {
  fp = fp.replace(/\\/g, "/");
  let r = "^", i = 0;
  while (i < p.length) {
    const ch = p[i]!;
    if (ch === "*") {
      if (p[i + 1] === "*") { r += ".*"; i += 2; if (p[i] === "/") i++; }
      else { r += "[^/]*"; i++; }
    } else if (/[.+\^${}()\[\]?]/.test(ch)) { r += "\\" + ch; i++; }
    else { r += ch; i++; }
  }
  try { return new RegExp(r + "$").test(fp); } catch { return false; }
}

function parseEC(content: string): ParsedEditorConfig {
  const res: ParsedEditorConfig = { root: false, sections: [] };
  let cur: ParsedSection | null = null;
  for (const line of content.split("\n").map(l => l.trim())) {
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const sm = line.match(/^\[(.+)\]$/);
    if (sm) { if (cur) res.sections.push(cur); cur = { glob: sm[1]! }; continue; }
    const kv = line.match(/^([\w_]+)\s*[=:]\s*(.+)$/); if (!kv) continue;
    const k = kv[1]!.toLowerCase(), v = kv[2]!.trim();
    if (k === "root") res.root = v.toLowerCase() === "true";
    else if (cur) { if (k === "indent_style") cur.indent_style = v.toLowerCase(); else if (k === "indent_size") cur.indent_size = +v; }
  }
  if (cur) res.sections.push(cur);
  return res;
}

function matchEC(parsed: ParsedEditorConfig, fp: string): { indent_style?: string; indent_size?: number } {
  const r: any = {};
  fp = fp.replace(/\\/g, "/");
  for (const s of parsed.sections) { if (simpleGlob(s.glob, fp)) { if (s.indent_style !== undefined) r.indent_style = s.indent_style; if (s.indent_size !== undefined) r.indent_size = s.indent_size; } }
  return r;
}

function ecToStyle(cfg: { indent_style?: string; indent_size?: number }): IndentStyle | null {
  if (!cfg.indent_style) return null;
  return cfg.indent_style === "tab" ? { type: "tab", size: 1 } : { type: "space", size: cfg.indent_size || 2 };
}

function resolveStyle(
  fi: ReturnType<typeof resolvePath>,
  ecParsed: ParsedEditorConfig | null,
): { style: IndentStyle; fromEc: boolean } {
  if (ecParsed) {
    const m = matchEC(ecParsed, fi.rel); let s = ecToStyle(m);
    if (!s) { const m2 = matchEC(ecParsed, fi.name); s = ecToStyle(m2); }
    if (s) return { style: s, fromEc: true };
  }
  return { style: detectFile(fi.abs, fi.ext, fi.name), fromEc: false };
}

function genECTemplate(style: IndentStyle): string {
  const lines = ["root = true", "", "[*]", `indent_style = ${style.type}`];
  if (style.type === "space") lines.push(`indent_size = ${style.size}`);
  lines.push("end_of_line = lf", "charset = utf-8", "trim_trailing_whitespace = true", "insert_final_newline = true", "", "[*.py]", "indent_size = 4", "", "[Makefile]", "indent_style = tab", "");
  return lines.join("\n");
}

// ── Key logic: determine AI's source style for newText ──
// AI typically generates code with 4-space indentation (training data default)
const AI_DEFAULT_STYLE: IndentStyle = { type: "space", size: 4 };

function getOldTextFromStyle(fileStyle: IndentStyle): IndentStyle {
  return fileStyle.type === "tab" ? { type: "space", size: 4 } : fileStyle;
}

function getNewTextTargetStyle(
  fileStyle: IndentStyle,
  ecParsed: ParsedEditorConfig | null,
  fi: ReturnType<typeof resolvePath>,
): IndentStyle {
  if (ecParsed) {
    let m = matchEC(ecParsed, fi.rel); let s = ecToStyle(m);
    if (!s) { m = matchEC(ecParsed, fi.name); s = ecToStyle(m); }
    if (s) return s;
  }
  return fileStyle;
}

/**
 * Simulate the tool_call handler for edit tool.
 */
function normalizeEdit(
  input: { path: string; edits?: Array<{ oldText: string; newText: string }>; oldText?: string; newText?: string },
  cwd: string,
) {
  const fi = resolvePath(input.path, cwd);
  const ecPath = path.join(fi.root, ".editorconfig");
  const ecParsed = fs.existsSync(ecPath) ? parseEC(fs.readFileSync(ecPath, "utf-8")) : null;
  const { style: fileStyle } = resolveStyle(fi, ecParsed);

  const oldTextFromStyle = getOldTextFromStyle(fileStyle);
  const oldTextToStyle = fileStyle;
  const newTextFromStyle = AI_DEFAULT_STYLE;
  const newTextToStyle = getNewTextTargetStyle(fileStyle, ecParsed, fi);

  const edits = (input.edits || []).map(e => ({ ...e }));
  if (edits.length === 0 && (input.oldText !== undefined || input.newText !== undefined)) {
    edits.push({ oldText: input.oldText || "", newText: input.newText || "" });
  }

  for (const edit of edits) {
    if (edit.oldText) edit.oldText = convertLeading(edit.oldText, oldTextFromStyle, oldTextToStyle);
    if (edit.newText) edit.newText = convertLeading(edit.newText, newTextFromStyle, newTextToStyle);
  }

  return { edits, fileStyle, oldTextFromStyle, oldTextToStyle, newTextToStyle };
}

/**
 * Simulate the tool_call handler for write tool.
 */
function normalizeWrite(filePath: string, content: string, cwd: string) {
  const fi = resolvePath(filePath, cwd);
  const ecPath = path.join(fi.root, ".editorconfig");
  const ecParsed = fs.existsSync(ecPath) ? parseEC(fs.readFileSync(ecPath, "utf-8")) : null;

  let target: IndentStyle | null = null;
  if (fs.existsSync(fi.abs)) {
    target = resolveStyle(fi, ecParsed).style;
  }
  if (!target) {
    target = ecParsed ? (ecToStyle(matchEC(ecParsed, fi.rel)) || ecToStyle(matchEC(ecParsed, fi.name))) : null;
    if (!target) target = langDefault(fi.ext, fi.name);
  }

  return { content: convertLeading(content, AI_DEFAULT_STYLE, target), targetStyle: target };
}

// ═══════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════

function setupTestProjects() {
  if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });

  const projects: Record<string, Record<string, string>> = {
    "tab": { ".git": "", "src/index.ts": "function hello() {\n\treturn 1;\n}\n" },
    "space2": { ".git": "", "src/index.ts": "function hello() {\n  return 1;\n}\n" },
    "space4": { ".git": "", "src/app.py": "def hello():\n    return 1\n" },
    "makefile": { ".git": "", "Makefile": "target:\n\techo hello\n" },
    "with-ec": { ".git": "", ".editorconfig": "root = true\n\n[*]\nindent_style = space\nindent_size = 4\n\n[Makefile]\nindent_style = tab\n", "src/test.ts": "function foo() {\n    return 1;\n}\n" },
  };

  for (const [proj, files] of Object.entries(projects)) {
    for (const [fp, content] of Object.entries(files)) {
      const full = path.join(TMP_DIR, proj, fp);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf-8");
    }
  }

  console.log(`Test dir: ${TMP_DIR}`);
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

async function main() {
  setupTestProjects();

  console.log("\n═══ E2E: Normalize Edit oldText ═══\n");

  await runTests([

    // 1. Tab file + space oldText → oldText converted to tab
    {
      name: "Tab file + 4-space oldText → oldText whitespace → tab, matches file",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "tab");
        const aiOldText = "function hello() {\n    return 1;\n}";
        const aiNewText = "function hello() {\n    return 42;\n}";

        const r = normalizeEdit({ path: "src/index.ts", oldText: aiOldText, newText: aiNewText }, cwd);

        // oldText: "    return 1;" (4 spaces) → tabs → "\treturn 1;"
        assertEq(r.edits[0]!.oldText, "function hello() {\n\treturn 1;\n}", "oldText whitespace normalized to tab");
        // Verify the indentation level is 1 (one tab) - content remains unchanged
        assertEq(r.edits[0]!.oldText.split("\n")[1], "\treturn 1;", "second line of oldText has 1 tab indent, content unchanged");
        // newText uses AI default style (4-space) → converted to project style (tab)
        assertEq(r.edits[0]!.newText, "function hello() {\n\treturn 42;\n}", "newText tab style");
      },
    },

    // 2. 2-space file + multiple edit calls → consistent newText normalization
    {
      name: "2-space file: newText normalized from AI 4-space to 2-space",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "space2");
        const aiNewText = "function hello() {\n    return 42;\n}";

        const r = normalizeEdit({ path: "src/index.ts", oldText: aiNewText, newText: aiNewText }, cwd);

        // newText fromStyle = AI_DEFAULT_STYLE = {space, 4}
        // "    " → level 1 → to {space, 2} = "  " (2 spaces)
        assertEq(r.edits[0]!.newText, "function hello() {\n  return 42;\n}", "newText normalized from 4-space to 2-space");
        assertEq(r.fileStyle.type, "space", "file style should be space");
        assertEq(r.fileStyle.size, 2, "file style should be 2-space");
      },
    },

    // 3. Multiple edits in one call
    {
      name: "Multiple edits: each oldText normalized to project style",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "tab");
        const r = normalizeEdit({
          path: "src/index.ts",
          edits: [
            { oldText: "function hello() {\n    return 1;\n}", newText: "function hello() {\n    return 42;\n}" },
            { oldText: "function hello() {\n\treturn 42;\n}", newText: "// updated\nfunction hello() {\n    return 99;\n}" },
          ],
        }, cwd);

        assertEq(r.edits.length, 2);
        assertEq(r.edits[0]!.newText, "function hello() {\n\treturn 42;\n}", "edit[0] newText tab");
        assertEq(r.edits[1]!.newText, "// updated\nfunction hello() {\n\treturn 99;\n}", "edit[1] newText tab");
      },
    },
  ]);

  console.log("\n═══ E2E: Normalize Edit newText ═══\n");

  await runTests([

    // 4. Tab project → newText converted to tab
    {
      name: "Tab project: newText 4-space → tab",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "tab");
        const aiNewText = "function hello() {\n    return 42;\n}";
        const r = normalizeEdit({ path: "src/index.ts", oldText: aiNewText, newText: aiNewText }, cwd);
        assertEq(r.edits[0]!.newText, "function hello() {\n\treturn 42;\n}", "newText tab");
      },
    },

    // 5. 2-space project → newText converted from 4-space to 2-space
    {
      name: "2-space project: newText 4-space → 2-space",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "space2");
        const r = normalizeEdit({ path: "src/index.ts", oldText: "function hello() {\n  return 1;\n}", newText: "function hello() {\n    return 42;\n}" }, cwd);
        assertEq(r.edits[0]!.newText, "function hello() {\n  return 42;\n}", "newText 2-space");
      },
    },

    // 6. Makefile → newText converted to tab
    {
      name: "Makefile: newText 4-space → tab",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "makefile");
        const r = normalizeEdit({ path: "Makefile", oldText: "target:\n\techo hello", newText: "target:\n    echo world" }, cwd);
        assertEq(r.edits[0]!.newText, "target:\n\techo world", "Makefile newText tab");
      },
    },

    // 7. .editorconfig project
    {
      name: ".editorconfig (4-space): newText from AI tabs → 4-space",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "with-ec");
        const r = normalizeEdit({ path: "src/test.ts", oldText: "function foo() {\n    return 1;\n}", newText: "function foo() {\n\treturn 42;\n}" }, cwd);
        // newText fromStyle = AI_DEFAULT = {space, 4}
        // "\t" (1 tab) → normalizedLeading = "    " (4 spaces) → level = 1 → rebuilt = 4 spaces
        // The tab is treated as 4 spaces (AI default), level=1, target 4-space → 4 spaces
        assertEq(r.edits[0]!.newText, "function foo() {\n    return 42;\n}", "newText 4-space from editorconfig");
      },
    },
  ]);

  console.log("\n═══ E2E: Write Tool Normalization ═══\n");

  await runTests([

    // 8. Write to existing file (2-space) → normalize content
    {
      name: "Write to 2-space file: content from 4-space → 2-space",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "space2");
        const newContent = "    function add(a: number, b: number) {\n        return a + b;\n    }";
        const r = normalizeWrite("src/index.ts", newContent, cwd);
        assertEq(r.targetStyle.type, "space");
        assertEq(r.targetStyle.size, 2);
        assertEq(r.content, "  function add(a: number, b: number) {\n    return a + b;\n  }", "write content 2-space");
      },
    },

    // 9. Write to existing tab file → normalize content to tab
    {
      name: "Write to tab file: content from 4-space → tab",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "tab");
        const r = normalizeWrite("src/index.ts", "    function newFunc() {\n        return 0;\n    }", cwd);
        assertEq(r.targetStyle.type, "tab");
        assertEq(r.content, "\tfunction newFunc() {\n\t\treturn 0;\n\t}", "write content tab");
      },
    },

    // 10. Write new .py file → language default 4-space
    {
      name: "Write new .py file: content → language default (4-space)",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "space2");
        const r = normalizeWrite("src/new.py", "def new_func():\n  pass", cwd);
        assertEq(r.targetStyle.type, "space");
        assertEq(r.targetStyle.size, 4);
        // 2-space indent when fromStyle={space,4}: level=0, remainder=2 → stays 2-space
        // This is expected: remainder spaces are preserved per the algorithm
        assertEq(r.content, "def new_func():\n  pass", "2-space stays 2-space as remainder");
      },
    },

    // 11. Write Makefile → tab
    {
      name: "Write to Makefile: content → tab",
      fn: async () => {
        const cwd = path.join(TMP_DIR, "makefile");
        const r = normalizeWrite("Makefile", "new-target:\n    echo hello\n    echo world", cwd);
        assertEq(r.content, "new-target:\n\techo hello\n\techo world", "makefile tab");
      },
    },
  ]);

  console.log("\n═══ E2E: Project Detection & .editorconfig ═══\n");

  await runTests([

    // 12. Scan project indent style
    {
      name: "scan tab project → tab",
      fn: async () => {
        // Re-implement scanProjectIndentStyle inline
        const scan = (root: string): IndentStyle | null => {
          const exts = [".ts", ".js", ".py", ".rs", ".go", ".java", ".rb", ".vue"];
          const counts: { type: "tab" | "space"; size: number; count: number }[] = [];
          for (const ext of exts) {
            try {
              const files = findFiles(root, ext, 5);
              for (const f of files) {
                const d = detectContent(fs.readFileSync(f, "utf-8"));
                if (d) {
                  const e = counts.find(x => x.type === d.type && x.size === d.size);
                  if (e) e.count++; else counts.push({ ...d, count: 1 });
                }
              }
            } catch {}
          }
          let best: IndentStyle | null = null, bestC = 0;
          for (const s of counts) { if (s.count > bestC) { best = { type: s.type, size: s.size }; bestC = s.count; } }
          return best;
        };
        function findFiles(root: string, ext: string, max: number): string[] {
          const res: string[] = [];
          try {
            for (const e of fs.readdirSync(root, { withFileTypes: true })) {
              if (res.length >= max) break;
              if (e.name.startsWith(".") || ["node_modules","target","build","dist"].includes(e.name)) continue;
              const fp = path.join(root, e.name);
              if (e.isDirectory()) res.push(...findFiles(fp, ext, max - res.length));
              else if (e.isFile() && e.name.endsWith(ext)) res.push(fp);
            }
          } catch {}
          return res;
        }

        const d = scan(path.join(TMP_DIR, "tab"));
        assertEq(d!.type, "tab", "tab project → tab");
      },
    },
    {
      name: "scan 2-space project → space/2",
      fn: async () => {
        // Inline scan
        const c = fs.readFileSync(path.join(TMP_DIR, "space2", "src/index.ts"), "utf-8");
        const d = detectContent(c);
        assertEq(d!.type, "space");
        assertEq(d!.size, 2);
      },
    },

    // 13. .editorconfig template round-trip
    {
      name: "Generated .editorconfig template is valid (round-trip)",
      fn: async () => {
        const tpl = genECTemplate({ type: "space", size: 2 });
        const parsed = parseEC(tpl);
        assertEq(parsed.root, true, "root = true");
        const m = matchEC(parsed, "test.ts");
        assertEq(m.indent_style, "space");
        assertEq(m.indent_size, 2);
        const mp = matchEC(parsed, "app.py");
        assertEq(mp.indent_size, 4, "[*.py] → 4");
        const mm = matchEC(parsed, "Makefile");
        assertEq(mm.indent_style, "tab", "Makefile → tab");
      },
    },
  ]);

  console.log("\n═══ E2E: Edge Cases ═══\n");

  await runTests([

    // 14. Inline tabs not modified
    {
      name: "Inline whitespace in strings not modified",
      fn: async () => {
        const r = convertLeading('const s = "\t\tsome text";', { type: "space", size: 2 }, { type: "tab", size: 1 });
        assertEq(r, 'const s = "\t\tsome text";', "inline tabs unchanged");
      },
    },

    // 15. Empty lines preserved
    {
      name: "Empty lines preserved",
      fn: async () => {
        const r = convertLeading("  foo\n\n  bar", { type: "space", size: 2 }, { type: "tab", size: 1 });
        assertEq(r, "\tfoo\n\n\tbar", "empty lines preserved");
      },
    },

    // 16. Empty oldText
    {
      name: "Empty oldText stays empty",
      fn: async () => {
        const r = normalizeEdit({ path: "test.ts", oldText: "", newText: "new" }, TMP_DIR);
        assertEq(r.edits[0]!.oldText, "", "empty oldText");
      },
    },

    // 17. CRLF → normalized to LF
    {
      name: "CRLF line endings normalized to LF after conversion",
      fn: async () => {
        const r = convertLeading("  foo\r\n  bar", { type: "space", size: 2 }, { type: "tab", size: 1 });
        assertEq(r, "\tfoo\n\tbar", "CRLF → LF");
      },
    },

    // 18. File outside git root
    {
      name: "File outside git project root handled",
      fn: async () => {
        const tmpFile = path.join(TMP_DIR, "outside.ts");
        fs.writeFileSync(tmpFile, "function test() {\n  return 1;\n}\n", "utf-8");
        const fi = resolvePath(tmpFile, path.join(TMP_DIR, "space2"));
        assertEq(fi.abs, tmpFile);
        // No .git above tmpDir, so projectRoot should be the cwd
        assertEq(fi.root, path.join(TMP_DIR, "space2"), "fallback to cwd as project root");
      },
    },

    // 19. .editorconfig subdirectory patterns
    {
      name: ".editorconfig relative path matching",
      fn: async () => {
        const ec = parseEC("root = true\n\n[src/**/*.ts]\nindent_style = space\nindent_size = 2");
        const m = matchEC(ec, "src/app/test.ts");
        assertEq(m.indent_style, "space");
        assertEq(m.indent_size, 2);
        // basename fallback also works
        const m2 = matchEC(ec, "test.ts");
        assertEq(m2.indent_style, undefined, "basename 'test.ts' does not match 'src/**/*.ts'");
      },
    },
  ]);

  // ── Cleanup ──
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`E2E: ${passed} 通过, ${failed} 失败\n`);
  if (failed > 0) {
    console.log(`失败项:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error("E2E suite crashed:", e);
  process.exit(1);
});
