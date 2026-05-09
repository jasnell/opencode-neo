# CLI Reference

Neo includes a command-line tool (`opencode-neo`) for managing registries, packages, and configuration outside of OpenCode sessions. It uses the same core modules as the plugin, so behavior is identical.

## Installation

The CLI is available after installing the npm package:

```sh
npm install opencode-neo
npx opencode-neo --help
```

Or if installed globally:

```sh
npm install -g opencode-neo
opencode-neo --help
```

Requires Node.js 22 or later.

## Commands

### `setup`

Install, check, or remove the Neo plugin from your OpenCode configuration.

```sh
opencode-neo setup                # Install plugin + /neo command
opencode-neo setup --check        # Check installation status
opencode-neo setup --uninstall    # Remove plugin + /neo command
```

**Install** adds `"opencode-neo"` to the `plugin` array in your `opencode.json` (or `opencode.jsonc`) and copies the `/neo` bootstrap command to `~/.config/opencode/commands/neo.md`. Safe to run multiple times (idempotent).

**Check** reports the installation status, including version. If the installed `/neo` command is older than the package version, it reports the mismatch:

```
Installed (update available: 0.1.0 → 0.2.0)
  Run 'npm run setup' to update.
```

**Uninstall** removes the `/neo` command file and the plugin entry from the config. Does not remove `neo.json` or cached registries.

### `registries`

Manage package registries.

```sh
opencode-neo registries list
opencode-neo registries add <name> <url> [--branch <branch>]
opencode-neo registries add <name> <path> --local
opencode-neo registries remove <name>
opencode-neo registries refresh
opencode-neo registries links
```

**`list`** -- Show all configured registries with their type (git/local), status (enabled/disabled), and whether they were auto-discovered.

**`add`** -- Add a git registry by URL, or a local directory registry with `--local`. The registry must contain a `registry.json` file. For git registries, Neo performs a shallow clone. For local registries, Neo verifies the directory exists and reads from it directly.

```sh
# Git registry
opencode-neo registries add community https://github.com/org/packages

# Local directory
opencode-neo registries add team-local /opt/shared/neo-packages --local

# Custom branch
opencode-neo registries add staging https://github.com/org/packages --branch develop
```

After adding, Neo reports the package count and any federated links.

**`remove`** -- Remove a registry from the config. For git registries, also cleans the cached clone. For local registries, only removes the config entry (never deletes the directory). Auto-discovered project registries cannot be removed.

**`refresh`** -- Fetch the latest content from all git registries. Local registries are skipped (they always read live from disk).

**`links`** -- Show registries linked via federation from your configured registries. Reports which are already added and which are not, with ready-to-use `add` commands for the missing ones.

### `search`

Search for packages across all configured registries.

```sh
opencode-neo search <query> [--type <skill|tool|command|agent>]
```

Searches package names, descriptions, and tags. Results are ranked by relevance (exact name match > name contains > description contains > tag match).

```sh
opencode-neo search kubernetes
opencode-neo search react --type skill
opencode-neo search deploy --type command
```

### `list`

List packages.

```sh
opencode-neo list                   # Installed packages
opencode-neo list --available       # All available across registries
opencode-neo list --updates         # Installed packages with newer versions
opencode-neo list --type skill      # Filter by type
```

**Default (no flags)** -- shows installed packages with type, version, registry, and scope.

**`--available`** -- enumerates all packages across all registries. Installed packages are marked.

**`--updates`** -- shows installed packages where the registry has a newer version. Run `registries refresh` first to ensure the cache is current.

### `install`

Install a package or bundle.

```sh
opencode-neo install <name> [--project] [--lock] [--bundle]
```

| Flag | Effect |
|------|--------|
| `--project` | Install to `.opencode/` (project scope) instead of `~/.config/opencode/` (global) |
| `--lock` | Pin the installed version to the current registry git SHA |
| `--bundle` | Treat the name as a bundle and install all packages in it |

For tool packages, a security scan runs before installation. Findings are printed to stdout. The install proceeds after the scan -- in the CLI there is no interactive permission prompt (unlike the plugin, where `context.ask()` is used). Review the scan output.

```sh
opencode-neo install react-patterns
opencode-neo install k8s-toolkit --bundle
opencode-neo install company-linter --project --lock
```

### `remove`

Uninstall a package.

```sh
opencode-neo remove <name>
```

Removes the installed files and updates the config. For tools and commands, restart OpenCode for the change to take effect.

### `update`

Update installed packages.

```sh
opencode-neo update [name] [--preview] [--force] [--lock]
```

| Flag | Effect |
|------|--------|
| `--preview` | Show what changed (git log or file diff) without applying |
| `--force` | Update even if the package is version-locked |
| `--lock` | Re-lock updated packages to the new SHA |

Refreshes all git registries before checking for updates.

```sh
opencode-neo update                     # Update all
opencode-neo update k8s-lint            # Update one
opencode-neo update k8s-lint --preview  # See changes first
opencode-neo update --force --lock      # Force-update all, re-lock
```

### `create`

Scaffold a new registry or add a package to an existing one.

```sh
opencode-neo create registry <name> [path] [--description <d>] [--no-git]
opencode-neo create <type> <name> [path] [--description <d>]
```

**Registry scaffolding** creates the full directory structure (`registry.json`, type directories, README, `.gitignore`) and optionally runs `git init`. If no path is given, creates `./<name>`.

```sh
opencode-neo create registry my-team ./my-team-packages --description "Platform team packages"
```

**Package scaffolding** adds a new package to an existing registry. Creates the package directory with a template file and updates `registry.json`.

```sh
opencode-neo create skill code-style ./my-team-packages --description "Coding conventions"
opencode-neo create tool db-query ./my-team-packages --description "Query databases"
opencode-neo create command deploy ./my-team-packages --description "Deploy to production"
opencode-neo create agent reviewer ./my-team-packages --description "Code review agent"
```

The `path` argument is the registry root directory (containing `registry.json`). Defaults to the current directory.

### `validate`

Validate a registry directory.

```sh
opencode-neo validate <path>
```

Checks:
- `registry.json` exists and parses correctly
- All declared packages exist on disk with the correct source file
- Source files pass type-specific validation (frontmatter, exports, etc.)
- Required fields (description, version) are present
- Bundle references point to declared packages
- Link entries have required fields
- Reports orphaned directories not listed in the index

Exit code 0 on success, 1 if any errors are found.

```sh
opencode-neo validate ./my-team-packages
```

```
Registry: my-team (6 packages)

  OK     code-style (skill v1.0.0)
  OK     db-query (tool v2.1.0)
  OK     deploy (command v1.0.0)
  ERROR  broken-pkg: missing SKILL.md in skills/broken-pkg/
  OK     reviewer (agent v1.0.0)
  OK     lint-fix (tool v1.0.0)

1 error(s), 0 warning(s). Validation FAILED.
```

Use this in CI to catch structural issues before pushing to a shared registry.

### `publish`

Import a local skill, tool, command, or agent into a registry.

```sh
opencode-neo publish <source> <registry> [--name <n>] [--description <d>]
```

The source can be:
- A directory containing `SKILL.md` (detected as skill)
- A directory containing `agent.md` (detected as agent)
- A `.ts` file (detected as tool)
- A `.md` file with `mode:` in frontmatter (detected as agent)
- A `.md` file without `mode:` (detected as command)

```sh
# Publish a local skill directory
opencode-neo publish ~/.config/opencode/skills/my-conventions ./my-registry

# Publish a local tool file
opencode-neo publish ~/.config/opencode/tools/db-query.ts ./my-registry

# Publish with a custom name
opencode-neo publish ./review.md ./my-registry --name code-reviewer --description "Code review agent"
```

The package name defaults to the source filename/directory name. Use `--name` to override.

### `config`

View and manage Neo configuration.

```sh
opencode-neo config show    # Show merged config summary
opencode-neo config init    # Create .opencode/neo.json for the current project
opencode-neo config paths   # Show global and project config file locations
```

**`show`** displays registries, installed packages (by scope), locks, profiles, active profile, cache settings, and config file locations.

**`init`** creates `.opencode/neo.json` in the current project. After this, packages installed with `--project` are tracked in the project config. Commit this file so your team shares the same project-specific packages.

**`paths`** shows which config files are active and whether a project config exists.

### `suggest`

Analyze a project and suggest relevant packages.

```sh
opencode-neo suggest [path]
```

Detects languages, frameworks, and tools from project config files (`package.json`, `go.mod`, `Cargo.toml`, `Dockerfile`, etc.) and matches them against package tags in configured registries.

```sh
opencode-neo suggest              # Current directory
opencode-neo suggest ../my-project
```

### `profile`

Manage named package profiles.

```sh
opencode-neo profile list
opencode-neo profile create <name> <pkg1,pkg2,...> [--description <d>]
opencode-neo profile delete <name>
opencode-neo profile show <name>
```

Profiles group packages into named sets. They are stored in the config and can be activated inside OpenCode sessions via the `neo_profile` tool.

```sh
opencode-neo profile create frontend react-patterns,css-debug,component-gen --description "Frontend dev"
opencode-neo profile show frontend
opencode-neo profile delete frontend
```

### `export`

Export the current Neo setup to a portable JSON file.

```sh
opencode-neo export [path]
```

Defaults to `neo-setup.json`. The file contains registries, installed package names, and profiles. Share it with teammates for identical setup.

### `import`

Import a Neo setup from a file.

```sh
opencode-neo import <path>
```

Adds missing registries, installs missing packages (with security scanning for tools -- HIGH risk tools are skipped), and imports profiles.

## Global options

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help text |
| `--version`, `-v` | Print the package version |

## Plugin tools vs CLI

The CLI and the OpenCode plugin tools share the same core modules. The main differences:

| Aspect | Plugin tools (inside OpenCode) | CLI (`opencode-neo`) |
|--------|-------------------------------|---------------------|
| Permission prompts | Uses `context.ask()` -- interactive approve/deny | No interactive prompts -- review scan output |
| Dynamic loading | `neo_load` injects into conversation context | Not available (no conversation context) |
| Dynamic execution | `neo_exec` runs tools in-process | Not available |
| `/neo` command | Runs commands via the agent | Not available |
| Config auto-discovery | Worktree from OpenCode session | Worktree from `cwd` |
| Shell | BunShell from plugin runtime | Node.js `child_process` shim |

Use the CLI for registry management, authoring, validation, team sync, and setup. Use the plugin tools for dynamic loading, execution, and anything involving the agent conversation.
