import { tool } from "@opencode-ai/plugin"
import { Effect } from "effect"
import type { NeoConfig, Shell } from "../types.js"
import { uninstallPackage } from "../packages/uninstaller.js"

export function buildRemoveTool(config: NeoConfig, _$: Shell, worktree: string) {
  return tool({
    description:
      "Uninstall a previously installed Neo package. " +
      "Removes the package files and updates the installed manifest.",
    args: {
      name: tool.schema.string().describe("Package name to uninstall"),
    },
    async execute(args, context) {
      if (!config.installed[args.name]) {
        return `Package "${args.name}" is not installed.`
      }

      await Effect.runPromise(
        context.ask({
          permission: "neo.remove",
          patterns: [args.name],
          always: [`neo.remove.${args.name}`],
          metadata: {
            package: args.name,
            action: "Remove installed Neo package",
          },
        }),
      )

      return uninstallPackage(config, args.name, worktree)
    },
  })
}
