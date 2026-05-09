import { join } from "node:path"
import type { NeoConfig } from "../types.js"
import { readCachedFile } from "../registry/cache.js"
import { resolvePackage } from "../registry/resolver.js"
import { escapeXmlAttr } from "../safepath.js"

/**
 * Dynamically load a skill's SKILL.md content for injection into the
 * current conversation context.
 *
 * This is the "npx" path for skills -- no installation required,
 * the content is returned directly for the agent to use.
 */
export async function loadSkill(config: NeoConfig, name: string): Promise<string> {
  const resolved = await resolvePackage(config, name)
  if (!resolved) {
    return `Skill "${name}" not found in any configured registry.`
  }

  if (resolved.entry.type !== "skill") {
    return `Package "${name}" is a ${resolved.entry.type}, not a skill. Use neo_exec for tools or /neo for commands.`
  }

  const content = await readCachedFile(
    resolved.cacheDir,
    join(resolved.entry.path, "SKILL.md"),
  )

  if (!content) {
    return `Skill "${name}" is listed in registry "${resolved.registry}" but the SKILL.md file is missing.`
  }

  // Return the full SKILL.md content -- this gets injected into conversation
  // context exactly like the built-in skill tool would.
  return [
    `<skill_content name="${escapeXmlAttr(name)}" source="neo:${escapeXmlAttr(resolved.registry)}">`,
    content,
    `</skill_content>`,
  ].join("\n")
}
