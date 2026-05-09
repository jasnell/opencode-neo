import { join } from "node:path"
import { writeFile, mkdir } from "node:fs/promises"
import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, Shell } from "../types.js"
import { getConfigManager } from "../config.js"

export function buildConfigTool(config: NeoConfig, _$: Shell, worktree: string) {
  return tool({
    description:
      "View or manage Neo configuration. Shows the active config with its layers " +
      "(global vs project), or initializes a project-level config for the " +
      "current workspace. Project configs override global settings for " +
      "installed packages, profiles, and locks.",
    args: {
      action: tool.schema
        .enum(["show", "init", "paths"])
        .describe(
          "'show' displays the merged config summary, " +
            "'init' creates a project-level .opencode/neo.json, " +
            "'paths' shows the config file locations",
        ),
    },
    async execute(args, _context) {
      switch (args.action) {
        case "show":
          return handleShow(config)
        case "init":
          return handleInit(worktree)
        case "paths":
          return handlePaths(worktree)
      }
    },
  })
}

function handleShow(config: NeoConfig): string {
  const mgr = getConfigManager()

  const lines = [
    "Neo Configuration (merged view):",
    "",
    `Registries: ${config.registries.length}`,
  ]

  for (const r of config.registries) {
    lines.push(`  - ${r.name} ${r.enabled ? "(enabled)" : "(disabled)"}: ${r.url}`)
  }

  lines.push("")
  lines.push(`Installed packages: ${Object.keys(config.installed).length}`)

  const globalPkgs = Object.entries(config.installed).filter(([_, p]) => p.scope === "global")
  const projectPkgs = Object.entries(config.installed).filter(([_, p]) => p.scope === "project")

  if (globalPkgs.length > 0) {
    lines.push(`  Global (${globalPkgs.length}): ${globalPkgs.map(([n]) => n).join(", ")}`)
  }
  if (projectPkgs.length > 0) {
    lines.push(`  Project (${projectPkgs.length}): ${projectPkgs.map(([n]) => n).join(", ")}`)
  }

  const lockCount = Object.keys(config.locks ?? {}).length
  if (lockCount > 0) {
    lines.push(`\nLocked packages: ${lockCount}`)
  }

  const profileCount = Object.keys(config.profiles ?? {}).length
  if (profileCount > 0) {
    lines.push(`\nProfiles: ${profileCount}`)
    if (config.activeProfile) {
      lines.push(`  Active: ${config.activeProfile}`)
    }
  }

  lines.push("")
  lines.push(`Cache TTL: ${config.cache.ttl}s`)
  lines.push(`Cache dir: ${config.cache.dir}`)

  if (mgr) {
    lines.push("")
    lines.push("Config layers:")
    lines.push(`  Global: ${mgr.globalConfigPath}`)
    lines.push(`  Project: ${mgr.projectConfigPath ?? "(none)"}${mgr.hasProjectConfig ? "" : " -- run neo_config({ action: 'init' }) to create"}`)
  }

  return lines.join("\n")
}

async function handleInit(worktree: string): Promise<string> {
  const projectDir = join(worktree, ".opencode")
  const projectFile = join(projectDir, "neo.json")

  // Check if it already exists
  const mgr = getConfigManager()
  if (mgr?.hasProjectConfig) {
    return `Project config already exists at ${projectFile}.`
  }

  const projectConfig = {
    installed: {},
    profiles: {},
  }

  await mkdir(projectDir, { recursive: true })
  await writeFile(projectFile, JSON.stringify(projectConfig, null, 2) + "\n", "utf-8")

  return [
    `Project config created at ${projectFile}.`,
    "",
    "This project now has its own Neo config layer. When you install packages",
    "with scope 'project', they'll be tracked here. Profiles and locks for",
    "project-scoped packages are also stored here.",
    "",
    "Consider committing .opencode/neo.json so your team shares the same setup.",
  ].join("\n")
}

function handlePaths(worktree: string): string {
  const mgr = getConfigManager()
  const projectFile = join(worktree, ".opencode", "neo.json")

  return [
    "Config file locations:",
    "",
    `  Global:  ${mgr?.globalConfigPath ?? "~/.config/opencode/neo.json"}`,
    `  Project: ${projectFile}${mgr?.hasProjectConfig ? " (exists)" : " (not created)"}`,
    "",
    "Precedence: project overrides global for installed packages, profiles, and locks.",
    "Registries and cache settings are always global.",
  ].join("\n")
}
