import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, PackageType, Shell } from "../types.js"
import { resolvePackage } from "../registry/resolver.js"
import { registryCacheDir } from "../registry/cache.js"
import { loadRegistryIndex } from "../registry/manager.js"

const NO_REGISTRIES_MSG = `Neo is not configured yet -- no package registries have been added.

To get started, call neo_registries to add your first registry:

  neo_registries({ action: "add", url: "https://github.com/your-org/opencode-packages", name: "my-registry" })

A registry is a git repository containing a registry.json index file and skill/tool/command packages. Ask the user which git repository they'd like to use.`

export function buildListTool(config: NeoConfig, _$: Shell) {
  return tool({
    description:
      "List Neo packages. Shows installed packages by default. " +
      "Use filter 'available' to show all packages across registries, " +
      "or 'updates' to show installed packages with newer versions available.",
    args: {
      filter: tool.schema
        .enum(["installed", "available", "updates"])
        .optional()
        .default("installed")
        .describe("What to list: installed packages, all available, or packages with updates"),
      type: tool.schema
        .enum(["skill", "tool", "command", "agent", "mcp"])
        .optional()
        .describe("Filter by package type"),
    },
    async execute(args) {
      const typeFilter = args.type as PackageType | undefined

      if (args.filter === "installed") {
        return listInstalled(config, typeFilter)
      }

      if (config.registries.length === 0) {
        return NO_REGISTRIES_MSG
      }

      if (args.filter === "available") {
        return listAvailable(config, typeFilter)
      }

      if (args.filter === "updates") {
        return listUpdates(config, typeFilter)
      }

      return "Unknown filter. Use 'installed', 'available', or 'updates'."
    },
  })
}

function listInstalled(config: NeoConfig, typeFilter?: PackageType): string {
  const entries = Object.entries(config.installed)
    .filter(([_, pkg]) => !typeFilter || pkg.type === typeFilter)

  if (entries.length === 0) {
    return typeFilter
      ? `No installed ${typeFilter} packages.`
      : "No packages installed. Use neo_search to find packages, then neo_install to install them."
  }

  const lines = entries.map(
    ([name, pkg]) =>
      `- **${name}** (${pkg.type}) v${pkg.version} [${pkg.registry}] -- ${pkg.scope}, installed ${pkg.installedAt.split("T")[0]}`,
  )

  return [`${entries.length} installed package(s):\n`, ...lines].join("\n")
}

async function listAvailable(config: NeoConfig, typeFilter?: PackageType): Promise<string> {
  // Search with empty query returns nothing -- instead we enumerate all packages
  // by searching with a very broad query (empty string matches nothing in our scorer,
  // so we need a different approach)
  const allPackages: Array<{ name: string; type: string; description: string; version: string; registry: string }> = []

  for (const reg of config.registries) {
    if (!reg.enabled) continue
    const cacheDir = registryCacheDir(config, reg.name)
    const index = await loadRegistryIndex(cacheDir)
    if (!index) continue

    for (const [name, entry] of Object.entries(index.packages)) {
      if (typeFilter && entry.type !== typeFilter) continue
      allPackages.push({
        name,
        type: entry.type,
        description: entry.description,
        version: entry.version,
        registry: reg.name,
      })
    }
  }

  if (allPackages.length === 0) {
    return typeFilter
      ? `No ${typeFilter} packages available in configured registries.`
      : "No packages available in configured registries."
  }

  const installed = new Set(Object.keys(config.installed))
  const lines = allPackages.map(
    (p) =>
      `- **${p.name}** (${p.type}) v${p.version} [${p.registry}]${installed.has(p.name) ? " [installed]" : ""}\n  ${p.description}`,
  )

  return [`${allPackages.length} available package(s):\n`, ...lines].join("\n")
}

async function listUpdates(config: NeoConfig, typeFilter?: PackageType): Promise<string> {
  const updates: Array<{ name: string; installed: string; available: string; registry: string }> = []

  for (const [name, pkg] of Object.entries(config.installed)) {
    if (typeFilter && pkg.type !== typeFilter) continue
    const resolved = await resolvePackage(config, name)
    if (resolved && resolved.entry.version !== pkg.version) {
      updates.push({
        name,
        installed: pkg.version,
        available: resolved.entry.version,
        registry: resolved.registry,
      })
    }
  }

  if (updates.length === 0) {
    return "All installed packages are up to date."
  }

  const lines = updates.map(
    (u) => `- **${u.name}**: ${u.installed} -> ${u.available} [${u.registry}]`,
  )

  return [`${updates.length} update(s) available:\n`, ...lines].join("\n")
}
