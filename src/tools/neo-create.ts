import { join } from "node:path"
import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, PackageType, Shell } from "../types.js"
import { scaffoldRegistry, scaffoldPackage } from "../scaffolding.js"

export function buildCreateTool(config: NeoConfig, $: Shell, _worktree: string) {
  return tool({
    description:
      "Scaffold a new Neo registry or add a new package to an existing registry. " +
      "Use type 'registry' to create a new empty registry with the correct structure. " +
      "Use type 'skill', 'tool', 'command', 'agent', or 'mcp' to add a new package to a registry directory.",
    args: {
      type: tool.schema
        .enum(["registry", "skill", "tool", "command", "agent", "mcp"])
        .describe(
          "What to create: 'registry' scaffolds a new registry repo, " +
            "'skill'/'tool'/'command'/'agent'/'mcp' adds a package to an existing registry",
        ),
      name: tool.schema
        .string()
        .describe("Name of the registry or package to create"),
      path: tool.schema
        .string()
        .optional()
        .describe(
          "Directory path. For 'registry': where to create it (defaults to ./<name>). " +
            "For packages: the registry root directory (defaults to current working directory).",
        ),
      description: tool.schema
        .string()
        .optional()
        .default("")
        .describe("Description of the registry or package"),
      git: tool.schema
        .boolean()
        .optional()
        .default(true)
        .describe("For 'registry': initialize a git repo (defaults to true)"),
    },
    async execute(args, context) {
      const description = args.description || `A Neo ${args.type}`

      if (args.type === "registry") {
        const dir = resolvePath(args.path ?? `./${args.name}`, context.directory)
        return scaffoldRegistry($, dir, args.name, description, args.git ?? true)
      }

      // Package scaffolding -- needs an existing registry directory
      const registryDir = resolvePath(args.path ?? ".", context.directory)
      return scaffoldPackage(
        registryDir,
        args.type as PackageType,
        args.name,
        description,
      )
    },
  })
}

/**
 * Resolve a path that may be relative to the session's working directory.
 */
function resolvePath(p: string, cwd: string): string {
  if (p.startsWith("/")) return p
  return join(cwd, p)
}
