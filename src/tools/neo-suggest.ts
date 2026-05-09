import { join } from "node:path"
import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, Shell } from "../types.js"
import { detectProject, suggestPackages } from "../packages/detect.js"

const NO_REGISTRIES_MSG = `Neo is not configured yet -- no package registries have been added.

To get started, call neo_registries to add your first registry.`

export function buildSuggestTool(config: NeoConfig, _$: Shell) {
  return tool({
    description:
      "Analyze the current project and suggest relevant Neo packages. " +
      "Detects languages, frameworks, and tools from project config files " +
      "(package.json, Cargo.toml, go.mod, Dockerfile, etc.) and matches " +
      "against available packages in configured registries.",
    args: {
      path: tool.schema
        .string()
        .optional()
        .describe("Project directory to analyze (defaults to current working directory)"),
    },
    async execute(args, context) {
      if (config.registries.length === 0) {
        return NO_REGISTRIES_MSG
      }

      const dir = args.path
        ? (args.path.startsWith("/") ? args.path : join(context.directory, args.path))
        : context.directory

      const projectCtx = await detectProject(dir)

      if (
        projectCtx.languages.length === 0 &&
        projectCtx.frameworks.length === 0 &&
        projectCtx.tools.length === 0
      ) {
        return "Could not detect project characteristics. No config files (package.json, go.mod, Cargo.toml, etc.) found."
      }

      const lines = [
        "Detected project context:",
        `  Languages: ${projectCtx.languages.join(", ") || "none"}`,
        `  Frameworks: ${projectCtx.frameworks.join(", ") || "none"}`,
        `  Tools: ${projectCtx.tools.join(", ") || "none"}`,
        "",
      ]

      const suggestions = await suggestPackages(config, projectCtx)

      if (suggestions.length === 0) {
        lines.push("No matching packages found in configured registries.")
        return lines.join("\n")
      }

      lines.push(`${suggestions.length} suggested package(s):`)
      lines.push("")

      for (const s of suggestions) {
        lines.push(`- **${s.name}** (${s.type}) v${s.version} [${s.registry}]`)
        lines.push(`  ${s.description}`)
        if (s.tags.length) lines.push(`  tags: ${s.tags.join(", ")}`)
      }

      lines.push("")
      lines.push("Use neo_load to try a skill in the current session, or neo_install for persistent installation.")

      return lines.join("\n")
    },
  })
}
