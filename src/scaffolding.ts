import { join } from "node:path"
import { mkdir, writeFile, readFile, stat } from "node:fs/promises"
import type { PackageType, RegistryIndex, Shell } from "./types.js"
import { validateName } from "./safepath.js"

// ---------------------------------------------------------------------------
// Registry scaffolding
// ---------------------------------------------------------------------------

/**
 * Scaffold a new Neo registry in the given directory.
 *
 * Creates the directory structure, registry.json, and optionally
 * initializes a git repository.
 */
export async function scaffoldRegistry(
  $: Shell,
  dir: string,
  name: string,
  description: string,
  initGit: boolean,
): Promise<string> {
  // Check if directory already has a registry.json
  if (await exists(join(dir, "registry.json"))) {
    return `Directory ${dir} already contains a registry.json. This is already a Neo registry.`
  }

  // Create directory structure
  await mkdir(dir, { recursive: true })
  await mkdir(join(dir, "skills"), { recursive: true })
  await mkdir(join(dir, "tools"), { recursive: true })
  await mkdir(join(dir, "commands"), { recursive: true })
  await mkdir(join(dir, "agents"), { recursive: true })

  // Write registry.json
  const index: RegistryIndex = {
    name,
    description,
    links: [],
    packages: {},
  }
  await writeFile(
    join(dir, "registry.json"),
    JSON.stringify(index, null, 2) + "\n",
    "utf-8",
  )

  // Write a README
  await writeFile(
    join(dir, "README.md"),
    [
      `# ${name}`,
      "",
      description,
      "",
      "This is a [Neo](https://github.com/jasnell/opencode-neo) package registry.",
      "",
      "## Structure",
      "",
      "```",
      "registry.json          # Package index (includes links to related registries)",
      "skills/                # Skill packages (SKILL.md files)",
      "tools/                 # Tool packages (tool.ts files)",
      "commands/              # Command packages (command.md files)",
      "agents/                # Agent packages (agent.md files)",
      "```",
      "",
      "## Federation",
      "",
      "This registry can link to other registries via the `links` field in",
      "`registry.json`. Linked registries are surfaced to users when they add",
      "this registry, and can be discovered via `neo_registries({ action: 'links' })`.",
      "",
      "```json",
      `{`,
      `  "links": [`,
      `    {`,
      `      "name": "other-registry",`,
      `      "url": "https://github.com/org/other-registry",`,
      `      "relationship": "recommends",`,
      `      "description": "Complementary packages"`,
      `    }`,
      `  ]`,
      `}`,
      "```",
      "",
      "Relationship types: `recommends`, `extends`, `requires`.",
      "",
      "## Usage",
      "",
      "Add this registry to Neo:",
      "",
      "```",
      `neo_registries({ action: "add", url: "<this-repo-url>", name: "${name}" })`,
      "```",
      "",
      "Or configure it in your `opencode.json`:",
      "",
      "```json",
      `{`,
      `  "plugin": ["opencode-neo"]`,
      `}`,
      "```",
      "",
      "Then add the registry via the `neo_registries` tool.",
      "",
    ].join("\n"),
    "utf-8",
  )

  // Write .gitignore
  await writeFile(
    join(dir, ".gitignore"),
    ["node_modules/", ".DS_Store", "*.log", ""].join("\n"),
    "utf-8",
  )

  // Optionally initialize git
  if (initGit) {
    try {
      await $`git init ${dir}`.quiet()
      await $`git -C ${dir} add -A`.quiet()
      await $`git -C ${dir} commit -m ${"Initial Neo registry scaffold"}`.quiet()
    } catch (err: any) {
      // Git init is best-effort
      return (
        `Registry scaffolded at ${dir}, but git init failed: ${err?.stderr?.toString?.() ?? err.message}. ` +
        `You can initialize git manually.`
      )
    }
  }

  const lines = [
    `Registry "${name}" scaffolded at ${dir}.`,
    "",
    "Directory structure:",
    "  registry.json    -- package index (currently empty)",
    "  skills/          -- place skill packages here",
    "  tools/           -- place tool packages here",
    "  commands/        -- place command packages here",
    "  README.md        -- registry documentation",
    "",
  ]

  if (initGit) {
    lines.push("Git repository initialized with an initial commit.")
    lines.push("")
  }

  lines.push(
    "Next steps:",
    "  1. Add packages using neo_create with type 'skill', 'tool', 'command', or 'agent'",
    "  2. Push to a git remote (GitHub, GitLab, etc.)",
    "  3. Add the registry to Neo with neo_registries",
  )

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Package scaffolding
// ---------------------------------------------------------------------------

/**
 * Scaffold a new package within an existing Neo registry.
 *
 * Creates the package directory, template file, and updates registry.json.
 */
export async function scaffoldPackage(
  registryDir: string,
  type: PackageType,
  name: string,
  description: string,
): Promise<string> {
  // Validate package name for path safety
  try {
    validateName(name, "package")
  } catch (err: any) {
    return err.message
  }

  // Verify this is a registry directory
  if (!(await exists(join(registryDir, "registry.json")))) {
    return (
      `Directory ${registryDir} does not contain a registry.json. ` +
      `Use neo_create with type "registry" to scaffold a registry first.`
    )
  }

  // Determine paths
  const typeDirMap: Record<PackageType, string> = { skill: "skills", tool: "tools", command: "commands", agent: "agents" }
  const typeDir = typeDirMap[type]
  const pkgDir = join(registryDir, typeDir, name)

  if (await exists(pkgDir)) {
    return `Package "${name}" already exists at ${pkgDir}.`
  }

  await mkdir(pkgDir, { recursive: true })

  // Write the template file
  switch (type) {
    case "skill":
      await writeFile(
        join(pkgDir, "SKILL.md"),
        scaffoldSkillTemplate(name, description),
        "utf-8",
      )
      break
    case "tool":
      await writeFile(
        join(pkgDir, "tool.ts"),
        scaffoldToolTemplate(name, description),
        "utf-8",
      )
      break
    case "command":
      await writeFile(
        join(pkgDir, "command.md"),
        scaffoldCommandTemplate(name, description),
        "utf-8",
      )
      break
    case "agent":
      await writeFile(
        join(pkgDir, "agent.md"),
        scaffoldAgentTemplate(name, description),
        "utf-8",
      )
      break
  }

  // Update registry.json
  const raw = await readFile(join(registryDir, "registry.json"), "utf-8")
  const index: RegistryIndex = JSON.parse(raw)

  index.packages[name] = {
    type,
    description,
    version: "1.0.0",
    path: `${typeDir}/${name}`,
    tags: [],
  }

  await writeFile(
    join(registryDir, "registry.json"),
    JSON.stringify(index, null, 2) + "\n",
    "utf-8",
  )

  const fileNameMap: Record<PackageType, string> = { skill: "SKILL.md", tool: "tool.ts", command: "command.md", agent: "agent.md" }
  const fileName = fileNameMap[type]

  return [
    `Package "${name}" (${type}) created at ${pkgDir}/.`,
    "",
    `  ${fileName}  -- edit this file to implement the ${type}`,
    "",
    `registry.json updated with the new package entry.`,
    "",
    `Next: edit ${pkgDir}/${fileName}, then commit and push to the remote.`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function scaffoldSkillTemplate(name: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    `# ${titleCase(name)}`,
    "",
    "<!-- Write the skill instructions below. -->",
    "<!-- These are injected into the agent's conversation context when loaded. -->",
    "",
    "## When to use this skill",
    "",
    "<!-- Describe when the agent should load this skill. -->",
    "",
    "## Instructions",
    "",
    "<!-- Detailed instructions for the agent. -->",
    "",
  ].join("\n")
}

function scaffoldToolTemplate(name: string, description: string): string {
  return [
    `import { tool } from "@opencode-ai/plugin"`,
    "",
    "export default tool({",
    `  description: ${JSON.stringify(description)},`,
    "  args: {",
    '    // Define arguments using tool.schema (Zod)',
    '    // example: tool.schema.string().describe("An example argument"),',
    "  },",
    "  async execute(args, context) {",
    "    // Implement the tool logic here.",
    "    // context provides: sessionID, messageID, agent, directory, worktree",
    `    return "TODO: implement ${name}"`,
    "  },",
    "})",
    "",
  ].join("\n")
}

function scaffoldCommandTemplate(name: string, description: string): string {
  return [
    "---",
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    "<!-- Command template. $ARGUMENTS is the full argument string. -->",
    "<!-- $1, $2, etc. are positional arguments. -->",
    "",
    `TODO: implement the ${name} command template.`,
    "",
    "$ARGUMENTS",
    "",
  ].join("\n")
}

function scaffoldAgentTemplate(name: string, description: string): string {
  return [
    "---",
    `description: ${JSON.stringify(description)}`,
    "mode: subagent",
    "permission:",
    "  edit: deny",
    "  bash: deny",
    "---",
    "",
    `You are the ${titleCase(name)} agent.`,
    "",
    "<!-- Define the agent's system prompt below. -->",
    "<!-- This controls the agent's behavior, personality, and constraints. -->",
    "",
    "## Role",
    "",
    "<!-- What this agent does and when it should be invoked. -->",
    "",
    "## Guidelines",
    "",
    "<!-- Detailed instructions for how this agent should behave. -->",
    "",
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function titleCase(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}
