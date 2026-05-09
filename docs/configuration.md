# Configuration

Neo uses a layered configuration system with global and project-level config files.

## Config files

| Scope | Path | Created by |
|-------|------|------------|
| Global | `~/.config/opencode/neo.json` | Automatically on first use |
| Project | `.opencode/neo.json` | `neo_config({ action: "init" })` or `opencode-neo config init` |

The global config always exists. The project config is optional and created on demand.

## Precedence

The project config layers on top of the global config:

| Setting | Source | Merge behavior |
|---------|--------|---------------|
| Registries | Global only | Registries are shared across all projects |
| Cache settings | Global only | Cache directory and TTL are shared |
| Installed packages | Both | Merged by name. Project-scoped packages stored in project config. |
| Locks | Both | Follow the installed package's scope |
| Profiles | Both | Project profiles override global profiles with the same name |
| Active profile | Both | Project takes precedence |

### How it works

When Neo starts, `ConfigManager.load(worktree)` reads both files and merges them into a single `NeoConfig` object. All tools see this merged view.

When `saveConfig()` is called, the manager splits changes back to the correct files:

- Global-scoped installed packages, their locks, and registries go to `~/.config/opencode/neo.json`
- Project-scoped installed packages, their locks, profiles, and active profile go to `.opencode/neo.json`

## Global config format

```json
{
  "registries": [
    {
      "name": "community",
      "url": "https://github.com/org/opencode-packages",
      "branch": "main",
      "enabled": true
    },
    {
      "name": "team-local",
      "url": "/opt/shared/neo-packages",
      "branch": "main",
      "enabled": true,
      "type": "local"
    }
  ],
  "cache": {
    "ttl": 3600,
    "dir": "~/.cache/opencode/neo"
  },
  "installed": {
    "react-patterns": {
      "registry": "community",
      "type": "skill",
      "version": "1.0.0",
      "scope": "global",
      "installedAt": "2026-05-09T12:00:00.000Z"
    }
  },
  "locks": {
    "react-patterns": {
      "registry": "community",
      "version": "1.0.0",
      "sha": "abc123def456",
      "lockedAt": "2026-05-09T12:00:00.000Z"
    }
  },
  "profiles": {
    "frontend": {
      "description": "Frontend development packages",
      "packages": ["react-patterns", "css-debug"]
    }
  },
  "activeProfile": "frontend"
}
```

## Project config format

Project configs are leaner -- they only contain project-specific state:

```json
{
  "installed": {
    "team-conventions": {
      "registry": "company",
      "type": "skill",
      "version": "1.0.0",
      "scope": "project",
      "installedAt": "2026-05-09T12:00:00.000Z"
    }
  },
  "profiles": {
    "ci": {
      "description": "CI pipeline packages",
      "packages": ["lint-fix", "test-runner"]
    }
  }
}
```

## Managing config

All config operations are available via the plugin tools (inside OpenCode)
and the CLI (from the terminal). See the [CLI Reference](cli.md) for
the terminal equivalents.

### View the current config

Plugin tool:
```
neo_config({ action: "show" })
```

CLI:
```sh
opencode-neo config show
```

Shows the merged config with all registries, installed packages (by scope), profiles, locks, and cache settings.

### Initialize project config

Plugin tool:
```
neo_config({ action: "init" })
```

CLI:
```sh
opencode-neo config init
```

Creates `.opencode/neo.json` in the current project. After this, packages installed with `scope: "project"` are tracked there instead of the global config.

Consider committing `.opencode/neo.json` so your team shares project-specific packages and profiles.

### See config file paths

Plugin tool:
```
neo_config({ action: "paths" })
```

CLI:
```sh
opencode-neo config paths
```

Shows which config files exist and their locations.

## Registries

Registries can be git repositories or local directories. See [Registry Format](registry-format.md) for the full spec.

### Registry config fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Short identifier |
| `url` | string | Git URL or local filesystem path |
| `branch` | string | Git branch (default `"main"`) |
| `enabled` | boolean | Whether this registry is active |
| `type` | `"git"` \| `"local"` | Source type (default `"git"`) |
| `auto` | boolean | Set automatically for auto-discovered registries |

### Auto-discovered project registries

If `.opencode/neo/registry.json` exists in the project worktree, Neo automatically loads it as a local registry named `project`. It appears at the front of the registry list (highest priority) and cannot be removed via `neo_registries remove`. No configuration needed.

### Adding a registry

```
neo_registries({ action: "add", url: "https://github.com/org/packages", name: "my-reg" })
neo_registries({ action: "add", url: "./local/path", name: "local-reg", local: true })
```

Registries are always global. They're shared across all projects.

### Removing a registry

```
neo_registries({ action: "remove", name: "my-reg" })
```

### Refreshing caches

```
neo_registries({ action: "refresh" })
```

Neo also refreshes stale registries automatically on startup (based on the `cache.ttl` setting, default 1 hour).

### Federation

Discover registries linked by your existing registries:

```
neo_registries({ action: "links" })
```

## Install scopes

When installing a package, choose where it lives:

```
neo_install({ name: "team-tool", scope: "global" })   # ~/.config/opencode/
neo_install({ name: "team-tool", scope: "project" })   # .opencode/
```

| Scope | Install path | Config file | Shared across projects |
|-------|-------------|-------------|----------------------|
| `global` | `~/.config/opencode/{skills,tools,commands,agents}/` | `~/.config/opencode/neo.json` | Yes |
| `project` | `.opencode/{skills,tools,commands,agents}/` | `.opencode/neo.json` | No |

Default is `global`.

## Version locking

Pin a package to the exact git commit it was installed from:

```
neo_install({ name: "critical-tool", lock: true })
```

This records the registry's HEAD SHA in the config. Locked packages are protected:

- `neo_update` skips locked packages by default
- Use `force: true` to update a locked package
- Use `lock: true` on update to re-lock to the new SHA

View locks:

```
neo_config({ action: "show" })
```

## Profiles

Profiles are named sets of packages.

### Create a profile

```
neo_profile({ action: "create", name: "frontend", packages: "react-patterns,css-debug,component-gen", description: "Frontend dev" })
```

### Activate a profile

```
neo_profile({ action: "activate", name: "frontend" })
```

When activated, any skills in the profile are loaded into the current session. Non-skill packages in the profile should be installed separately.

### List profiles

```
neo_profile({ action: "list" })
```

### Delete a profile

```
neo_profile({ action: "delete", name: "frontend" })
```

## Team sync

Export your complete setup (registries + installed packages + profiles) to a portable file:

```
neo_setup({ action: "export", path: "neo-setup.json" })
```

A teammate imports it:

```
neo_setup({ action: "import", path: "neo-setup.json" })
```

The import process:
- Adds any registries not already configured (matched by URL)
- Installs any packages not already installed (with security scanning for tools)
- Imports profiles

HIGH-risk tools detected during import are skipped. The user is directed to install them manually via `neo_install` to review the security scan.

## Cache

Registry clones are cached in `~/.cache/opencode/neo/<registry-name>/`. These are shallow git clones that are refreshed when stale.

| Setting | Default | Description |
|---------|---------|-------------|
| `cache.ttl` | `3600` (1 hour) | Seconds before a cache is considered stale |
| `cache.dir` | `~/.cache/opencode/neo` | Where registry clones are stored |

To force a refresh:

```
neo_registries({ action: "refresh" })
```
