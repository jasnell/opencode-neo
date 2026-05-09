# opencode-neo

*"I know kung-fu."*

A dynamic package manager for [OpenCode](https://opencode.ai) skills, tools, commands, and agents. Neo lets you discover, load, install, and share packages from git-based registries -- like npm/npx for your AI coding agent.

## What it does

| Concept | npm equivalent | Neo |
|---------|---------------|-----|
| Install a package | `npm install` | `neo_install({ name: "react-patterns" })` |
| Run without installing | `npx` | `neo_load({ name: "k8s-debugging" })` |
| Search packages | `npm search` | `neo_search({ query: "terraform" })` |
| Create a package | `npm init` | `neo_create({ type: "registry", name: "my-team" })` |
| Share your setup | `package.json` | `neo_setup({ action: "export" })` |

Neo supports four package types:

- **Skills** -- Instructions loaded into the agent's context (dynamically loadable)
- **Tools** -- TypeScript functions the agent can call (security-scanned before install/execute)
- **Commands** -- Prompt templates accessible via `/neo <name>` (dynamically loadable)
- **Agents** -- Custom agent definitions with system prompts and permissions

Neo injects a system prompt section into the agent's context so it knows about the `neo_*` tools and will use them for package-related requests. It also auto-discovers project-local registries at `.opencode/neo/registry.json` -- any project can ship its own packages without requiring configuration.

## Install

```sh
npm install opencode-neo
npm run setup -w opencode-neo
```

The setup script adds `"opencode-neo"` to your `opencode.json` plugin list and copies the `/neo` bootstrap command to `~/.config/opencode/commands/`. Restart OpenCode to activate.

```sh
npm run setup:check -w opencode-neo   # verify installation
npm run setup:uninstall -w opencode-neo   # remove
```

Or install manually -- add to your `opencode.json`:

```json
{
  "plugin": ["opencode-neo"]
}
```

And copy the command:

```sh
cp node_modules/opencode-neo/commands/neo.md ~/.config/opencode/commands/neo.md
```

## Update

```sh
npm update opencode-neo
npm run setup -w opencode-neo
```

The setup script detects version changes and updates the `/neo` command file. The plugin code is picked up automatically by OpenCode on restart.

Check if an update is needed:

```sh
npm run setup:check -w opencode-neo
```

If your installed command is behind the package version, it will report:

```
Installed (update available: 0.1.0 → 0.2.0)
  Run 'npm run setup' to update.
```

## Quick start

On first use, Neo will walk you through setup. Or do it manually:

### 1. Add a registry

```
neo_registries({ action: "add", url: "https://github.com/your-org/opencode-packages", name: "my-team" })
```

A registry is a git repository containing a `registry.json` index and package directories. See [Registry Format](docs/registry-format.md) for the full spec.

### 2. Search for packages

```
neo_search({ query: "react" })
```

Or let Neo suggest packages based on your project:

```
neo_suggest()
```

### 3. Use packages

**Load a skill into the current session** (no install needed):

```
neo_load({ name: "react-patterns" })
```

**Run a command** via the `/neo` shortcut:

```
/neo deploy staging
```

**Execute a tool dynamically** (security-scanned, permission-gated):

```
neo_exec({ name: "db-query", arguments: '{"query": "SELECT * FROM users LIMIT 5"}' })
```

**Install persistently**:

```
neo_install({ name: "react-patterns" })
neo_install({ name: "kubernetes-toolkit", bundle: true })
```

### 4. Create a registry

```
neo_create({ type: "registry", name: "my-team", path: "./my-team-registry", description: "Our team's packages" })
```

Then add packages to it:

```
neo_create({ type: "skill", name: "code-style", path: "./my-team-registry", description: "Our coding conventions" })
neo_create({ type: "agent", name: "reviewer", path: "./my-team-registry", description: "Code review agent" })
```

## Tutorial

See **[TUTORIAL.md](TUTORIAL.md)** for a full walkthrough of using Neo inside an OpenCode session, with example prompts covering setup, discovery, dynamic loading, installation, profiles, authoring, team sync, and updates.

## Tools reference

Neo registers 15 tools with OpenCode (plus the `/neo` bootstrap command):

### Discovery

| Tool | Description |
|------|-------------|
| `neo_search` | Search registries by keyword, name, or tag. Filter by type. |
| `neo_suggest` | Analyze the current project and suggest relevant packages based on detected languages, frameworks, and tools. |

### Dynamic loading

| Tool | Description |
|------|-------------|
| `neo_load` | Load a skill or command into the current session without installing. Skills inject instructions into conversation context. Commands return templates to follow. |
| `neo_exec` | Execute a tool from a registry without installing. The source is security-scanned and the user is prompted for permission before execution. |
| `/neo <command> [args]` | Bootstrap command. Run any registry command dynamically, like `npx`. |

### Package management

| Tool | Description |
|------|-------------|
| `neo_install` | Install a package or bundle persistently. Supports `scope: "global"` or `"project"`, `bundle: true` for bundles, `lock: true` to pin versions. Tools are security-scanned before install. |
| `neo_remove` | Uninstall a package and remove its files. |
| `neo_update` | Update installed packages. Supports `preview: true` to diff before applying, `force: true` to override version locks. |
| `neo_list` | List installed, available, or updatable packages. Filter by type. |

### Registry management

| Tool | Description |
|------|-------------|
| `neo_registries` | Add, remove, list, refresh registries, or discover linked registries via federation. |

### Authoring

| Tool | Description |
|------|-------------|
| `neo_create` | Scaffold a new registry or add a package (skill/tool/command/agent) to an existing one. |
| `neo_publish` | Import a local skill, tool, command, or agent into a registry directory. The reverse of `neo_install`. |
| `neo_validate` | Validate a registry directory: checks `registry.json`, verifies all packages exist and pass validation, reports orphaned files. |

### Configuration

| Tool | Description |
|------|-------------|
| `neo_setup` | Export or import a Neo setup file for team onboarding. Includes registries, packages, and profiles. |
| `neo_profile` | Manage named profiles -- sets of packages that activate together. Create, delete, activate, or list profiles. |
| `neo_config` | View the merged config, initialize project-level config, or show config file paths. |

## Configuration

Neo uses a layered config system:

- **Global**: `~/.config/opencode/neo.json` -- registries, cache settings, globally installed packages
- **Project**: `.opencode/neo.json` -- project-scoped packages, profiles, and locks

Project config layers on top of global. See [Configuration](docs/configuration.md) for details.

### Version locking

Pin packages to specific registry commits:

```
neo_install({ name: "critical-tool", lock: true })
```

Locked packages are skipped during `neo_update` unless `force: true` is set.

### Profiles

Group packages into named sets:

```
neo_profile({ action: "create", name: "frontend", packages: "react-patterns,css-debug,component-gen" })
neo_profile({ action: "activate", name: "frontend" })
```

### Team sync

Export your setup for teammates:

```
neo_setup({ action: "export", path: "neo-setup.json" })
```

They import it:

```
neo_setup({ action: "import", path: "neo-setup.json" })
```

## Security

Tools involve executing code. Neo handles this with:

1. **Static security scanning** -- Pattern-based analysis before install or execute. Detects eval, child_process, filesystem access, network calls, env access, obfuscation, and more. Findings are surfaced to the agent and user.

2. **Permission gates** -- `neo_exec`, `neo_install`, `neo_remove`, and `neo_update` all use OpenCode's built-in permission system (`context.ask()`). The user approves before anything runs.

3. **Path validation** -- All package names and registry names are validated against a safe pattern. Path traversal attacks from malicious registries are blocked.

4. **TOCTOU protection** -- Tool source is read once and passed through the scan-then-execute pipeline. The scanned code is the executed code.

See [Security](docs/security.md) for the full threat model.

## Registry format

A registry is a git repo with this structure:

```
registry.json
skills/<name>/SKILL.md
tools/<name>/tool.ts
commands/<name>/command.md
agents/<name>/agent.md
```

Registries support federation (linking to related registries), bundles (named package groups), and cross-package dependencies.

See [Registry Format](docs/registry-format.md) for the complete specification.

## Sample registry

The `samples/registry/` directory contains a complete example registry with one of each package type, a bundle, and a federation link. Use it as a template:

```sh
cp -r samples/registry ./my-registry
```

## CLI

Neo includes a command-line tool for operations outside of OpenCode sessions -- managing registries, validating packages, scaffolding, and more. After installation, the `opencode-neo` command is available:

```sh
opencode-neo --help
```

### Quick reference

```sh
# Setup
opencode-neo setup                              # Install plugin + /neo command
opencode-neo setup --check                      # Verify installation
opencode-neo setup --uninstall                  # Remove

# Registries
opencode-neo registries list                    # List configured registries
opencode-neo registries add acme https://github.com/acme/packages
opencode-neo registries add local-reg ./path --local
opencode-neo registries remove acme
opencode-neo registries refresh                 # Fetch latest from git registries
opencode-neo registries links                   # Discover federated registries

# Packages
opencode-neo search terraform                   # Search by keyword
opencode-neo search react --type skill          # Filter by type
opencode-neo list                               # Installed packages
opencode-neo list --available                   # All available across registries
opencode-neo list --updates                     # Packages with newer versions
opencode-neo install k8s-debugging              # Install a package
opencode-neo install k8s-toolkit --bundle       # Install a bundle
opencode-neo install critical-tool --lock       # Install and pin version
opencode-neo install team-skill --project       # Install to project scope
opencode-neo remove k8s-debugging               # Uninstall
opencode-neo update                             # Update all packages
opencode-neo update k8s-lint --preview          # Preview changes before updating
opencode-neo update k8s-lint --force --lock     # Force update locked, re-lock

# Authoring
opencode-neo create registry my-team ./my-team-registry [--no-git]
opencode-neo create skill code-style ./my-team-registry --description "Coding conventions"
opencode-neo create agent reviewer ./my-team-registry --description "Code reviewer"
opencode-neo validate ./my-team-registry        # Validate a registry
opencode-neo publish ./skills/my-skill ./my-team-registry

# Configuration
opencode-neo config show                        # View merged config
opencode-neo config init                        # Create .opencode/neo.json
opencode-neo config paths                       # Show config file locations
opencode-neo suggest                            # Suggest packages for current project
opencode-neo suggest /path/to/project           # Suggest for a specific project

# Profiles
opencode-neo profile list
opencode-neo profile create frontend react-patterns,css-debug,component-gen [--description <d>]
opencode-neo profile delete frontend
opencode-neo profile show frontend

# Team sync
opencode-neo export                             # Export to neo-setup.json
opencode-neo export my-team-setup.json          # Export to custom path
opencode-neo import neo-setup.json              # Import registries + packages
```

See [CLI Reference](docs/cli.md) for full documentation.

## Development

```sh
npm install
npm test              # Run tests (vitest)
npm run test:watch    # Run tests in watch mode
npm run lint          # Run ESLint
npm run lint:fix      # Auto-fix lint issues
npx tsc --noEmit      # Type check
npm run setup         # Install into your local OpenCode
npm run setup:check   # Verify installation
npm run setup:uninstall  # Remove from OpenCode
```

### Local development workflow

No build step is needed -- `package.json` points `main` at `src/index.ts` and OpenCode's Bun runtime loads TypeScript directly.

To test the plugin locally:

1. Create a loader in OpenCode's plugins directory:

```sh
mkdir -p ~/.config/opencode/plugins
echo 'export { Neo } from "/path/to/opencode-neo/src/index.js"' > ~/.config/opencode/plugins/neo.ts
```

2. Copy the `/neo` command:

```sh
cp commands/neo.md ~/.config/opencode/commands/neo.md
```

3. Restart OpenCode. Edit source, restart to pick up changes.

## License

MIT
