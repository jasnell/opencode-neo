import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, Shell } from "../types.js"
import {
  addRegistry,
  removeRegistry,
  listRegistries,
  refreshAllRegistries,
  getLinkedRegistries,
  normalizeUrl,
} from "../registry/manager.js"

export function buildRegistriesTool(config: NeoConfig, $: Shell) {
  return tool({
    description:
      "Manage Neo package registries. Registries can be git repositories or local " +
      "directories. Use this to add, remove, list, refresh, or discover linked " +
      "registries. Registries can link to other registries they recommend, extend, " +
      "or depend on (federation). Project registries at .opencode/neo/ are auto-discovered.",
    args: {
      action: tool.schema
        .enum(["list", "add", "remove", "refresh", "links"])
        .describe(
          "Action to perform: 'list' configured registries, 'add'/'remove' a registry, " +
            "'refresh' caches, or 'links' to discover linked registries via federation",
        ),
      url: tool.schema
        .string()
        .optional()
        .describe("Git repository URL or local directory path (required for 'add')"),
      name: tool.schema
        .string()
        .optional()
        .describe("Registry name (required for 'add' and 'remove')"),
      branch: tool.schema
        .string()
        .optional()
        .default("main")
        .describe("Git branch to track (for git registries, defaults to 'main')"),
      local: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("If true, treat the URL as a local directory path instead of a git URL"),
    },
    async execute(args) {
      switch (args.action) {
        case "list":
          return handleList(config)
        case "add":
          return handleAdd($, config, args.name, args.url, args.branch, args.local)
        case "remove":
          return handleRemove(config, args.name)
        case "refresh":
          return handleRefresh($, config)
        case "links":
          return handleLinks(config)
      }
    },
  })
}

function handleList(config: NeoConfig): string {
  const registries = listRegistries(config)
  if (registries.length === 0) {
    return [
      "No registries configured.",
      "",
      "Add a registry to get started:",
      '  neo_registries({ action: "add", url: "https://github.com/your-org/opencode-packages", name: "my-registry" })',
      "",
      "A registry is a git repository with a registry.json file that indexes available packages.",
    ].join("\n")
  }

  const lines = registries.map((r) => {
    const tags: string[] = []
    if (!r.enabled) tags.push("disabled")
    if (r.type === "local") tags.push("local")
    if (r.auto) tags.push("auto-discovered")
    const tagStr = tags.length ? ` (${tags.join(", ")})` : ""
    const detail = r.type === "local" ? r.url : `${r.url} (branch: ${r.branch})`
    return `- **${r.name}**${tagStr}\n  ${detail}`
  })

  return [`${registries.length} registry(ies):\n`, ...lines].join("\n")
}

async function handleAdd(
  $: Shell,
  config: NeoConfig,
  name?: string,
  url?: string,
  branch?: string,
  local?: boolean,
): Promise<string> {
  if (!name) {
    return "A registry name is required. Provide a short identifier like 'community' or 'company'."
  }
  if (!url) {
    return local
      ? "A local directory path is required."
      : "A git repository URL or local path is required. Set local=true for local directories."
  }

  const type = local ? "local" as const : "git" as const

  try {
    const result = await addRegistry($, config, name, url, branch ?? "main", type)

    const lines = [
      `Registry "${name}" added successfully from ${url}.`,
      `${result.packageCount} package(s) available.`,
    ]

    // Surface linked registries if any
    if (result.links.length > 0) {
    const configuredUrls = new Set(
      config.registries.map((r) => normalizeUrl(r.url)),
    )

      lines.push("")
      lines.push(`This registry links to ${result.links.length} other registry(ies):`)

      for (const link of result.links) {
        const normalized = normalizeUrl(link.url)
        const added = configuredUrls.has(normalized)
        const status = added ? "[already added]" : "[not added]"

        lines.push(
          `  - **${link.name}** (${link.relationship}) ${status}`,
        )
        lines.push(`    ${link.url}`)
        if (link.description) {
          lines.push(`    ${link.description}`)
        }
      }

      const notAdded = result.links.filter((l) => !configuredUrls.has(normalizeUrl(l.url)))

      if (notAdded.length > 0) {
        lines.push("")
        lines.push(
          "To add a linked registry, use neo_registries with action 'add' and the URL above.",
        )
      }
    }

    lines.push("")
    lines.push("Use neo_search or neo_list to browse available packages.")

    return lines.join("\n")
  } catch (err: any) {
    return `Failed to add registry "${name}": ${err.message}`
  }
}

async function handleRemove(config: NeoConfig, name?: string): Promise<string> {
  if (!name) {
    return "A registry name is required. Use neo_registries({ action: 'list' }) to see configured registries."
  }

  try {
    await removeRegistry(config, name)
    return `Registry "${name}" removed.`
  } catch (err: any) {
    return `Failed to remove registry "${name}": ${err.message}`
  }
}

async function handleRefresh($: Shell, config: NeoConfig): Promise<string> {
  if (config.registries.length === 0) {
    return "No registries configured. Add a registry first."
  }

  try {
    await refreshAllRegistries($, config)
    return `Refreshed ${config.registries.filter((r) => r.enabled).length} registry(ies).`
  } catch (err: any) {
    return `Error refreshing registries: ${err.message}`
  }
}

async function handleLinks(config: NeoConfig): Promise<string> {
  if (config.registries.length === 0) {
    return "No registries configured. Add a registry first to discover linked registries."
  }

  const linked = await getLinkedRegistries(config)

  if (linked.length === 0) {
    return "No linked registries found. None of your configured registries declare links to other registries."
  }

  const lines = [
    `${linked.length} linked registry(ies) discovered across your configured registries:`,
    "",
  ]

  for (const info of linked) {
    const status = info.alreadyAdded ? "[already added]" : "[not added]"
    lines.push(
      `- **${info.link.name}** (${info.link.relationship}) ${status}`,
    )
    lines.push(`  ${info.link.url}`)
    if (info.link.description) {
      lines.push(`  ${info.link.description}`)
    }
    lines.push(`  linked by: ${info.sourceRegistry}`)
    lines.push("")
  }

  const notAdded = linked.filter((l) => !l.alreadyAdded)
  if (notAdded.length > 0) {
    lines.push(
      `${notAdded.length} linked registry(ies) are not yet added. To add one:`,
    )
    lines.push("")
    for (const info of notAdded) {
      lines.push(
        `  neo_registries({ action: "add", url: "${info.link.url}", name: "${info.link.name}"${info.link.branch && info.link.branch !== "main" ? `, branch: "${info.link.branch}"` : ""} })`,
      )
    }
  }

  return lines.join("\n")
}
