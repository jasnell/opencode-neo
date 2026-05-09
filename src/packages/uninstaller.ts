import { homedir } from "node:os"
import { join } from "node:path"
import { rm, readFile, writeFile, stat } from "node:fs/promises"
import type { NeoConfig } from "../types.js"
import { saveConfig } from "../config.js"
import { validateName } from "../safepath.js"
import { parseJsonc } from "../jsonc.js"

/**
 * Uninstall a previously installed package.
 *
 * Removes the installed files and updates the config.
 * Returns a human-readable status message.
 */
export async function uninstallPackage(
  config: NeoConfig,
  name: string,
  worktree?: string,
): Promise<string> {
  try {
    validateName(name, "package")
  } catch (err: any) {
    return err.message
  }

  const installed = config.installed[name]
  if (!installed) {
    return `Package "${name}" is not installed.`
  }

  const base = installed.scope === "project" && worktree
    ? join(worktree, ".opencode")
    : join(homedir(), ".config", "opencode")

  try {
    switch (installed.type) {
      case "skill":
        await rm(join(base, "skills", name), { recursive: true, force: true })
        break
      case "tool":
        await rm(join(base, "tools", `${name}.ts`), { force: true })
        break
      case "command":
        await rm(join(base, "commands", `${name}.md`), { force: true })
        break
      case "agent":
        await rm(join(base, "agents", `${name}.md`), { force: true })
        break
      case "mcp":
        await uninstallMcp(name, installed.scope, worktree)
        break
    }
  } catch (err: any) {
    return `Warning: failed to remove files for "${name}": ${err.message}. Removing from installed manifest anyway.`
  }

  delete config.installed[name]
  await saveConfig(config)

  const restartNote = installed.type === "skill"
    ? ""
    : " Restart OpenCode for the change to take effect."

  return `Uninstalled "${name}" (${installed.type}).${restartNote}`
}

/**
 * Remove an MCP entry from the user's opencode.json.
 */
async function uninstallMcp(
  name: string,
  scope: "global" | "project",
  worktree?: string,
): Promise<void> {
  const configDir = scope === "project" && worktree
    ? worktree
    : join(homedir(), ".config", "opencode")

  const jsonPath = join(configDir, "opencode.json")
  const jsoncPath = join(configDir, "opencode.jsonc")
  let targetPath = jsonPath
  try { await stat(jsoncPath); targetPath = jsoncPath } catch {
    try { await stat(jsonPath) } catch { return }
  }

  const text = await readFile(targetPath, "utf-8")
  const parsed = parseJsonc(text)

  if (!parsed.mcp?.[name]) return

  // Remove the MCP entry from the mcp object
  // Use a targeted regex to remove just the key within the mcp block
  const mcpKeyPattern = new RegExp(
    `\\s*"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*\\{[^}]*\\}\\s*,?`,
  )
  const updated = text.replace(mcpKeyPattern, "")
  await writeFile(targetPath, updated, "utf-8")
}
