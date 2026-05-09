import { join } from "node:path"
import { readFile, stat, readdir } from "node:fs/promises"
import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, RegistryIndex, Shell } from "../types.js"
import { validateSkill, validateTool, validateCommand, validateAgent, validateMcp } from "../packages/validator.js"

export function buildValidateTool(_config: NeoConfig, _$: Shell) {
  return tool({
    description:
      "Validate a Neo registry directory. Checks that registry.json is valid, " +
      "all declared packages exist on disk with correct structure, and reports " +
      "orphaned files not listed in the index. Use this before pushing changes.",
    args: {
      path: tool.schema
        .string()
        .describe("Path to the registry directory to validate"),
    },
    async execute(args, context) {
      const dir = args.path.startsWith("/") ? args.path : join(context.directory, args.path)
      return validateRegistry(dir)
    },
  })
}

async function validateRegistry(dir: string): Promise<string> {
  const issues: Array<{ severity: "error" | "warning"; message: string }> = []

  // 1. Check registry.json exists and parses
  let index: RegistryIndex
  try {
    const raw = await readFile(join(dir, "registry.json"), "utf-8")
    index = JSON.parse(raw)
  } catch (err: any) {
    return `FATAL: Cannot read or parse registry.json in ${dir}: ${err.message}`
  }

  if (!index.name) {
    issues.push({ severity: "error", message: "registry.json is missing 'name' field" })
  }
  if (!index.packages || typeof index.packages !== "object") {
    return `FATAL: registry.json has no 'packages' object.`
  }

  // 2. Validate each declared package
  for (const [name, entry] of Object.entries(index.packages)) {
    const pkgDir = join(dir, entry.path)

    if (!(await exists(pkgDir))) {
      issues.push({ severity: "error", message: `Package "${name}": directory ${entry.path}/ does not exist` })
      continue
    }

    // Check source file
    const sourceFileMap: Record<string, string> = { skill: "SKILL.md", tool: "tool.ts", command: "command.md", agent: "agent.md", mcp: "mcp.json" }
    const sourceFile = sourceFileMap[entry.type] ?? "SKILL.md"
    const sourcePath = join(pkgDir, sourceFile)

    if (!(await exists(sourcePath))) {
      issues.push({ severity: "error", message: `Package "${name}": missing ${sourceFile} in ${entry.path}/` })
      continue
    }

    // Validate content
    try {
      const content = await readFile(sourcePath, "utf-8")
      let result: { valid: boolean; error?: string }
      switch (entry.type) {
        case "skill": result = validateSkill(content); break
        case "tool": result = validateTool(content); break
        case "command": result = validateCommand(content); break
        case "agent": result = validateAgent(content); break
        case "mcp": result = validateMcp(content); break
        default: result = { valid: false, error: `unknown package type "${entry.type}"` }; break
      }
      if (!result.valid) {
        issues.push({ severity: "error", message: `Package "${name}": ${result.error}` })
      }
    } catch (err: any) {
      issues.push({ severity: "error", message: `Package "${name}": cannot read ${sourceFile}: ${err.message}` })
    }

    // Check required fields
    if (!entry.description) {
      issues.push({ severity: "warning", message: `Package "${name}": missing description` })
    }
    if (!entry.version) {
      issues.push({ severity: "warning", message: `Package "${name}": missing version` })
    }
  }

  // 3. Check for orphaned packages (dirs on disk not in index)
  for (const typeDir of ["skills", "tools", "commands", "agents", "mcps"]) {
    const typePath = join(dir, typeDir)
    if (!(await exists(typePath))) continue

    try {
      const entries = await readdir(typePath)
      for (const entry of entries) {
        if (entry.startsWith(".")) continue
        const expectedPath = `${typeDir}/${entry}`
        const isListed = Object.values(index.packages).some((p) => p.path === expectedPath)
        if (!isListed) {
          issues.push({ severity: "warning", message: `Orphaned: ${expectedPath}/ exists on disk but is not listed in registry.json` })
        }
      }
    } catch {}
  }

  // 4. Validate links
  if (index.links) {
    for (const link of index.links) {
      if (!link.name) issues.push({ severity: "error", message: "A link entry is missing 'name'" })
      if (!link.url) issues.push({ severity: "error", message: `Link "${link.name ?? "?"}": missing 'url'` })
      if (!link.relationship) issues.push({ severity: "warning", message: `Link "${link.name}": missing 'relationship'` })
    }
  }

  // 5. Validate bundles
  if (index.bundles) {
    for (const [name, bundle] of Object.entries(index.bundles)) {
      if (!bundle.packages?.length) {
        issues.push({ severity: "warning", message: `Bundle "${name}": has no packages` })
        continue
      }
      for (const pkg of bundle.packages) {
        if (!index.packages[pkg]) {
          issues.push({ severity: "error", message: `Bundle "${name}": references package "${pkg}" which is not declared` })
        }
      }
    }
  }

  // Format result
  const errors = issues.filter((i) => i.severity === "error")
  const warnings = issues.filter((i) => i.severity === "warning")
  const pkgCount = Object.keys(index.packages).length
  const bundleCount = Object.keys(index.bundles ?? {}).length
  const linkCount = (index.links ?? []).length

  const lines = [
    `Registry: ${index.name}`,
    `  ${pkgCount} package(s), ${bundleCount} bundle(s), ${linkCount} link(s)`,
    "",
  ]

  if (errors.length === 0 && warnings.length === 0) {
    lines.push("Validation passed. No issues found.")
    return lines.join("\n")
  }

  if (errors.length > 0) {
    lines.push(`ERRORS (${errors.length}):`)
    for (const e of errors) lines.push(`  - ${e.message}`)
    lines.push("")
  }

  if (warnings.length > 0) {
    lines.push(`WARNINGS (${warnings.length}):`)
    for (const w of warnings) lines.push(`  - ${w.message}`)
    lines.push("")
  }

  lines.push(errors.length > 0 ? "Validation FAILED." : "Validation passed with warnings.")

  return lines.join("\n")
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}
