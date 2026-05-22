/**
 * SkillResolver — unified skill discovery and caching for the coding-workflow extension.
 *
 * - Injected with the Pi skills list (name + filePath) during before_agent_start.
 * - Resolves skill content by name with file-read caching.
 * - No fallback paths per ADR-0003: missing skills throw immediately.
 */

import * as fs from "node:fs";

export class SkillResolver {
	#skills: Array<{ name: string; filePath: string }> = [];
	#cache = new Map<string, string>();

	/**
	 * Inject the Pi skills list (called from before_agent_start handler).
	 * Cache is not cleared on re-set — file paths are stable across phase transitions.
	 */
	setSkills(skills: Array<{ name: string; filePath: string }>): void {
		this.#skills = skills;
	}

	/**
	 * Resolve skill content by name. Reads from disk on first access, caches by filePath.
	 * Throws if the skill is not in the injected list.
	 */
	resolve(name: string): string {
		const skill = this.#skills.find((s) => s.name === name);
		if (!skill) {
			throw new Error(
				`Skill "${name}" not found in resolver's skill list. ` +
					`Ensure the skill is registered and installed.`,
			);
		}
		const cached = this.#cache.get(skill.filePath);
		if (cached !== undefined) return cached;
		const content = fs.readFileSync(skill.filePath, "utf8");
		this.#cache.set(skill.filePath, content);
		return content;
	}

	/**
	 * Resolve skill file path by name. Does not read file content.
	 * Throws if the skill is not in the injected list.
	 */
	resolvePath(name: string): string {
		const skill = this.#skills.find((s) => s.name === name);
		if (!skill) {
			throw new Error(
				`Skill "${name}" not found in resolver's skill list. ` +
					`Ensure the skill is registered and installed.`,
			);
		}
		return skill.filePath;
	}

	/**
	 * Check whether a skill is present in the resolver's list.
	 */
	has(name: string): boolean {
		return this.#skills.some((s) => s.name === name);
	}
}
