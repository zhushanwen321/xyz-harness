/**
 * Claude Rules Loader for Pi
 *
 * Eagerly loads .claude/rules/*.md into the system prompt,
 * matching Claude Code's unconditional rule loading behavior.
 *
 * Loading order (later overrides earlier per Claude Code semantics):
 * 1. ~/.claude/rules/*.md (global)
 * 2. .claude/rules/*.md from root to CWD (project, closer to CWD = higher priority)
 *
 * Conditional rules (frontmatter `paths:` field) are listed but not auto-loaded.
 * The agent can read them on demand when working on matching files.
 *
 * KV cache: rules are sorted and formatted deterministically at a fixed
 * position in the system prompt suffix, ensuring stable prefix across turns.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface RuleFile {
  /** Display path for identification (e.g. "~/.claude/rules/form-validation.md") */
  path: string;
  /** Real (resolved) path for deduplication */
  realPath: string;
  /** File content with frontmatter stripped */
  content: string;
  /** Glob patterns from frontmatter `paths:` — if present, this is a conditional rule */
  globs?: string[];
}

/**
 * Parse YAML frontmatter to extract `paths` glob patterns.
 * Supports both inline array and block array formats.
 */
function parseFrontmatter(raw: string): {
  globs?: string[];
  content: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { content: raw.trim() };

  const frontmatter = match[1];
  const content = match[2].trim();

  // Inline array: paths: ["glob1", "glob2"]
  const inlineMatch = frontmatter.match(/paths:\s*\[([^\]]*)\]/);
  if (inlineMatch) {
    const globs = inlineMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
    return globs.length > 0 ? { globs, content } : { content };
  }

  // Block array: paths:\n  - glob1\n  - glob2
  const blockMatch = frontmatter.match(/paths:\s*\r?\n((?:\s+- [^\r\n]+\r?\n?)+)/);
  if (blockMatch) {
    const globs = blockMatch[1]
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^\s+-\s+["']?/, "")
          .replace(/["']?\s*$/, "")
          .trim(),
      )
      .filter(Boolean);
    return globs.length > 0 ? { globs, content } : { content };
  }

  return { content };
}

/**
 * Recursively find all .md files in a directory, sorted for determinism.
 */
function findMarkdownFiles(dir: string, visited?: Set<string>): string[] {
  const results: string[] = [];
  try {
    const real = fs.realpathSync(dir);
    if (!real) return results;
    visited ??= new Set<string>();
    if (visited.has(real)) return results; // symlink cycle guard
    visited.add(real);
  } catch {
    return results; // ENOENT, EACCES
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findMarkdownFiles(fullPath, visited));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // EACCES, ENOENT — skip silently
  }

  return results.sort();
}

/**
 * Load and parse all .md rule files from a directory.
 */
function loadRulesFromDir(
  rulesDir: string,
  displayPrefix: string,
): RuleFile[] {
  const files = findMarkdownFiles(rulesDir);
  return files
    .map((filePath) => {
      try {
        const realPath = fs.realpathSync(filePath);
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = parseFrontmatter(raw);
        if (!parsed.content) return null; // skip empty files
        return {
          path: `${displayPrefix}/${path.relative(rulesDir, filePath)}`,
          realPath,
          content: parsed.content,
          globs: parsed.globs,
        };
      } catch {
        return null;
      }
    })
    .filter((r): r is RuleFile => r !== null);
}

export default function claudeRulesLoader(pi: ExtensionAPI) {
  let unconditionalRules: RuleFile[] = [];
  let conditionalRules: RuleFile[] = [];

  pi.on("session_start", async (_event, ctx) => {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const allRules: RuleFile[] = [];

    // 1. Global rules: ~/.claude/rules/
    if (homeDir) {
      allRules.push(
        ...loadRulesFromDir(
          path.join(homeDir, ".claude", "rules"),
          "~/.claude/rules",
        ),
      );
    }

    // 2. Project rules: walk from root to CWD (like Claude Code)
    // Track loaded real paths to avoid duplicating when walk overlaps with global dir
    const loadedRealPaths = new Set<string>(
      allRules.map((r) => r.realPath),
    );

    const dirs: string[] = [];
    let current = ctx.cwd;
    while (current !== path.parse(current).root) {
      dirs.push(current);
      current = path.dirname(current);
    }
    dirs.push(path.parse(current).root); // include root itself
    dirs.reverse(); // root → CWD, later dirs have higher priority

    for (const dir of dirs) {
      const relDir = path.relative(ctx.cwd, dir) || ".";
      const projectRules = loadRulesFromDir(
        path.join(dir, ".claude", "rules"),
        `.claude/rules (${relDir})`,
      );
      // Deduplicate by realPath (global already loaded, skip if walk hits same dir)
      for (const rule of projectRules) {
        if (!loadedRealPaths.has(rule.realPath)) {
          allRules.push(rule);
          loadedRealPaths.add(rule.realPath);
        }
      }
    }

    // Separate conditional vs unconditional
    // Sort once at load time for KV cache stability
    unconditionalRules = allRules
      .filter((r) => !r.globs)
      .sort((a, b) => a.path.localeCompare(b.path));
    conditionalRules = allRules
      .filter((r) => r.globs)
      .sort((a, b) => a.path.localeCompare(b.path));

    const total = unconditionalRules.length + conditionalRules.length;
    if (total > 0) {
      ctx.ui.notify(
        `Claude rules: ${unconditionalRules.length} loaded, ${conditionalRules.length} conditional`,
        "info",
      );
    }
  });

  pi.on("before_agent_start", async (event) => {
    const parts: string[] = [];

    // Unconditional rules: full content injected into system prompt
    if (unconditionalRules.length > 0) {
      const rulesContent = unconditionalRules
        .map((r) => `### ${r.path}\n\n${r.content}`)
        .join("\n\n---\n\n");

      parts.push(
        `## Rules (auto-loaded from .claude/rules/)\n\n${rulesContent}`,
      );
    }

    // Conditional rules: list only — agent reads on demand
    if (conditionalRules.length > 0) {

      const condList = conditionalRules
        .map((r) => `- \`${r.path}\` (applies to: ${r.globs!.join(", ")})`)
        .join("\n");

      parts.push(
        `## Conditional Rules\n\n` +
          `The following rules apply to specific file patterns. ` +
          `Use the read tool to load them when working on matching files:\n\n${condList}`,
      );
    }

    if (parts.length === 0) return;

    return {
      systemPrompt: event.systemPrompt + "\n\n" + parts.join("\n\n") + "\n",
    };
  });
}
