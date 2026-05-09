import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises"
import type { NeoConfig, PackageType, ResolvedPackage } from "../types.js"
import { saveConfig } from "../config.js"
import { readCachedFile } from "../registry/cache.js"
import { resolvePackage } from "../registry/resolver.js"
import { validateSkill, validateTool, validateCommand, validateAgent, validateMcp } from "./validator.js"
import { validateName, safeJoin } from "../safepath.js"
import { parseJsonc } from "../jsonc.js"

/**
 * Check if a file or directory exists on disk.
 */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Check whether a target install path conflicts with an existing file
 * that is NOT managed by Neo.
 *
 * Returns an error message string if there's a conflict, or null if clear.
 */
async function checkConflict(
  config: NeoConfig,
  name: string,
  installPath: string,
  type: PackageType,
): Promise<string | null> {
  // If this package is already tracked by Neo, it's a managed path -- no conflict
  if (config.installed[name]) return null

  // For skills, check the directory; for tools/commands, check the file
  const pathToCheck = type === "skill" ? dirname(installPath) : installPath

  if (await exists(pathToCheck)) {
    const fileType = type === "skill" ? "skill directory" : `${type} file`
    return (
      `Cannot install "${name}": a ${fileType} already exists at ${pathToCheck} ` +
      `and is not managed by Neo. To avoid overwriting locally-created ${type}s, ` +
      `either remove the existing file manually or choose a different package name.`
    )
  }

  return null
}

/**
 * Resolve the installation target path for a package.
 */
function getInstallPath(
  type: PackageType,
  name: string,
  scope: "global" | "project",
  worktree?: string,
): string {
  const base = scope === "project" && worktree
    ? join(worktree, ".opencode")
    : join(homedir(), ".config", "opencode")

  switch (type) {
    case "skill":
      return join(base, "skills", name, "SKILL.md")
    case "tool":
      return join(base, "tools", `${name}.ts`)
    case "command":
      return join(base, "commands", `${name}.md`)
    case "agent":
      return join(base, "agents", `${name}.md`)
    case "mcp":
      // MCPs don't have a file path -- they inject into opencode.json.
      // Return the opencode.json path as a sentinel.
      return join(base === join(homedir(), ".config", "opencode") ? base : join(base, ".."), "opencode.json")
  }
}

/**
 * Get the source file path within a registry package directory.
 */
function getSourceFile(type: PackageType): string {
  switch (type) {
    case "skill":
      return "SKILL.md"
    case "tool":
      return "tool.ts"
    case "command":
      return "command.md"
    case "agent":
      return "agent.md"
    case "mcp":
      return "mcp.json"
  }
}

/**
 * Install a package from a registry to the local filesystem.
 *
 * Returns a human-readable status message.
 */
export async function installPackage(
  config: NeoConfig,
  name: string,
  scope: "global" | "project" = "global",
  worktree?: string,
): Promise<string> {
  // Validate package name for path safety
  try {
    validateName(name, "package")
  } catch (err: any) {
    return err.message
  }

  // Check if already installed
  if (config.installed[name]) {
    return `Package "${name}" is already installed (${config.installed[name].version}). Use neo_update to update it.`
  }

  // Resolve from registries
  const resolved = await resolvePackage(config, name)
  if (!resolved) {
    return `Package "${name}" not found in any configured registry.`
  }

  // Read the source file from the cache
  const sourceFile = getSourceFile(resolved.entry.type)
  const content = await readCachedFile(resolved.cacheDir, join(resolved.entry.path, sourceFile))
  if (!content) {
    return `Package "${name}" exists in registry "${resolved.registry}" but the source file (${sourceFile}) is missing from ${resolved.entry.path}/.`
  }

  // Validate the content
  const validation = validateByType(resolved.entry.type, content)
  if (!validation.valid) {
    return `Package "${name}" failed validation: ${validation.error}`
  }

  // MCP packages inject into opencode.json instead of copying files
  if (resolved.entry.type === "mcp") {
    const mcpResult = await installMcp(name, content, scope, worktree)
    if (mcpResult) return mcpResult

    config.installed[name] = {
      registry: resolved.registry,
      type: "mcp",
      version: resolved.entry.version,
      scope,
      installedAt: new Date().toISOString(),
    }
    await saveConfig(config)
    return `Installed MCP "${name}" (v${resolved.entry.version}) from registry "${resolved.registry}". Restart OpenCode to activate.`
  }

  // Check for conflicts with non-Neo-managed files
  const installPath = getInstallPath(resolved.entry.type, name, scope, worktree)
  const conflict = await checkConflict(config, name, installPath, resolved.entry.type)
  if (conflict) return conflict

  await mkdir(dirname(installPath), { recursive: true })
  await writeFile(installPath, content, "utf-8")

  // If the package is a tool, also copy any additional supporting files
  if (resolved.entry.type === "tool") {
    const supportingConflict = await copyAdditionalToolFiles(resolved, installPath, name, scope, worktree)
    if (supportingConflict) {
      // Roll back the main file we already wrote
      const { rm } = await import("node:fs/promises")
      await rm(installPath, { force: true }).catch(() => {})
      return supportingConflict
    }
  }

  // Update the installed manifest
  config.installed[name] = {
    registry: resolved.registry,
    type: resolved.entry.type,
    version: resolved.entry.version,
    scope,
    installedAt: new Date().toISOString(),
  }
  await saveConfig(config)

  const restartNote = resolved.entry.type === "skill"
    ? "The skill is available immediately via the skill tool."
    : `The ${resolved.entry.type} will be available after restarting OpenCode.`

  return `Installed "${name}" (${resolved.entry.type} v${resolved.entry.version}) from registry "${resolved.registry}". ${restartNote}`
}

/**
 * Update an installed package to the latest version from its registry.
 */
export async function updatePackage(
  config: NeoConfig,
  name: string,
  worktree?: string,
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
    return `Package "${name}" is already at the latest version (${installed.version}).`
  }

  // Temporarily remove the install record so installPackage doesn't
  // short-circuit with "already installed". Save the old record to
  // restore on failure.
  const oldRecord = config.installed[name]
  delete config.installed[name]

  const result = await installPackage(config, name, installed.scope, worktree)

  // If installation failed (package not in installed after the call),
  // restore the old record so the config isn't left in a broken state.
  // installPackage already calls saveConfig on success, so we only
  // need to save here on failure (to persist the restored record).
  if (!config.installed[name]) {
    config.installed[name] = oldRecord
    await saveConfig(config)
  }

  return result
}

function validateByType(type: PackageType, content: string) {
  switch (type) {
    case "skill":
      return validateSkill(content)
    case "tool":
      return validateTool(content)
    case "command":
      return validateCommand(content)
    case "agent":
      return validateAgent(content)
    case "mcp":
      return validateMcp(content)
  }
}

/**
 * For tool packages that may contain multiple files, copy any additional
 * .ts files alongside the main tool.ts.
 *
 * Returns an error message if any supporting file conflicts with an
 * existing non-Neo-managed file, or null on success.
 */
async function copyAdditionalToolFiles(
  resolved: ResolvedPackage,
  _mainInstallPath: string,
  name: string,
  scope: "global" | "project",
  worktree?: string,
): Promise<string | null> {
  const pkgDir = join(resolved.cacheDir, resolved.entry.path)
  const base = scope === "project" && worktree
    ? join(worktree, ".opencode")
    : join(homedir(), ".config", "opencode")

  try {
    const entries = await readdir(pkgDir)
    for (const entry of entries) {
      if (entry === "tool.ts" || entry === "README.md") continue
      if (entry.endsWith(".ts") || entry.endsWith(".js")) {
        // Use safeJoin to prevent path traversal via malicious filenames
        const toolsDir = join(base, "tools")
        const dest = safeJoin(toolsDir, `${name}-${entry}`)

        // Check for conflict with non-Neo files
        if (await exists(dest)) {
          return (
            `Cannot install supporting file for "${name}": ` +
            `a file already exists at ${dest} and is not managed by Neo.`
          )
        }

        const content = await readCachedFile(resolved.cacheDir, join(resolved.entry.path, entry))
        if (content) {
          await writeFile(dest, content, "utf-8")
        }
      }
    }
  } catch {
    // No additional files or directory doesn't exist -- that's fine
  }

  return null
}

// ---------------------------------------------------------------------------
// MCP installation
// ---------------------------------------------------------------------------

/**
 * Install an MCP by injecting its config into the user's opencode.json.
 * Returns an error message string on failure, or null on success.
 */
async function installMcp(
  name: string,
  mcpJsonContent: string,
  scope: "global" | "project",
  worktree?: string,
): Promise<string | null> {
  const mcpConfig = JSON.parse(mcpJsonContent)

  // Determine which opencode.json to modify
  const configDir = scope === "project" && worktree
    ? worktree
    : join(homedir(), ".config", "opencode")

  // Check for .jsonc variant first
  const jsonPath = join(configDir, "opencode.json")
  const jsoncPath = join(configDir, "opencode.jsonc")
  let targetPath = jsonPath
  try { await stat(jsoncPath); targetPath = jsoncPath } catch {
    // jsonPath is the default, no reassignment needed
  }

  // Read existing config
  let text: string
  try {
    text = await readFile(targetPath, "utf-8")
  } catch {
    text = `{\n  "$schema": "https://opencode.ai/config.json"\n}\n`
  }

  // Check for existing MCP with this name
  const parsed = parseJsonc(text)
  if (parsed.mcp?.[name]) {
    return (
      `Cannot install MCP "${name}": an MCP with this name already exists in ${targetPath}. ` +
      `Remove it first or choose a different package name.`
    )
  }

  // Build the MCP entry JSON
  const mcpEntryJson = JSON.stringify(mcpConfig, null, 2)
    .split("\n")
    .map((line, i) => i === 0 ? line : `      ${line}`)
    .join("\n")

  // Inject into the config
  if (parsed.mcp && typeof parsed.mcp === "object") {
    // mcp key exists -- add our entry inside it
    const mcpKeyMatch = text.match(/"mcp"\s*:\s*\{/)
    if (mcpKeyMatch && mcpKeyMatch.index !== undefined) {
      const mcpStart = mcpKeyMatch.index + mcpKeyMatch[0].length
      let depth = 1
      let pos = mcpStart
      while (pos < text.length && depth > 0) {
        if (text[pos] === '"') {
          pos++
          while (pos < text.length && text[pos] !== '"') {
            if (text[pos] === '\\') pos++
            pos++
          }
        }
        if (text[pos] === "{") depth++
        if (text[pos] === "}") depth--
        pos++
      }
      const mcpClose = pos - 1
      const before = text.slice(0, mcpClose).trimEnd()
      const needsComma = before.match(/[}\]"'\w\d]$/) ? "," : ""
      const entry = `\n    "${name}": ${mcpEntryJson}\n  `
      text = before + needsComma + entry + text.slice(mcpClose)
    }
  } else {
    // No mcp key -- add one
    const { addJsoncKey } = await import("../jsonc.js")
    const mcpBlock = `"mcp": {\n    "${name}": ${mcpEntryJson}\n  }`
    text = addJsoncKey(text, "mcp", mcpBlock)
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, text, "utf-8")

  return null
}
