#!/usr/bin/env node

/**
 * Neo setup script.
 *
 * Installs the Neo plugin into the user's OpenCode configuration:
 *   1. Copies the /neo command to ~/.config/opencode/commands/
 *   2. Adds "opencode-neo" to the plugin array in opencode.json(c)
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   npm run setup          # install
 *   npm run setup -- --check   # check if installed (exit 0 = yes, 1 = no)
 *   npm run setup -- --uninstall   # remove
 */

import { readFile, writeFile, copyFile, mkdir, rm, stat } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, "..")

const OPENCODE_DIR = join(homedir(), ".config", "opencode")
const COMMANDS_DIR = join(OPENCODE_DIR, "commands")
const NEO_COMMAND_SRC = join(PROJECT_ROOT, "commands", "neo.md")
const NEO_COMMAND_DEST = join(COMMANDS_DIR, "neo.md")

const PLUGIN_NAME = "opencode-neo"
const PACKAGE_JSON = join(PROJECT_ROOT, "package.json")

// Possible config file names (OpenCode supports both)
const CONFIG_CANDIDATES = [
  join(OPENCODE_DIR, "opencode.jsonc"),
  join(OPENCODE_DIR, "opencode.json"),
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Read the package version from package.json.
 */
async function getPackageVersion() {
  const pkg = JSON.parse(await readFile(PACKAGE_JSON, "utf-8"))
  return pkg.version
}

/**
 * Extract the neo-version from an installed neo.md command file.
 * Returns null if the file doesn't exist or has no version marker.
 */
async function getInstalledCommandVersion() {
  try {
    const content = await readFile(NEO_COMMAND_DEST, "utf-8")
    const match = content.match(/^neo-version:\s*"?([^"\n]+)"?\s*$/m)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Find the active OpenCode config file.
 */
async function findConfig() {
  for (const path of CONFIG_CANDIDATES) {
    if (await exists(path)) return path
  }
  return null
}

/**
 * Read a JSONC file (strip comments and trailing commas before parsing).
 * Handles // inside strings (URLs) correctly by processing character-by-character.
 */
function parseJsonc(text) {
  let result = ""
  let i = 0
  const len = text.length

  while (i < len) {
    // String literal -- copy verbatim
    if (text[i] === '"') {
      result += '"'
      i++
      while (i < len && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < len) {
          result += text[i] + text[i + 1]
          i += 2
        } else {
          result += text[i]
          i++
        }
      }
      if (i < len) { result += '"'; i++ }
      continue
    }

    // Single-line comment
    if (text[i] === '/' && i + 1 < len && text[i + 1] === '/') {
      // Skip to end of line
      while (i < len && text[i] !== '\n') i++
      continue
    }

    // Multi-line comment
    if (text[i] === '/' && i + 1 < len && text[i + 1] === '*') {
      i += 2
      while (i < len && !(text[i] === '*' && i + 1 < len && text[i + 1] === '/')) i++
      i += 2 // skip */
      continue
    }

    result += text[i]
    i++
  }

  // Strip trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, "$1")
  return JSON.parse(result)
}

/**
 * Add the plugin entry to the config text without disrupting JSONC formatting.
 * Uses string manipulation to preserve comments and trailing commas.
 */
function addPluginToConfig(text) {
  const parsed = parseJsonc(text)

  // Already has the plugin?
  if (Array.isArray(parsed.plugin) && parsed.plugin.includes(PLUGIN_NAME)) {
    return null // No change needed
  }

  if (Array.isArray(parsed.plugin)) {
    // Find the plugin array and append to it
    // Look for the closing ] of the plugin array
    const pluginMatch = text.match(/"plugin"\s*:\s*\[/)
    if (pluginMatch) {
      const startIdx = pluginMatch.index + pluginMatch[0].length
      // Find the matching ]
      let depth = 1
      let i = startIdx
      while (i < text.length && depth > 0) {
        if (text[i] === "[") depth++
        if (text[i] === "]") depth--
        i++
      }
      // i now points just past the closing ]
      const closingBracket = i - 1
      // Insert before the closing bracket
      const before = text.slice(0, closingBracket).trimEnd()
      const needsComma = before.match(/["'\w\d\]]$/) ? "," : ""
      return before + needsComma + ` "${PLUGIN_NAME}"` + text.slice(closingBracket)
    }
  }

  // No plugin key yet -- add one after the $schema line or at the top of the object
  const schemaMatch = text.match(/"?\$schema"?\s*:\s*"[^"]*"[,]?\s*\n/)
  if (schemaMatch) {
    const insertAt = schemaMatch.index + schemaMatch[0].length
    const indent = "  "
    const pluginLine = `${indent}"plugin": ["${PLUGIN_NAME}"],\n`
    return text.slice(0, insertAt) + pluginLine + text.slice(insertAt)
  }

  // Fallback: insert after the opening {
  const openBrace = text.indexOf("{")
  if (openBrace !== -1) {
    const insertAt = openBrace + 1
    const pluginLine = `\n  "plugin": ["${PLUGIN_NAME}"],`
    return text.slice(0, insertAt) + pluginLine + text.slice(insertAt)
  }

  return null
}

/**
 * Remove the plugin entry from the config text.
 */
function removePluginFromConfig(text) {
  const parsed = parseJsonc(text)
  if (!Array.isArray(parsed.plugin) || !parsed.plugin.includes(PLUGIN_NAME)) {
    return null // Not present
  }

  // Remove the plugin name from the array
  // Handle both "opencode-neo" alone and as part of a list
  let result = text

  // Case: it's the only plugin → remove the entire "plugin" key
  if (parsed.plugin.length === 1) {
    result = result.replace(/\s*"plugin"\s*:\s*\["opencode-neo"\]\s*,?\n?/, "\n")
  } else {
    // Case: remove just our entry from the array
    result = result.replace(/,?\s*"opencode-neo"\s*,?/, (match) => {
      // If there are commas on both sides, keep one
      if (match.startsWith(",") && match.endsWith(",")) return ","
      return ""
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function install() {
  const packageVersion = await getPackageVersion()
  const installedVersion = await getInstalledCommandVersion()
  const isUpdate = installedVersion && installedVersion !== packageVersion

  if (isUpdate) {
    console.log(`Updating Neo ${installedVersion} → ${packageVersion}...\n`)
  } else if (installedVersion) {
    console.log(`Installing Neo v${packageVersion} (already at this version)...\n`)
  } else {
    console.log(`Installing Neo v${packageVersion} into OpenCode...\n`)
  }

  // 1. Copy the /neo command (always -- may have changed between versions)
  await mkdir(COMMANDS_DIR, { recursive: true })
  await copyFile(NEO_COMMAND_SRC, NEO_COMMAND_DEST)
  if (isUpdate) {
    console.log(`  /neo command  → ${NEO_COMMAND_DEST} (updated)`)
  } else {
    console.log(`  /neo command  → ${NEO_COMMAND_DEST}`)
  }

  // 2. Add plugin to config
  const configPath = await findConfig()
  if (!configPath) {
    // Create a minimal config
    const minimalConfig = `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["${PLUGIN_NAME}"]
}
`
    const newPath = join(OPENCODE_DIR, "opencode.json")
    await writeFile(newPath, minimalConfig, "utf-8")
    console.log(`  plugin config → ${newPath} (created)`)
  } else {
    const text = await readFile(configPath, "utf-8")
    const updated = addPluginToConfig(text)
    if (updated) {
      await writeFile(configPath, updated, "utf-8")
      console.log(`  plugin config → ${configPath} (updated)`)
    } else {
      console.log(`  plugin config → ${configPath} (already configured)`)
    }
  }

  console.log("\nDone. Restart OpenCode to activate Neo.")
}

async function uninstall() {
  console.log("Uninstalling Neo from OpenCode...\n")

  // 1. Remove the /neo command
  if (await exists(NEO_COMMAND_DEST)) {
    await rm(NEO_COMMAND_DEST)
    console.log(`  Removed ${NEO_COMMAND_DEST}`)
  } else {
    console.log(`  /neo command not found (already removed)`)
  }

  // 2. Remove plugin from config
  const configPath = await findConfig()
  if (configPath) {
    const text = await readFile(configPath, "utf-8")
    const updated = removePluginFromConfig(text)
    if (updated) {
      await writeFile(configPath, updated, "utf-8")
      console.log(`  Removed plugin from ${configPath}`)
    } else {
      console.log(`  Plugin not in ${configPath} (already removed)`)
    }
  }

  console.log("\nDone. Restart OpenCode to deactivate Neo.")
}

async function check() {
  const configPath = await findConfig()
  if (!configPath) {
    console.log("Not installed: no OpenCode config found")
    process.exit(1)
  }

  const text = await readFile(configPath, "utf-8")
  const parsed = parseJsonc(text)
  const hasPlugin = Array.isArray(parsed.plugin) && parsed.plugin.includes(PLUGIN_NAME)
  const hasCommand = await exists(NEO_COMMAND_DEST)

  const packageVersion = await getPackageVersion()
  const installedVersion = await getInstalledCommandVersion()

  if (hasPlugin && hasCommand) {
    if (installedVersion && installedVersion !== packageVersion) {
      console.log(`Installed (update available: ${installedVersion} → ${packageVersion})`)
      console.log(`  plugin:  ${configPath}`)
      console.log(`  command: ${NEO_COMMAND_DEST} (v${installedVersion})`)
      console.log(`  package: v${packageVersion}`)
      console.log("\nRun 'npm run setup' to update.")
      process.exit(0)
    }
    console.log(`Installed (v${packageVersion})`)
    console.log(`  plugin:  ${configPath}`)
    console.log(`  command: ${NEO_COMMAND_DEST}`)
    process.exit(0)
  }

  if (!hasPlugin && !hasCommand) {
    console.log("Not installed")
    process.exit(1)
  }

  console.log("Partially installed")
  console.log(`  plugin:  ${hasPlugin ? "yes" : "MISSING"}`)
  console.log(`  command: ${hasCommand ? (installedVersion ? `yes (v${installedVersion})` : "yes") : "MISSING"}`)
  console.log("\nRun 'npm run setup' to fix.")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)

if (args.includes("--uninstall")) {
  await uninstall()
} else if (args.includes("--check")) {
  await check()
} else {
  await install()
}
