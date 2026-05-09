import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, Shell } from "../types.js"
import { loadSkill } from "../loader/skill.js"
import { loadCommand } from "../loader/command.js"
import { resolvePackage } from "../registry/resolver.js"

const NO_REGISTRIES_MSG = `Neo is not configured yet -- no package registries have been added.

To get started, call neo_registries to add your first registry:

  neo_registries({ action: "add", url: "https://github.com/your-org/opencode-packages", name: "my-registry" })

A registry is a git repository containing a registry.json index file and skill/tool/command packages. Ask the user which git repository they'd like to use.`

export function buildLoadTool(config: NeoConfig, _$: Shell) {
  return tool({
    description:
      "Dynamically load a skill or command from Neo registries for the current session. " +
      "Skills are loaded as instructions into the conversation context (like the built-in skill tool). " +
      "Commands are loaded as templates to follow. " +
      "For executing tools, use neo_exec instead.",
    args: {
      name: tool.schema.string().describe("Package name to load"),
      args: tool.schema
        .string()
        .optional()
        .default("")
        .describe("Arguments to pass to the command template (only for commands)"),
    },
    async execute(execArgs) {
      if (config.registries.length === 0) {
        return NO_REGISTRIES_MSG
      }

      // First resolve to determine the package type
      const resolved = await resolvePackage(config, execArgs.name)
      if (!resolved) {
        return `Package "${execArgs.name}" not found in any configured registry. Use neo_search to discover available packages.`
      }

      switch (resolved.entry.type) {
        case "skill":
          return loadSkill(config, execArgs.name)
        case "command":
          return loadCommand(config, execArgs.name, execArgs.args ?? "")
        case "tool":
          return (
            `Package "${execArgs.name}" is a tool, not a skill or command. ` +
            `To execute it dynamically, use neo_exec. ` +
            `To install it persistently, use neo_install.`
          )
        case "agent":
          return (
            `Package "${execArgs.name}" is an agent. Agents must be installed ` +
            `to be available (they can't be loaded dynamically). ` +
            `Use neo_install to install it.`
          )
      }
    },
  })
}
