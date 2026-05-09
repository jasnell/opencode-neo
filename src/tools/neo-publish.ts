import { join, basename } from "node:path"
import { readFile, stat, mkdir, writeFile, cp } from "node:fs/promises"
import { homedir } from "node:os"
import { tool } from "@opencode-ai/plugin"
import type { NeoConfig, PackageType, RegistryIndex, Shell } from "../types.js"

export function buildPublishTool(_config: NeoConfig, _$: Shell, _worktree: string) {
  return tool({
    description:
      "Import a local skill, tool, or command into a Neo registry. " +
      "Takes an existing file from your OpenCode config and copies it into " +
      "a registry directory, updating registry.json. The reverse of neo_install.",
    args: {
      source: tool.schema
        .string()
        .describe(
          "Path to the local skill/tool/command. Can be a skill directory " +
            "(containing SKILL.md), a .ts tool file, or a .md command file.",
        ),
      registry: tool.schema
        .string()
        .describe("Path to the registry directory to publish into"),
      name: tool.schema
        .string()
        .optional()
        .describe("Package name (defaults to the source filename/directory name)"),
      description: tool.schema
        .string()
        .optional()
        .describe("Package description (required if not already in the source)"),
    },
    async execute(args, context) {
      const sourcePath = resolvePath(args.source, context.directory)
      const registryDir = resolvePath(args.registry, context.directory)

      // Verify registry
      const regJsonPath = join(registryDir, "registry.json")
      let index: RegistryIndex
      try {
        index = JSON.parse(await readFile(regJsonPath, "utf-8"))
      } catch {
        return `${registryDir} is not a Neo registry (no valid registry.json found).`
      }

      // Detect source type
      const detection = await detectSourceType(sourcePath)
      if (!detection) {
        return (
          `Cannot determine package type from ${sourcePath}. ` +
          `Expected a directory with SKILL.md (skill), a .ts file (tool), or a .md file (command).`
        )
      }

      const pkgName = args.name ?? detection.inferredName
      if (index.packages[pkgName]) {
        return `Package "${pkgName}" already exists in this registry. Choose a different name.`
      }

      // Copy source into registry
      const typeDirMap: Record<PackageType, string> = { skill: "skills", tool: "tools", command: "commands", agent: "agents" }
      const typeDir = typeDirMap[detection.type]
      const destDir = join(registryDir, typeDir, pkgName)
      await mkdir(destDir, { recursive: true })

      if (detection.type === "skill") {
        // Copy the whole directory
        await cp(sourcePath, destDir, { recursive: true })
      } else {
        // Copy single file
        const destFileMap: Record<PackageType, string> = { skill: "SKILL.md", tool: "tool.ts", command: "command.md", agent: "agent.md" }
        const destFile = destFileMap[detection.type]
        const content = await readFile(sourcePath, "utf-8")
        await writeFile(join(destDir, destFile), content, "utf-8")
      }

      // Extract description from source if not provided
      const desc = args.description ?? (await extractDescription(sourcePath, detection.type)) ?? `A Neo ${detection.type}`

      // Update registry.json
      index.packages[pkgName] = {
        type: detection.type,
        description: desc,
        version: "1.0.0",
        path: `${typeDir}/${pkgName}`,
        tags: [],
      }
      await writeFile(regJsonPath, JSON.stringify(index, null, 2) + "\n", "utf-8")

      return [
        `Published "${pkgName}" (${detection.type}) to registry at ${registryDir}.`,
        `  source: ${sourcePath}`,
        `  destination: ${destDir}`,
        "",
        "registry.json updated. Commit and push to make it available.",
      ].join("\n")
    },
  })
}

interface DetectionResult {
  type: PackageType
  inferredName: string
}

async function detectSourceType(sourcePath: string): Promise<DetectionResult | null> {
  try {
    const s = await stat(sourcePath)
    if (s.isDirectory()) {
      // Check for SKILL.md (skill) or agent.md (agent)
      try {
        await stat(join(sourcePath, "SKILL.md"))
        return { type: "skill", inferredName: basename(sourcePath) }
      } catch {}
      try {
        await stat(join(sourcePath, "agent.md"))
        return { type: "agent", inferredName: basename(sourcePath) }
      } catch {}
      return null
    }

    if (sourcePath.endsWith(".ts")) {
      return { type: "tool", inferredName: basename(sourcePath, ".ts") }
    }
    if (sourcePath.endsWith(".md")) {
      // Distinguish between agent and command by checking frontmatter for mode:
      try {
        const content = await readFile(sourcePath, "utf-8")
        if (content.startsWith("---")) {
          const endIdx = content.indexOf("---", 3)
          if (endIdx !== -1) {
            const fm = content.slice(3, endIdx)
            if (fm.match(/^mode\s*:/m)) {
              return { type: "agent", inferredName: basename(sourcePath, ".md") }
            }
          }
        }
      } catch {}
      return { type: "command", inferredName: basename(sourcePath, ".md") }
    }
  } catch {
    // path doesn't exist
  }
  return null
}

async function extractDescription(sourcePath: string, type: PackageType): Promise<string | null> {
  try {
    let content: string
    if (type === "skill") {
      content = await readFile(join(sourcePath, "SKILL.md"), "utf-8")
    } else {
      content = await readFile(sourcePath, "utf-8")
    }

    // Try to extract from frontmatter
    if (content.startsWith("---")) {
      const end = content.indexOf("---", 3)
      if (end !== -1) {
        const fm = content.slice(3, end)
        const match = fm.match(/^description\s*:\s*["']?(.+?)["']?\s*$/m)
        if (match) return match[1]
      }
    }
  } catch {}
  return null
}

function resolvePath(p: string, cwd: string): string {
  if (p.startsWith("/")) return p
  if (p.startsWith("~/")) return join(homedir(), p.slice(2))
  return join(cwd, p)
}
