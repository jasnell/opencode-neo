#!/usr/bin/env node

/**
 * opencode-neo CLI
 *
 * A command-line interface for Neo operations that don't require
 * the OpenCode runtime. Covers registry management, package management,
 * authoring, configuration, and setup.
 *
 * Usage: opencode-neo <command> [options]
 */

import { loadConfig } from "../config.js"
import { createNodeShell } from "./shell-shim.js"
import * as commands from "./commands.js"

const HELP = `
opencode-neo - package manager for OpenCode skills, tools, commands, and agents

Usage: opencode-neo <command> [options]

Setup:
  setup                         Install Neo into OpenCode
  setup --check                 Check installation status
  setup --uninstall             Remove Neo from OpenCode

Registries:
  registries list               List configured registries
  registries add <name> <url> [--branch <b>]
                                Add a git registry
  registries add <name> <path> --local
                                Add a local directory registry
  registries remove <name>      Remove a registry
  registries refresh            Refresh all git registry caches
  registries links              Show linked registries (federation)

Packages:
  search <query> [--type <t>]   Search for packages
  list [--available] [--updates] [--type <t>]
                                List packages
  install <name> [--project] [--lock] [--bundle]
                                Install a package
  remove <name>                 Remove a package
  update [name] [--preview] [--force] [--lock]
                                Update packages

Authoring:
  create registry <name> [path] [--description <d>] [--no-git]
                                Scaffold a new registry
  create <type> <name> [path] [--description <d>]
                                Add a package to a registry
      type: skill | tool | command | agent | mcp
  validate <path>               Validate a registry
  publish <source> <registry> [--name <n>] [--description <d>]
                                Import a local package into a registry

Configuration:
  config show                   Show merged config
  config init                   Initialize project config
  config paths                  Show config file locations
  profile list                  List profiles
  profile create <name> <pkgs> [--description <d>]
                                Create a profile (comma-separated packages)
  profile delete <name>         Delete a profile
  profile show <name>           Show profile details
  suggest [path]                Suggest packages for a project

Aliases:
  registry = registries         ls = list
  add = install                 rm = remove
  upgrade = update              init = create

Export / Import:
  export [path]                 Export setup to a file (default: neo-setup.json)
  import <path>                 Import setup from a file

Options:
  --help, -h                    Show this help
  --version, -v                 Show version
`.trim()

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP)
    process.exit(0)
  }

  if (args.includes("--version") || args.includes("-v")) {
    const pkg = await import("../../package.json", { with: { type: "json" } }).catch(async () => {
      const { readFile } = await import("node:fs/promises")
      const { join, dirname } = await import("node:path")
      const { fileURLToPath } = await import("node:url")
      const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
      return { default: JSON.parse(await readFile(join(root, "package.json"), "utf-8")) }
    })
    console.log(pkg.default.version)
    process.exit(0)
  }

  const $ = createNodeShell()
  const worktree = process.cwd()
  const config = await loadConfig(worktree)

  const command = args[0]
  const rest = args.slice(1)

  try {
    switch (command) {
      // Setup
      case "setup":
        await commands.setup(rest)
        break

      // Registries
      case "registries":
      case "registry":
        await commands.registries($, config, rest)
        break

      // Search / list
      case "search":
        await commands.search(config, rest)
        break
      case "list":
      case "ls":
        await commands.list(config, rest)
        break

      // Package management
      case "install":
      case "add":
        await commands.install($, config, rest, worktree)
        break
      case "remove":
      case "rm":
        await commands.remove(config, rest, worktree)
        break
      case "update":
      case "upgrade":
        await commands.update($, config, rest, worktree)
        break

      // Authoring
      case "create":
      case "init":
        await commands.create($, config, rest)
        break
      case "validate":
        await commands.validate(rest)
        break
      case "publish":
        await commands.publish(config, rest)
        break

      // Configuration
      case "config":
        await commands.configCmd(config, rest, worktree)
        break
      case "profile":
        await commands.profile(config, rest)
        break
      case "suggest":
        await commands.suggest(config, rest)
        break

      // Export / Import
      case "export":
        await commands.exportSetup(config, rest)
        break
      case "import":
        await commands.importSetup($, config, rest, worktree)
        break

      default:
        console.error(`Unknown command: ${command}\n`)
        console.log(`Run 'opencode-neo --help' for usage.`)
        process.exit(1)
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}

main()
