import { join } from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { tool } from "@opencode-ai/plugin"

import type { NeoConfig, Shell } from "../types.js"
import { addRegistry } from "../registry/manager.js"
import { installPackage } from "../packages/installer.js"
import { resolvePackage } from "../registry/resolver.js"
import { readCachedFile } from "../registry/cache.js"
import { scanToolSource } from "../packages/scanner.js"

/** Portable setup file format */
interface SetupFile {
  registries: Array<{ name: string; url: string; branch?: string }>
  packages: string[]
  profiles?: Record<string, { description?: string; packages: string[] }>
}

export function buildSetupTool(config: NeoConfig, $: Shell, worktree: string) {
  return tool({
    description:
      "Export or import a Neo setup. 'export' creates a portable JSON file " +
      "with your registries and installed packages that teammates can import. " +
      "'import' reads a setup file and adds missing registries and packages.",
    args: {
      action: tool.schema
        .enum(["export", "import"])
        .describe("Export your setup to a file, or import from a file"),
      path: tool.schema
        .string()
        .optional()
        .default("neo-setup.json")
        .describe("Path to the setup file (defaults to neo-setup.json)"),
    },
    async execute(args, context) {
      const path = args.path ?? "neo-setup.json"
      const filePath = path.startsWith("/")
        ? path
        : join(context.directory, path)

      if (args.action === "export") {
        return handleExport(config, filePath)
      }
      return handleImport($, config, filePath, worktree, context)
    },
  })
}

async function handleExport(config: NeoConfig, filePath: string): Promise<string> {
  const setup: SetupFile = {
    registries: config.registries.map((r) => ({
      name: r.name,
      url: r.url,
      ...(r.branch !== "main" ? { branch: r.branch } : {}),
    })),
    packages: Object.keys(config.installed),
  }

  if (config.profiles && Object.keys(config.profiles).length > 0) {
    setup.profiles = config.profiles
  }

  await writeFile(filePath, JSON.stringify(setup, null, 2) + "\n", "utf-8")

  return [
    `Neo setup exported to ${filePath}.`,
    `  ${setup.registries.length} registry(ies)`,
    `  ${setup.packages.length} package(s)`,
    setup.profiles ? `  ${Object.keys(setup.profiles).length} profile(s)` : "",
    "",
    "Share this file with teammates. They can import it with:",
    `  neo_setup({ action: "import", path: "${filePath}" })`,
  ].filter(Boolean).join("\n")
}

async function handleImport(
  $: Shell,
  config: NeoConfig,
  filePath: string,
  worktree: string,
  _context: any,
): Promise<string> {
  let setup: SetupFile
  try {
    setup = JSON.parse(await readFile(filePath, "utf-8"))
  } catch (err: any) {
    return `Cannot read setup file at ${filePath}: ${err.message}`
  }

  if (!setup.registries && !setup.packages) {
    return "Setup file is empty or malformed (needs 'registries' and/or 'packages')."
  }

  const results: string[] = []

  // Add missing registries
  const existingUrls = new Set(
    config.registries.map((r) => r.url.toLowerCase().replace(/\.git$/, "").replace(/\/+$/, "")),
  )

  for (const reg of setup.registries ?? []) {
    const normalized = reg.url.toLowerCase().replace(/\.git$/, "").replace(/\/+$/, "")
    if (existingUrls.has(normalized)) {
      results.push(`Registry "${reg.name}": already configured`)
      continue
    }
    try {
      await addRegistry($, config, reg.name, reg.url, reg.branch ?? "main")
      results.push(`Registry "${reg.name}": added`)
    } catch (err: any) {
      results.push(`Registry "${reg.name}": FAILED -- ${err.message}`)
    }
  }

  // Install missing packages (with security scan for tools)
  for (const pkg of setup.packages ?? []) {
    if (config.installed[pkg]) {
      results.push(`Package "${pkg}": already installed`)
      continue
    }

    // Security scan tool packages before installing
    const resolved = await resolvePackage(config, pkg)
    if (resolved?.entry.type === "tool") {
      const source = await readCachedFile(resolved.cacheDir, join(resolved.entry.path, "tool.ts"))
      if (source) {
        const scan = scanToolSource(source)
        if (scan.riskLevel === "high") {
          results.push(`Package "${pkg}": SKIPPED -- security scan found HIGH risk. Install manually with neo_install to review.`)
          continue
        }
        if (scan.findings.length > 0) {
          results.push(`Package "${pkg}": WARNING -- ${scan.summary}`)
        }
      }
    }

    const result = await installPackage(config, pkg, "global", worktree)
    results.push(`Package "${pkg}": ${result}`)
  }

  // Import profiles
  if (setup.profiles) {
    if (!config.profiles) config.profiles = {}
    for (const [name, profile] of Object.entries(setup.profiles)) {
      config.profiles[name] = profile
      results.push(`Profile "${name}": imported`)
    }
    const { saveConfig } = await import("../config.js")
    await saveConfig(config)
  }

  return [
    `Setup imported from ${filePath}:`,
    "",
    ...results,
  ].join("\n")
}
