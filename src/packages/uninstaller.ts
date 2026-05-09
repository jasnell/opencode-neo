import { homedir } from "node:os"
import { join } from "node:path"
import { rm } from "node:fs/promises"
import type { NeoConfig } from "../types.js"
import { saveConfig } from "../config.js"
import { validateName } from "../safepath.js"

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
        // Skills live in a subdirectory: skills/<name>/SKILL.md
        await rm(join(base, "skills", name), { recursive: true, force: true })
        break
      case "tool":
        // Tools are single files: tools/<name>.ts
        await rm(join(base, "tools", `${name}.ts`), { force: true })
        break
      case "command":
        // Commands are single files: commands/<name>.md
        await rm(join(base, "commands", `${name}.md`), { force: true })
        break
      case "agent":
        // Agents are single files: agents/<name>.md
        await rm(join(base, "agents", `${name}.md`), { force: true })
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
