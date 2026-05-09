import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, PackageType, Shell } from "../types.js"
import { searchPackages } from "../registry/resolver.js"

const NO_REGISTRIES_MSG = `Neo is not configured yet -- no package registries have been added.

To get started, call neo_registries to add your first registry:

  neo_registries({ action: "add", url: "https://github.com/your-org/opencode-packages", name: "my-registry" })

A registry is a git repository containing a registry.json index file and skill/tool/command packages. Ask the user which git repository they'd like to use.`

export function buildSearchTool(config: NeoConfig, _$: Shell) {
  return tool({
    description:
      "Search Neo package registries for skills, tools, and commands that can extend your capabilities. " +
      "Returns matching packages with name, type, description, version, and source registry. " +
      "Use this when you need specialized knowledge or tools that aren't currently available.",
    args: {
      query: tool.schema
        .string()
        .describe("Search query -- a name, keyword, or description fragment"),
      type: tool.schema
        .enum(["skill", "tool", "command", "agent"])
        .optional()
        .describe("Filter results by package type"),
    },
    async execute(args) {
      if (config.registries.length === 0) {
        return NO_REGISTRIES_MSG
      }

      const results = await searchPackages(
        config,
        args.query,
        args.type as PackageType | undefined,
      )

      if (results.length === 0) {
        return `No packages found matching "${args.query}"${args.type ? ` (type: ${args.type})` : ""}.`
      }

      const lines = results.map(
        (r) =>
          `- **${r.name}** (${r.type}) v${r.version} [${r.registry}]\n  ${r.description}${r.tags.length ? `\n  tags: ${r.tags.join(", ")}` : ""}`,
      )

      return [`Found ${results.length} package(s):\n`, ...lines].join("\n")
    },
  })
}
