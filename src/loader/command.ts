import { join } from "node:path"
import type { NeoConfig } from "../types.js"
import { readCachedFile } from "../registry/cache.js"
import { resolvePackage } from "../registry/resolver.js"

/**
 * Dynamically load a command template from a registry.
 *
 * This is the "npx" path for commands -- the template is fetched,
 * argument placeholders are substituted, and the result is returned
 * for the agent to follow.
 */
export async function loadCommand(
  config: NeoConfig,
  name: string,
  args: string,
): Promise<string> {
  const resolved = await resolvePackage(config, name)
  if (!resolved) {
    return `Command "${name}" not found in any configured registry.`
  }

  if (resolved.entry.type !== "command") {
    return `Package "${name}" is a ${resolved.entry.type}, not a command. Use neo_load for skills or neo_exec for tools.`
  }

  const content = await readCachedFile(
    resolved.cacheDir,
    join(resolved.entry.path, "command.md"),
  )

  if (!content) {
    return `Command "${name}" is listed in registry "${resolved.registry}" but the command.md file is missing.`
  }

  // Parse out frontmatter and get the template body
  const template = extractTemplate(content)

  // Substitute argument placeholders
  const processed = substituteArgs(template, args)

  return [
    `The following command template was loaded from Neo registry "${resolved.registry}":`,
    "",
    "---",
    processed,
    "---",
    "",
    "Follow the instructions in the template above.",
  ].join("\n")
}

/**
 * Extract the template body from a command.md file (strip frontmatter).
 */
function extractTemplate(content: string): string {
  if (!content.startsWith("---")) return content

  const endIdx = content.indexOf("---", 3)
  if (endIdx === -1) return content

  // Skip past the closing --- and any trailing newline
  return content.slice(endIdx + 3).replace(/^\n/, "")
}

/**
 * Substitute $ARGUMENTS and positional $1, $2, etc. in a template.
 */
function substituteArgs(template: string, args: string): string {
  const parts = parseArgs(args)
  let result = template

  // Replace $ARGUMENTS with the full argument string.
  // Use a function replacement to avoid special $-pattern interpretation (#24).
  result = result.replace(/\$ARGUMENTS/g, () => args)

  // Replace positional $1, $2, ... $9.
  // Use negative lookahead to avoid replacing $1 inside $10 or $100.
  for (let i = 0; i < Math.min(parts.length, 9); i++) {
    const part = parts[i]
    result = result.replace(new RegExp(`\\$${i + 1}(?![0-9])`, "g"), () => part)
  }

  return result
}

/**
 * Simple argument parser that respects quoted strings.
 */
function parseArgs(args: string): string[] {
  const parts: string[] = []
  let current = ""
  let inQuote: string | null = null

  for (const ch of args) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch
    } else if (ch === " " || ch === "\t") {
      if (current) {
        parts.push(current)
        current = ""
      }
    } else {
      current += ch
    }
  }

  if (current) parts.push(current)
  return parts
}
