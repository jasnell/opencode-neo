import { join } from "node:path"
import type { NeoConfig, Shell } from "../types.js"
import { registryCacheDir, readCachedFile } from "../registry/cache.js"
import { resolvePackage } from "../registry/resolver.js"

/**
 * Generate a diff between the currently installed version of a package
 * and the latest version in the registry cache.
 *
 * Uses git log if a locked SHA is available, otherwise does a textual
 * diff of the main source file.
 */
export async function diffPackage(
  $: Shell,
  config: NeoConfig,
  name: string,
): Promise<string> {
  const installed = config.installed[name]
  if (!installed) {
    return `Package "${name}" is not installed.`
  }

  const resolved = await resolvePackage(config, name)
  if (!resolved) {
    return `Package "${name}" is no longer available in any configured registry.`
  }

  if (resolved.entry.version === installed.version) {
    return `Package "${name}" is at the latest version (${installed.version}). No changes.`
  }

  // Try to get git log for the package path
  const cacheDir = registryCacheDir(config, installed.registry)
  const lock = config.locks?.[name]

  if (lock?.sha) {
    // We have a pinned SHA -- use git log between locked SHA and HEAD
    const logResult = await getGitLog($, cacheDir, lock.sha, resolved.entry.path)
    if (logResult) {
      return [
        `Package "${name}": ${installed.version} -> ${resolved.entry.version}`,
        "",
        "Changes since last install:",
        logResult,
      ].join("\n")
    }
  }

  // Fallback: textual diff of the source file
  const sourceFile = getSourceFile(resolved.entry.type)
  const newContent = await readCachedFile(cacheDir, join(resolved.entry.path, sourceFile))

  if (!newContent) {
    return `Package "${name}": ${installed.version} -> ${resolved.entry.version} (cannot read source for diff)`
  }

  return [
    `Package "${name}": ${installed.version} -> ${resolved.entry.version}`,
    "",
    `Updated source (${sourceFile}):`,
    "```",
    newContent.length > 3000 ? newContent.slice(0, 3000) + "\n... (truncated)" : newContent,
    "```",
  ].join("\n")
}

async function getGitLog(
  $: Shell,
  cacheDir: string,
  fromSha: string,
  path: string,
): Promise<string | null> {
  try {
    const result = await $`git -C ${cacheDir} log --oneline ${fromSha}..HEAD -- ${path}`.quiet()
    const text = result.text().trim()
    return text || null
  } catch {
    return null
  }
}

function getSourceFile(type: string): string {
  switch (type) {
    case "skill": return "SKILL.md"
    case "tool": return "tool.ts"
    case "command": return "command.md"
    case "agent": return "agent.md"
    case "mcp": return "mcp.json"
    default: return "SKILL.md"
  }
}
