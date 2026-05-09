/**
 * CLI command implementations.
 *
 * Each function receives parsed args and calls into the existing
 * core modules. Output goes to stdout/stderr.
 */

import { join, resolve } from "node:path"
import { readFile, writeFile } from "node:fs/promises"

import type { NeoConfig, PackageType, Shell } from "../types.js"
import { saveConfig, getConfigManager } from "../config.js"

// ---------------------------------------------------------------------------
// Arg parsing helpers
// ---------------------------------------------------------------------------

function getFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`)
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(`--${flag}`)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

function getPositional(args: string[]): string[] {
  return args.filter((a) => !a.startsWith("--"))
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function setup(args: string[]) {
  // Delegate to the existing setup script
  const { execFile } = await import("node:child_process")
  const { fileURLToPath } = await import("node:url")
  const { dirname } = await import("node:path")
  const scriptDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts")
  const scriptPath = join(scriptDir, "setup.mjs")

  const flags: string[] = []
  if (getFlag(args, "check")) flags.push("--check")
  if (getFlag(args, "uninstall")) flags.push("--uninstall")

  return new Promise<void>((resolve, _reject) => {
    execFile("node", [scriptPath, ...flags], (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)
      if (err) {
        // err.code is a string error code, not an exit code
        const exitCode = (err as any).status ?? 1
        process.exit(typeof exitCode === "number" ? exitCode : 1)
      }
      resolve()
    })
  })
}

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

export async function registries($: Shell, config: NeoConfig, args: string[]) {
  const pos = getPositional(args)
  const action = pos[0]

  const {
    addRegistry,
    removeRegistry,
    listRegistries,
    refreshAllRegistries,
    getLinkedRegistries,
  } = await import("../registry/manager.js")

  switch (action) {
    case "list":
    case "ls":
    case undefined: {
      const regs = listRegistries(config)
      if (regs.length === 0) {
        console.log("No registries configured.")
        console.log("  opencode-neo registries add <name> <url>")
        return
      }
      for (const r of regs) {
        const tags: string[] = []
        if (!r.enabled) tags.push("disabled")
        if (r.type === "local") tags.push("local")
        if (r.auto) tags.push("auto")
        const tagStr = tags.length ? ` (${tags.join(", ")})` : ""
        const detail = r.type === "local" ? r.url : `${r.url} (branch: ${r.branch})`
        console.log(`  ${r.name}${tagStr}`)
        console.log(`    ${detail}`)
      }
      break
    }

    case "add": {
      const name = pos[1]
      const url = pos[2]
      const branch = getFlagValue(args, "branch") ?? "main"
      const isLocal = getFlag(args, "local")
      if (!name || !url) {
        console.error("Usage: opencode-neo registries add <name> <url|path> [--branch <branch>] [--local]")
        process.exit(1)
      }
      const regType = isLocal ? "local" as const : "git" as const
      const result = await addRegistry($, config, name, url, branch, regType)
      console.log(`Registry "${name}" added (${regType}). ${result.packageCount} package(s) available.`)
      if (result.links.length > 0) {
        console.log(`\nLinked registries:`)
        for (const link of result.links) {
          console.log(`  ${link.name} (${link.relationship}): ${link.url}`)
        }
      }
      break
    }

    case "remove":
    case "rm": {
      const name = pos[1]
      if (!name) {
        console.error("Usage: opencode-neo registries remove <name>")
        process.exit(1)
      }
      await removeRegistry(config, name)
      console.log(`Registry "${name}" removed.`)
      break
    }

    case "refresh": {
      await refreshAllRegistries($, config)
      console.log(`Refreshed ${config.registries.filter((r) => r.enabled).length} registry(ies).`)
      break
    }

    case "links": {
      const linked = await getLinkedRegistries(config)
      if (linked.length === 0) {
        console.log("No linked registries found.")
        return
      }
      for (const info of linked) {
        const status = info.alreadyAdded ? "(added)" : "(not added)"
        console.log(`  ${info.link.name} ${status} [${info.link.relationship}]`)
        console.log(`    ${info.link.url}`)
        if (info.link.description) console.log(`    ${info.link.description}`)
        console.log(`    linked by: ${info.sourceRegistry}`)
      }
      break
    }

    default:
      console.error(`Unknown registries action: ${action}`)
      console.error("Actions: list, add, remove, refresh, links")
      process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function search(config: NeoConfig, args: string[]) {
  const { searchPackages } = await import("../registry/resolver.js")
  const pos = getPositional(args)
  const query = pos[0]
  const typeFilter = getFlagValue(args, "type") as PackageType | undefined

  if (!query) {
    console.error("Usage: opencode-neo search <query> [--type skill|tool|command|agent]")
    process.exit(1)
  }

  const results = await searchPackages(config, query, typeFilter)
  if (results.length === 0) {
    console.log(`No packages found matching "${query}".`)
    return
  }

  console.log(`${results.length} result(s):\n`)
  for (const r of results) {
    console.log(`  ${r.name} (${r.type}) v${r.version} [${r.registry}]`)
    console.log(`    ${r.description}`)
    if (r.tags.length) console.log(`    tags: ${r.tags.join(", ")}`)
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function list(config: NeoConfig, args: string[]) {
  const typeFilter = getFlagValue(args, "type") as PackageType | undefined
  const showAvailable = getFlag(args, "available")
  const showUpdates = getFlag(args, "updates")

  if (showAvailable) {
    const { registryCacheDir } = await import("../registry/cache.js")
    const { loadRegistryIndex } = await import("../registry/manager.js")
    const installed = new Set(Object.keys(config.installed))

    for (const reg of config.registries) {
      if (!reg.enabled) continue
      const cacheDir = registryCacheDir(config, reg.name)
      const index = await loadRegistryIndex(cacheDir)
      if (!index) continue
      for (const [name, entry] of Object.entries(index.packages)) {
        if (typeFilter && entry.type !== typeFilter) continue
        const marker = installed.has(name) ? " [installed]" : ""
        console.log(`  ${name} (${entry.type}) v${entry.version} [${reg.name}]${marker}`)
        console.log(`    ${entry.description}`)
      }
    }
    return
  }

  if (showUpdates) {
    const { resolvePackage } = await import("../registry/resolver.js")
    let found = false
    for (const [name, pkg] of Object.entries(config.installed)) {
      if (typeFilter && pkg.type !== typeFilter) continue
      const resolved = await resolvePackage(config, name)
      if (resolved && resolved.entry.version !== pkg.version) {
        console.log(`  ${name}: ${pkg.version} → ${resolved.entry.version} [${resolved.registry}]`)
        found = true
      }
    }
    if (!found) console.log("All installed packages are up to date.")
    return
  }

  // Default: show installed
  const entries = Object.entries(config.installed).filter(
    ([_, p]) => !typeFilter || p.type === typeFilter,
  )
  if (entries.length === 0) {
    console.log("No packages installed.")
    return
  }
  for (const [name, pkg] of entries) {
    console.log(`  ${name} (${pkg.type}) v${pkg.version} [${pkg.registry}] ${pkg.scope}`)
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export async function install($: Shell, config: NeoConfig, args: string[], worktree: string) {
  const { installPackage } = await import("../packages/installer.js")
  const { resolveBundle } = await import("../packages/bundles.js")
  const pos = getPositional(args)
  const name = pos[0]
  const scope = getFlag(args, "project") ? "project" as const : "global" as const
  const lock = getFlag(args, "lock")
  const isBundle = getFlag(args, "bundle")

  if (!name) {
    console.error("Usage: opencode-neo install <name> [--project] [--lock] [--bundle]")
    process.exit(1)
  }

  if (isBundle) {
    const bundle = await resolveBundle(config, name)
    if (!bundle) {
      console.error(`Bundle "${name}" not found.`)
      process.exit(1)
    }
    console.log(`Installing bundle "${name}" (${bundle.entry.packages.length} packages):\n`)
    for (const pkg of bundle.entry.packages) {
      const result = await installPackage(config, pkg, scope, worktree)
      console.log(`  ${pkg}: ${result}`)
      if (lock && config.installed[pkg]) {
        const { lockPackage } = await import("../packages/lockfile.js")
        await lockPackage($, config, pkg)
      }
    }
  } else {
    // Security scan for tools
    const { resolvePackage } = await import("../registry/resolver.js")
    const resolved = await resolvePackage(config, name)
    if (resolved?.entry.type === "tool") {
      const { readCachedFile } = await import("../registry/cache.js")
      const source = await readCachedFile(resolved.cacheDir, join(resolved.entry.path, "tool.ts"))
      if (source) {
        const { scanToolSource, formatScanReport } = await import("../packages/scanner.js")
        const scan = scanToolSource(source)
        if (scan.findings.length > 0) {
          console.log("--- Security Scan ---")
          console.log(formatScanReport(scan))
          console.log()
        }
      }
    }

    const result = await installPackage(config, name, scope, worktree)
    console.log(result)

    if (lock && config.installed[name]) {
      const { lockPackage } = await import("../packages/lockfile.js")
      await lockPackage($, config, name)
      console.log("Version pinned to current registry SHA.")
    }
  }
}

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

export async function remove(config: NeoConfig, args: string[], worktree: string) {
  const { uninstallPackage } = await import("../packages/uninstaller.js")
  const pos = getPositional(args)
  const name = pos[0]

  if (!name) {
    console.error("Usage: opencode-neo remove <name>")
    process.exit(1)
  }

  const result = await uninstallPackage(config, name, worktree)
  console.log(result)
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function update($: Shell, config: NeoConfig, args: string[], worktree: string) {
  const { updatePackage } = await import("../packages/installer.js")
  const { refreshAllRegistries } = await import("../registry/manager.js")
  const { diffPackage } = await import("../packages/diff.js")
  const { lockPackage, isLockedBehind } = await import("../packages/lockfile.js")
  const pos = getPositional(args)
  const name = pos[0]
  const preview = getFlag(args, "preview")
  const force = getFlag(args, "force")
  const lock = getFlag(args, "lock")

  console.log("Refreshing registries...")
  await refreshAllRegistries($, config)

  const names = name ? [name] : Object.keys(config.installed)
  if (names.length === 0) {
    console.log("No packages installed.")
    return
  }

  for (const pkg of names) {
    // Check lock
    const lockStatus = await isLockedBehind($, config, pkg)
    if (lockStatus && !lockStatus.behind) {
      console.log(`  ${pkg}: locked and up to date`)
      continue
    }
    if (lockStatus && lockStatus.behind && !force) {
      console.log(`  ${pkg}: version-locked (use --force to override)`)
      continue
    }

    if (preview) {
      const diff = await diffPackage($, config, pkg)
      console.log(diff)
      continue
    }

    const result = await updatePackage(config, pkg, worktree)
    console.log(`  ${pkg}: ${result}`)

    if (lock && config.installed[pkg]) {
      await lockPackage($, config, pkg)
    }
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function create($: Shell, config: NeoConfig, args: string[]) {
  const { scaffoldRegistry, scaffoldPackage } = await import("../scaffolding.js")
  const pos = getPositional(args)
  const type = pos[0]
  const name = pos[1]
  const path = pos[2]
  const description = getFlagValue(args, "description") ?? ""

  if (!type || !name) {
    console.error("Usage: opencode-neo create <registry|skill|tool|command|agent> <name> [path] [--description <d>]")
    process.exit(1)
  }

  if (type === "registry") {
    const dir = resolve(path ?? `./${name}`)
    const result = await scaffoldRegistry($, dir, name, description || `A Neo registry`, !getFlag(args, "no-git"))
    console.log(result)
  } else if (["skill", "tool", "command", "agent", "mcp"].includes(type)) {
    const registryDir = resolve(path ?? ".")
    const result = await scaffoldPackage(registryDir, type as PackageType, name, description || `A Neo ${type}`)
    console.log(result)
  } else {
    console.error(`Unknown type: ${type}. Use: registry, skill, tool, command, agent, mcp`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

export async function validate(args: string[]) {
  const pos = getPositional(args)
  const path = pos[0]
  if (!path) {
    console.error("Usage: opencode-neo validate <registry-path>")
    process.exit(1)
  }

  // Reuse the validate tool's logic directly
  const { readFile, stat } = await import("node:fs/promises")
  const { validateSkill, validateTool, validateCommand, validateAgent } = await import("../packages/validator.js")
  const dir = resolve(path)

  let index: any
  try {
    index = JSON.parse(await readFile(join(dir, "registry.json"), "utf-8"))
  } catch (err: any) {
    console.error(`FATAL: Cannot read registry.json in ${dir}: ${err.message}`)
    process.exit(1)
  }

  let errors = 0
  const warnings = 0
  const pkgCount = Object.keys(index.packages ?? {}).length

  console.log(`Registry: ${index.name} (${pkgCount} packages)\n`)

  for (const [name, entry] of Object.entries<any>(index.packages ?? {})) {
    const sourceMap: Record<string, string> = { skill: "SKILL.md", tool: "tool.ts", command: "command.md", agent: "agent.md", mcp: "mcp.json" }
    const sourceFile = sourceMap[entry.type] ?? "SKILL.md"
    const sourcePath = join(dir, entry.path, sourceFile)

    try {
      await stat(join(dir, entry.path))
    } catch {
      console.log(`  ERROR  ${name}: directory ${entry.path}/ missing`)
      errors++
      continue
    }

    try {
      const content = await readFile(sourcePath, "utf-8")
      const validators: Record<string, any> = { skill: validateSkill, tool: validateTool, command: validateCommand, agent: validateAgent }
      const result = (validators[entry.type] ?? validateSkill)(content)
      if (!result.valid) {
        console.log(`  ERROR  ${name}: ${result.error}`)
        errors++
      } else {
        console.log(`  OK     ${name} (${entry.type} v${entry.version})`)
      }
    } catch {
      console.log(`  ERROR  ${name}: cannot read ${sourceFile}`)
      errors++
    }
  }

  console.log()
  if (errors > 0) {
    console.log(`${errors} error(s), ${warnings} warning(s). Validation FAILED.`)
    process.exit(1)
  } else {
    console.log("Validation passed.")
  }
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export async function publish(config: NeoConfig, args: string[]) {
  const pos = getPositional(args)
  const source = pos[0]
  const registryDir = pos[1]
  const name = getFlagValue(args, "name")
  const description = getFlagValue(args, "description")

  if (!source || !registryDir) {
    console.error("Usage: opencode-neo publish <source-path> <registry-path> [--name <n>] [--description <d>]")
    process.exit(1)
  }

  // Reuse the scaffolding module for the heavy lifting
  const { stat, readFile: readF, writeFile: writeF, mkdir, cp } = await import("node:fs/promises")
  const { basename } = await import("node:path")

  const absSource = resolve(source)
  const absRegistry = resolve(registryDir)

  // Detect type
  let type: PackageType
  let inferredName: string
  const s = await stat(absSource)
  if (s.isDirectory()) {
    try {
      await stat(join(absSource, "SKILL.md"))
      type = "skill"
    } catch {
      try {
        await stat(join(absSource, "agent.md"))
        type = "agent"
      } catch {
        console.error("Directory must contain SKILL.md (skill) or agent.md (agent)")
        process.exit(1)
        return
      }
    }
    inferredName = basename(absSource)
  } else if (absSource.endsWith(".ts")) {
    type = "tool"
    inferredName = basename(absSource, ".ts")
  } else if (absSource.endsWith(".md")) {
    const content = await readF(absSource, "utf-8")
    type = content.match(/^mode\s*:/m) ? "agent" : "command"
    inferredName = basename(absSource, ".md")
  } else {
    console.error("Source must be a directory (skill/agent), .ts file (tool), or .md file (command/agent)")
    process.exit(1)
    return
  }

  const pkgName = name ?? inferredName
  try {
    const { validateName } = await import("../safepath.js")
    validateName(pkgName, "package")
  } catch (err: any) {
    console.error(err.message)
    process.exit(1)
    return
  }
  const typeDirMap: Record<PackageType, string> = { skill: "skills", tool: "tools", command: "commands", agent: "agents", mcp: "mcps" }
  const destDir = join(absRegistry, typeDirMap[type], pkgName)

  // Read and update registry.json
  let index: any
  try {
    index = JSON.parse(await readF(join(absRegistry, "registry.json"), "utf-8"))
  } catch {
    console.error(`${absRegistry} is not a Neo registry (no valid registry.json)`)
    process.exit(1)
    return
  }

  if (index.packages?.[pkgName]) {
    console.error(`Package "${pkgName}" already exists in this registry.`)
    process.exit(1)
    return
  }

  await mkdir(destDir, { recursive: true })
  if (s.isDirectory()) {
    await cp(absSource, destDir, { recursive: true })
  } else {
    const fileMap: Record<PackageType, string> = { skill: "SKILL.md", tool: "tool.ts", command: "command.md", agent: "agent.md", mcp: "mcp.json" }
    await cp(absSource, join(destDir, fileMap[type]))
  }

  if (!index.packages) index.packages = {}
  index.packages[pkgName] = {
    type,
    description: description ?? `A Neo ${type}`,
    version: "1.0.0",
    path: `${typeDirMap[type]}/${pkgName}`,
    tags: [],
  }
  await writeF(join(absRegistry, "registry.json"), JSON.stringify(index, null, 2) + "\n")

  console.log(`Published "${pkgName}" (${type}) to ${absRegistry}`)
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function configCmd(config: NeoConfig, args: string[], worktree: string) {
  const pos = getPositional(args)
  const action = pos[0] ?? "show"

  switch (action) {
    case "show": {
      const mgr = getConfigManager()
      console.log(`Registries: ${config.registries.length}`)
      for (const r of config.registries) console.log(`  ${r.name}: ${r.url}`)

      const global = Object.entries(config.installed).filter(([_, p]) => p.scope === "global")
      const project = Object.entries(config.installed).filter(([_, p]) => p.scope === "project")
      console.log(`\nInstalled: ${Object.keys(config.installed).length}`)
      if (global.length) console.log(`  Global: ${global.map(([n]) => n).join(", ")}`)
      if (project.length) console.log(`  Project: ${project.map(([n]) => n).join(", ")}`)

      if (config.locks && Object.keys(config.locks).length) {
        console.log(`\nLocked: ${Object.keys(config.locks).join(", ")}`)
      }
      if (config.profiles && Object.keys(config.profiles).length) {
        console.log(`\nProfiles: ${Object.keys(config.profiles).join(", ")}`)
        if (config.activeProfile) console.log(`  Active: ${config.activeProfile}`)
      }
      if (mgr) {
        console.log(`\nGlobal config:  ${mgr.globalConfigPath}`)
        console.log(`Project config: ${mgr.projectConfigPath ?? "(none)"}`)
      }
      break
    }

    case "init": {
      const { mkdir: mkd, writeFile: wf } = await import("node:fs/promises")
      const projectFile = join(worktree, ".opencode", "neo.json")
      const mgr = getConfigManager()
      if (mgr?.hasProjectConfig) {
        console.log(`Project config already exists at ${projectFile}`)
        return
      }
      await mkd(join(worktree, ".opencode"), { recursive: true })
      await wf(projectFile, JSON.stringify({ installed: {}, profiles: {} }, null, 2) + "\n")
      console.log(`Created ${projectFile}`)
      break
    }

    case "paths": {
      const mgr = getConfigManager()
      console.log(`Global:  ${mgr?.globalConfigPath ?? "~/.config/opencode/neo.json"}`)
      console.log(`Project: ${mgr?.projectConfigPath ?? join(worktree, ".opencode", "neo.json")}${mgr?.hasProjectConfig ? " (exists)" : ""}`)
      break
    }

    default:
      console.error("Usage: opencode-neo config [show|init|paths]")
      process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function profile(config: NeoConfig, args: string[]) {
  const pos = getPositional(args)
  const action = pos[0]

  switch (action) {
    case "list":
    case "ls":
    case undefined: {
      const profiles = config.profiles ?? {}
      const names = Object.keys(profiles)
      if (names.length === 0) {
        console.log("No profiles configured.")
        return
      }
      for (const name of names) {
        const active = config.activeProfile === name ? " (active)" : ""
        console.log(`  ${name}${active}: ${profiles[name].packages.join(", ")}`)
      }
      break
    }

    case "create": {
      const name = pos[1]
      const pkgs = pos[2]
      if (!name || !pkgs) {
        console.error("Usage: opencode-neo profile create <name> <pkg1,pkg2,...>")
        process.exit(1)
      }
      const packages = pkgs.split(",").map((p) => p.trim()).filter(Boolean)
      if (!config.profiles) config.profiles = {}
      const desc = getFlagValue(args, "description")
      config.profiles[name] = { packages, description: desc }
      await saveConfig(config)
      console.log(`Profile "${name}" created with ${packages.length} package(s).`)
      break
    }

    case "delete":
    case "rm": {
      const name = pos[1]
      if (!name) { console.error("Usage: opencode-neo profile delete <name>"); process.exit(1) }
      if (!config.profiles?.[name]) { console.error(`Profile "${name}" not found.`); process.exit(1) }
      delete config.profiles[name]
      if (config.activeProfile === name) config.activeProfile = undefined
      await saveConfig(config)
      console.log(`Profile "${name}" deleted.`)
      break
    }

    case "show": {
      const name = pos[1]
      if (!name) { console.error("Usage: opencode-neo profile show <name>"); process.exit(1) }
      const p = config.profiles?.[name]
      if (!p) { console.error(`Profile "${name}" not found.`); process.exit(1) }
      const active = config.activeProfile === name ? " (active)" : ""
      console.log(`${name}${active}`)
      if (p.description) console.log(`  ${p.description}`)
      for (const pkg of p.packages) {
        const inst = config.installed[pkg]
        console.log(`  ${pkg}: ${inst ? `installed (${inst.type} v${inst.version})` : "not installed"}`)
      }
      break
    }

    default:
      console.error("Usage: opencode-neo profile [list|create|delete|show]")
      process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Suggest
// ---------------------------------------------------------------------------

export async function suggest(config: NeoConfig, args: string[]) {
  const { detectProject, suggestPackages } = await import("../packages/detect.js")
  const pos = getPositional(args)
  const dir = resolve(pos[0] ?? ".")

  const ctx = await detectProject(dir)
  console.log("Project context:")
  if (ctx.languages.length) console.log(`  Languages:  ${ctx.languages.join(", ")}`)
  if (ctx.frameworks.length) console.log(`  Frameworks: ${ctx.frameworks.join(", ")}`)
  if (ctx.tools.length) console.log(`  Tools:      ${ctx.tools.join(", ")}`)

  if (!ctx.languages.length && !ctx.frameworks.length && !ctx.tools.length) {
    console.log("  (no project characteristics detected)")
    return
  }

  const suggestions = await suggestPackages(config, ctx)
  if (suggestions.length === 0) {
    console.log("\nNo matching packages in configured registries.")
    return
  }

  console.log(`\n${suggestions.length} suggestion(s):\n`)
  for (const s of suggestions) {
    console.log(`  ${s.name} (${s.type}) v${s.version} [${s.registry}]`)
    console.log(`    ${s.description}`)
  }
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export async function exportSetup(config: NeoConfig, args: string[]) {
  const pos = getPositional(args)
  const filePath = resolve(pos[0] ?? "neo-setup.json")

  const setup = {
    registries: config.registries.map((r) => ({
      name: r.name,
      url: r.url,
      ...(r.branch !== "main" ? { branch: r.branch } : {}),
    })),
    packages: Object.keys(config.installed),
    ...(config.profiles && Object.keys(config.profiles).length ? { profiles: config.profiles } : {}),
  }

  await writeFile(filePath, JSON.stringify(setup, null, 2) + "\n")
  console.log(`Exported to ${filePath}`)
  console.log(`  ${setup.registries.length} registry(ies), ${setup.packages.length} package(s)`)
}

export async function importSetup($: Shell, config: NeoConfig, args: string[], worktree: string) {
  const { addRegistry, normalizeUrl } = await import("../registry/manager.js")
  const { installPackage } = await import("../packages/installer.js")
  const pos = getPositional(args)
  if (!pos[0]) {
    console.error("Usage: opencode-neo import <setup-file>")
    process.exit(1)
  }
  const filePath = resolve(pos[0])

  let setup: any
  try {
    setup = JSON.parse(await readFile(filePath, "utf-8"))
  } catch (err: any) {
    console.error(`Cannot read ${filePath}: ${err.message}`)
    process.exit(1)
  }

  const existingUrls = new Set(config.registries.map((r) => normalizeUrl(r.url)))

  for (const reg of setup.registries ?? []) {
    if (existingUrls.has(normalizeUrl(reg.url))) {
      console.log(`  registry "${reg.name}": already configured`)
      continue
    }
    try {
      await addRegistry($, config, reg.name, reg.url, reg.branch ?? "main")
      console.log(`  registry "${reg.name}": added`)
    } catch (err: any) {
      console.log(`  registry "${reg.name}": FAILED -- ${err.message}`)
    }
  }

  for (const pkg of setup.packages ?? []) {
    if (config.installed[pkg]) {
      console.log(`  package "${pkg}": already installed`)
      continue
    }
    const result = await installPackage(config, pkg, "global", worktree)
    console.log(`  package "${pkg}": ${result}`)
  }

  if (setup.profiles) {
    if (!config.profiles) config.profiles = {}
    for (const [name, p] of Object.entries<any>(setup.profiles)) {
      config.profiles[name] = p
      console.log(`  profile "${name}": imported`)
    }
    await saveConfig(config)
  }

  console.log("\nDone.")
}
