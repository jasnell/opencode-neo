# Registry Format

A Neo registry is a git repository or local directory that contains an index file and package directories. This document specifies the format.

## Registry types

| Type | Source | Caching | Add command |
|------|--------|---------|-------------|
| `git` (default) | Remote git repo | Shallow clone in `~/.cache/opencode/neo/` | `neo_registries({ action: "add", url: "https://...", name: "my-reg" })` |
| `local` | Filesystem directory | None (reads directly) | `neo_registries({ action: "add", url: "./path", name: "my-reg", local: true })` |

Local registries read from the filesystem on every access -- no caching or refresh needed. They are not deleted when removed from the config.

### Auto-discovered project registries

If `.opencode/neo/registry.json` exists in the project worktree, Neo automatically loads it as a local registry named `project`. This registry:

- Is inserted at the **front** of the registry list (highest priority)
- Is tagged `auto: true` and cannot be removed via `neo_registries remove`
- Requires no user configuration -- cloning a project that has it is enough
- Is visible in `neo_registries list` and `neo_list --available`

This lets a project ship skills, tools, commands, and agents alongside its code:

```
my-project/
  .opencode/
    neo/
      registry.json
      skills/team-conventions/SKILL.md
      commands/deploy/command.md
```

## Directory structure

```
registry.json                # Required: package index
README.md                    # Recommended: human-readable docs
.gitignore                   # Recommended
skills/
  <name>/SKILL.md            # Skill packages
tools/
  <name>/tool.ts             # Tool packages
commands/
  <name>/command.md           # Command packages
agents/
  <name>/agent.md             # Agent packages
```

Each package lives in a directory named after the package, inside a type-specific parent directory.

## `registry.json`

The index file is the entry point. Neo reads it to discover available packages.

```json
{
  "name": "my-registry",
  "description": "Optional description of this registry",
  "links": [],
  "bundles": {},
  "packages": {}
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Short identifier for the registry |
| `description` | string | No | Human-readable description |
| `links` | array | No | Federation links to related registries |
| `bundles` | object | No | Named groups of packages |
| `packages` | object | Yes | Package declarations (keyed by name) |

## Package entries

Each key in `packages` is the package name. The value describes it:

```json
{
  "react-patterns": {
    "type": "skill",
    "description": "React component patterns and best practices",
    "version": "1.0.0",
    "path": "skills/react-patterns",
    "tags": ["react", "frontend"],
    "requires": ["typescript-basics"],
    "dependencies": ["react"],
    "compatibility": ">=1.0.0"
  }
}
```

### Package fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | One of: `"skill"`, `"tool"`, `"command"`, `"agent"` |
| `description` | string | Yes | Human-readable description. Used in search results. |
| `version` | string | Yes | Semver version string |
| `path` | string | Yes | Directory path relative to the repo root |
| `tags` | string[] | No | Keywords for search. Matched against queries. |
| `requires` | string[] | No | Other Neo packages this package depends on |
| `dependencies` | string[] | No | npm packages this tool requires (informational only) |
| `compatibility` | string | No | Minimum OpenCode version required |

### Package names

Package names must:

- Be alphanumeric with hyphens and underscores (`[a-zA-Z0-9][a-zA-Z0-9_-]*`)
- Not start with a hyphen or underscore
- Not contain path separators or special characters

These constraints are enforced at install time to prevent path traversal.

## Package types

### Skills (`type: "skill"`)

**Source file**: `SKILL.md`

Skills are markdown files with YAML frontmatter that get injected into the agent's conversation context. They teach the agent domain knowledge, conventions, or workflows.

```markdown
---
name: react-patterns
description: "React component patterns and best practices"
---

# React Patterns

Instructions for the agent...
```

**Required frontmatter fields**: `name`, `description`

Skills can be loaded dynamically via `neo_load` without installing.

### Tools (`type: "tool"`)

**Source file**: `tool.ts`

Tools are TypeScript files that export an OpenCode tool definition. They are executable code that the agent can call.

```typescript
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Query a database",
  args: {
    query: tool.schema.string().describe("SQL query"),
  },
  async execute(args, context) {
    // Implementation
    return "result"
  },
})
```

**Requirements**: Must have at least one export. The default export (or named exports) should be a tool definition with an `execute` function.

Tools are security-scanned before install (`neo_install`) or dynamic execution (`neo_exec`). The scanner checks for dangerous APIs like `eval`, `child_process`, filesystem access, network calls, and environment variable access.

### Commands (`type: "command"`)

**Source file**: `command.md`

Commands are markdown templates with YAML frontmatter. They are executed via the `/neo <name>` bootstrap command.

```markdown
---
description: "Deploy to production"
---

Deploy the application to $1 environment.
Full arguments: $ARGUMENTS
```

**Required frontmatter fields**: `description`

**Template variables**:
- `$ARGUMENTS` -- The full argument string
- `$1`, `$2`, ... `$9` -- Positional arguments (parsed from `$ARGUMENTS`)

Commands can be loaded dynamically via `neo_load` or `/neo <name>`.

### Agents (`type: "agent"`)

**Source file**: `agent.md`

Agents are markdown files with YAML frontmatter that define custom OpenCode agents with system prompts and permission configuration.

```markdown
---
description: "Code reviewer"
mode: subagent
temperature: 0.1
permission:
  edit: deny
  bash: deny
---

You are a code reviewer. Focus on security, performance, and maintainability.
```

**Required frontmatter fields**: `description`, `mode`

The `mode` field must be `"primary"`, `"subagent"`, or `"all"`. See the [OpenCode agents documentation](https://opencode.ai/docs/agents/) for all available frontmatter fields.

Agents must be installed to be available. They cannot be loaded dynamically mid-session.

## Bundles

Bundles are named groups of packages that install together:

```json
{
  "bundles": {
    "kubernetes": {
      "description": "Full K8s toolkit",
      "packages": ["k8s-debugging", "k8s-deploy", "helm-patterns"]
    }
  }
}
```

Install with:

```
neo_install({ name: "kubernetes", bundle: true })
```

All referenced packages must exist in the same registry's `packages` section. The `neo_validate` tool checks for broken bundle references.

### Bundle fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | Yes | What this bundle provides |
| `packages` | string[] | Yes | Package names to install |

## Federation (links)

Registries can link to related registries:

```json
{
  "links": [
    {
      "name": "community",
      "url": "https://github.com/community/opencode-packages",
      "relationship": "recommends",
      "description": "Community packages we build on"
    }
  ]
}
```

When a user adds your registry, Neo surfaces linked registries and offers to add them. Users can also discover links via:

```
neo_registries({ action: "links" })
```

### Link fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Short identifier for the linked registry |
| `url` | string | Yes | Git URL (HTTPS or SSH) |
| `relationship` | string | Yes | One of: `"recommends"`, `"extends"`, `"requires"` |
| `description` | string | No | Why this link exists |
| `branch` | string | No | Git branch (defaults to `"main"`) |

### Relationship types

| Type | Meaning |
|------|---------|
| `recommends` | This registry suggests also using the linked one |
| `extends` | This registry builds on top of the linked one |
| `requires` | Packages in this registry may depend on packages from the linked one |

## Validation

Use `neo_validate` to check a registry directory:

Plugin tool:
```
neo_validate({ path: "./my-registry" })
```

CLI:
```sh
opencode-neo validate ./my-registry
```

It checks:
- `registry.json` exists and parses correctly
- All declared packages exist on disk with the correct source file
- Source files pass type-specific validation (frontmatter, exports, etc.)
- Required fields are present
- Bundle references are valid
- Link entries have required fields
- No orphaned package directories exist on disk

## Creating a registry

The easiest way to start:

Plugin tool:
```
neo_create({ type: "registry", name: "my-team", path: "./my-team-registry" })
```

CLI:
```sh
opencode-neo create registry my-team ./my-team-registry
```

This scaffolds the directory structure, an empty `registry.json`, a README, and optionally initializes a git repo.

Then add packages:

Plugin tool:
```
neo_create({ type: "skill", name: "our-conventions", path: "./my-team-registry", description: "Team coding conventions" })
```

CLI:
```sh
opencode-neo create skill our-conventions ./my-team-registry --description "Team coding conventions"
```

Or import existing local packages:

Plugin tool:
```
neo_publish({ source: "~/.config/opencode/skills/my-skill", registry: "./my-team-registry" })
```

CLI:
```sh
opencode-neo publish ~/.config/opencode/skills/my-skill ./my-team-registry
```

See the [CLI Reference](cli.md) for all available commands.
