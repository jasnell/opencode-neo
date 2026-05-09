import { join } from "node:path"
import { tool } from "@opencode-ai/plugin"
import { Effect } from "effect"
import type { NeoConfig, Shell } from "../types.js"
import { installPackage } from "../packages/installer.js"
import { scanToolSource, formatScanReport } from "../packages/scanner.js"
import { resolvePackage } from "../registry/resolver.js"
import { readCachedFile } from "../registry/cache.js"
import { resolveBundle } from "../packages/bundles.js"
import { checkDependencies, formatDependencyCheck } from "../packages/dependencies.js"
import { lockPackage } from "../packages/lockfile.js"

const NO_REGISTRIES_MSG = `Neo is not configured yet -- no package registries have been added.

To get started, call neo_registries to add your first registry:

  neo_registries({ action: "add", url: "https://github.com/your-org/opencode-packages", name: "my-registry" })

A registry is a git repository containing a registry.json index file and skill/tool/command packages. Ask the user which git repository they'd like to use.`

export function buildInstallTool(config: NeoConfig, $: Shell, worktree: string) {
  return tool({
    description:
      "Install a package or bundle from Neo registries persistently. " +
      "Skills become available via the built-in skill tool immediately. " +
      "Tools and commands are available after restarting OpenCode. " +
      "For tool packages, a security scan is performed before installation. " +
      "Set bundle=true to install a named bundle (all packages in it). " +
      "Use neo_search to discover available packages first.",
    args: {
      name: tool.schema.string().describe("Package or bundle name to install"),
      scope: tool.schema
        .enum(["global", "project"])
        .optional()
        .default("global")
        .describe(
          "Install scope: 'global' installs to ~/.config/opencode/, " +
            "'project' installs to .opencode/ in the current project",
        ),
      bundle: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("If true, treat the name as a bundle and install all packages in it"),
      lock: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("If true, pin the installed version to the current git SHA"),
    },
    async execute(args, context) {
      if (config.registries.length === 0) {
        return NO_REGISTRIES_MSG
      }

      // Bundle install
      if (args.bundle) {
        return installBundle($, config, args.name, args.scope as "global" | "project", args.lock ?? false, worktree, context)
      }

      // Single package install
      return installSingle($, config, args.name, args.scope as "global" | "project", args.lock ?? false, worktree, context)
    },
  })
}

async function installSingle(
  $: Shell,
  config: NeoConfig,
  name: string,
  scope: "global" | "project",
  lock: boolean,
  worktree: string,
  context: any,
): Promise<string> {
  const resolved = await resolvePackage(config, name)
  if (!resolved) {
    return `Package "${name}" not found in any configured registry.`
  }

  // Security scan for tools
  let scanReport: string | null = null
  if (resolved.entry.type === "tool") {
    const source = await readCachedFile(
      resolved.cacheDir,
      join(resolved.entry.path, "tool.ts"),
    )
    if (source) {
      const result = scanToolSource(source)
      scanReport = formatScanReport(result)
    }
  }

  // Request permission
  await Effect.runPromise(
    context.ask({
      permission: "neo.install",
      patterns: [name],
      always: [`neo.install.${name}`],
      metadata: {
        package: name,
        type: resolved.entry.type,
        scope,
        action: "Install Neo package to filesystem",
        ...(scanReport ? { securityScan: scanReport } : {}),
      },
    }),
  )

  const installResult = await installPackage(config, name, scope, worktree)

  // Lock if requested
  if (lock && config.installed[name]) {
    await lockPackage($, config, name)
  }

  // Check dependencies and include advisory
  const sections: string[] = []

  if (scanReport) {
    sections.push("--- Security Scan ---", scanReport, "")
  }

  if (resolved.entry.requires?.length) {
    const depCheck = await checkDependencies(config, resolved.entry.requires)
    const depMsg = formatDependencyCheck(name, depCheck)
    if (depMsg) {
      sections.push("--- Dependencies ---", depMsg, "")
    }
  }

  sections.push(installResult)

  if (lock && config.installed[name]) {
    sections.push(`\nVersion pinned to current registry SHA.`)
  }

  return sections.join("\n")
}

async function installBundle(
  $: Shell,
  config: NeoConfig,
  bundleName: string,
  scope: "global" | "project",
  lock: boolean,
  worktree: string,
  context: any,
): Promise<string> {
  const bundle = await resolveBundle(config, bundleName)
  if (!bundle) {
    return `Bundle "${bundleName}" not found in any configured registry.`
  }

  await Effect.runPromise(
    context.ask({
      permission: "neo.install.bundle",
      patterns: [bundleName],
      always: [`neo.install.bundle.${bundleName}`],
      metadata: {
        bundle: bundleName,
        packages: bundle.entry.packages,
        action: `Install bundle (${bundle.entry.packages.length} packages)`,
      },
    }),
  )

  const results: string[] = [
    `Installing bundle "${bundleName}" (${bundle.entry.packages.length} packages):`,
    "",
  ]

  for (const pkg of bundle.entry.packages) {
    const result = await installPackage(config, pkg, scope, worktree)
    results.push(`  ${pkg}: ${result}`)

    if (lock && config.installed[pkg]) {
      await lockPackage($, config, pkg)
    }
  }

  return results.join("\n")
}
