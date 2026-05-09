import { tool } from "@opencode-ai/plugin"
import { Effect } from "effect"
import type { NeoConfig, Shell } from "../types.js"
import { updatePackage } from "../packages/installer.js"
import { diffPackage } from "../packages/diff.js"
import { lockPackage, isLockedBehind } from "../packages/lockfile.js"

export function buildUpdateTool(config: NeoConfig, $: Shell, worktree: string) {
  return tool({
    description:
      "Update installed Neo packages to the latest versions from registries. " +
      "Specify a package name to update one, or omit to update all. " +
      "Use preview=true to see what changed before applying. " +
      "Locked packages are skipped unless force=true.",
    args: {
      name: tool.schema
        .string()
        .optional()
        .describe("Specific package to update, or omit to update all"),
      preview: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Show what would change without applying updates"),
      force: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Update even if the package is version-locked"),
      lock: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Re-lock updated packages to the new SHA"),
    },
    async execute(args, context) {
      // Request permission
      await Effect.runPromise(
        context.ask({
          permission: "neo.update",
          patterns: [args.name ?? "*"],
          always: ["neo.update"],
          metadata: {
            package: args.name ?? "all",
            action: args.preview ? "Preview Neo package updates" : "Update Neo packages",
          },
        }),
      )

      // Refresh registries first
      const { refreshAllRegistries } = await import("../registry/manager.js")
      await refreshAllRegistries($, config)

      if (args.name) {
        return updateSingle($, config, args.name, worktree, args.preview ?? false, args.force ?? false, args.lock ?? false)
      }

      // Update all
      const names = Object.keys(config.installed)
      if (names.length === 0) {
        return "No packages installed."
      }

      const results: string[] = []
      for (const name of names) {
        const result = await updateSingle($, config, name, worktree, args.preview ?? false, args.force ?? false, args.lock ?? false)
        results.push(result)
      }

      return results.join("\n---\n")
    },
  })
}

async function updateSingle(
  $: Shell,
  config: NeoConfig,
  name: string,
  worktree: string,
  preview: boolean,
  force: boolean,
  lock: boolean,
): Promise<string> {
  // Check lock status
  const lockStatus = await isLockedBehind($, config, name)
  if (lockStatus && !lockStatus.behind) {
    return `${name}: locked and up to date (SHA ${lockStatus.lockedSha.slice(0, 8)})`
  }
  if (lockStatus && lockStatus.behind && !force) {
    return (
      `${name}: version-locked (SHA ${lockStatus.lockedSha.slice(0, 8)}). ` +
      `Registry has moved to ${lockStatus.currentSha.slice(0, 8)}. Use force=true to update.`
    )
  }

  if (preview) {
    return diffPackage($, config, name)
  }

  const result = await updatePackage(config, name, worktree)

  // Re-lock if requested
  if (lock && config.installed[name]) {
    await lockPackage($, config, name)
  }

  return `${name}: ${result}`
}
