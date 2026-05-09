import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, Shell } from "../types.js"
import { saveConfig } from "../config.js"
import { loadSkill } from "../loader/skill.js"

export function buildProfileTool(config: NeoConfig, _$: Shell) {
  return tool({
    description:
      "Manage Neo profiles. A profile is a named set of packages that can be " +
      "activated together. When activated, skills in the profile are loaded " +
      "into the current session. Actions: list, create, delete, activate, show.",
    args: {
      action: tool.schema
        .enum(["list", "create", "delete", "activate", "show"])
        .describe("Action to perform"),
      name: tool.schema
        .string()
        .optional()
        .describe("Profile name (required for create, delete, activate, show)"),
      packages: tool.schema
        .string()
        .optional()
        .describe("Comma-separated package names (required for create)"),
      description: tool.schema
        .string()
        .optional()
        .describe("Profile description (for create)"),
    },
    async execute(args) {
      switch (args.action) {
        case "list":
          return handleList(config)
        case "create":
          return handleCreate(config, args.name, args.packages, args.description)
        case "delete":
          return handleDelete(config, args.name)
        case "activate":
          return handleActivate(config, args.name)
        case "show":
          return handleShow(config, args.name)
      }
    },
  })
}

function handleList(config: NeoConfig): string {
  const profiles = config.profiles ?? {}
  const names = Object.keys(profiles)

  if (names.length === 0) {
    return [
      "No profiles configured.",
      "",
      "Create one with:",
      '  neo_profile({ action: "create", name: "my-profile", packages: "pkg1,pkg2,pkg3" })',
    ].join("\n")
  }

  const lines = [`${names.length} profile(s):\n`]
  for (const name of names) {
    const p = profiles[name]
    const active = config.activeProfile === name ? " (active)" : ""
    lines.push(`- **${name}**${active}: ${p.packages.join(", ")}`)
    if (p.description) lines.push(`  ${p.description}`)
  }
  return lines.join("\n")
}

async function handleCreate(
  config: NeoConfig,
  name?: string,
  packages?: string,
  description?: string,
): Promise<string> {
  if (!name) return "Profile name is required."
  if (!packages) return "Package list is required (comma-separated names)."

  const pkgList = packages.split(",").map((p) => p.trim()).filter(Boolean)
  if (pkgList.length === 0) return "At least one package name is required."

  if (!config.profiles) config.profiles = {}
  config.profiles[name] = { packages: pkgList, description }
  await saveConfig(config)

  return `Profile "${name}" created with ${pkgList.length} package(s): ${pkgList.join(", ")}`
}

async function handleDelete(config: NeoConfig, name?: string): Promise<string> {
  if (!name) return "Profile name is required."
  if (!config.profiles?.[name]) return `Profile "${name}" does not exist.`

  delete config.profiles[name]
  if (config.activeProfile === name) {
    config.activeProfile = undefined
  }
  await saveConfig(config)

  return `Profile "${name}" deleted.`
}

async function handleActivate(config: NeoConfig, name?: string): Promise<string> {
  if (!name) return "Profile name is required."
  const profile = config.profiles?.[name]
  if (!profile) return `Profile "${name}" does not exist.`

  config.activeProfile = name
  await saveConfig(config)

  // Load all skills from the profile into the current session.
  // Accumulate the actual skill content so it gets injected into the
  // conversation context (returned as part of the tool output).
  const loadedNames: string[] = []
  const loadedContent: string[] = []
  const failed: string[] = []

  for (const pkg of profile.packages) {
    // Check if it's a skill (either installed or in registry)
    const installed = config.installed[pkg]
    if (installed && installed.type !== "skill") continue

    try {
      const result = await loadSkill(config, pkg)
      if (result.includes("<skill_content")) {
        loadedNames.push(pkg)
        loadedContent.push(result)
      }
    } catch {
      failed.push(pkg)
    }
  }

  const lines = [`Profile "${name}" activated.`]
  if (loadedNames.length > 0) {
    lines.push(`Loaded ${loadedNames.length} skill(s): ${loadedNames.join(", ")}`)
  }
  if (failed.length > 0) {
    lines.push(`Failed to load: ${failed.join(", ")}`)
  }
  lines.push("")
  lines.push("Non-skill packages in this profile should be installed via neo_install.")

  // Append the actual skill content so it's injected into conversation context
  if (loadedContent.length > 0) {
    lines.push("")
    lines.push(...loadedContent)
  }

  return lines.join("\n")
}

function handleShow(config: NeoConfig, name?: string): string {
  if (!name) return "Profile name is required."
  const profile = config.profiles?.[name]
  if (!profile) return `Profile "${name}" does not exist.`

  const active = config.activeProfile === name ? " (active)" : ""
  const lines = [
    `Profile: ${name}${active}`,
    profile.description ? `Description: ${profile.description}` : "",
    "",
    "Packages:",
  ].filter(Boolean)

  for (const pkg of profile.packages) {
    const installed = config.installed[pkg]
    const status = installed ? `installed (${installed.type} v${installed.version})` : "not installed"
    lines.push(`  - ${pkg}: ${status}`)
  }

  return lines.join("\n")
}
