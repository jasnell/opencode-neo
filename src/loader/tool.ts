import { join } from "node:path"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import type { NeoConfig } from "../types.js"
import { readCachedFile } from "../registry/cache.js"
import { resolvePackage } from "../registry/resolver.js"
import { validateName } from "../safepath.js"

/**
 * Describe a tool package without executing it.
 *
 * Returns the tool's description and its FULL source code.
 * The caller is responsible for truncating for display if needed.
 * The full source is needed for accurate security scanning (#18).
 */
export async function describeTool(
  config: NeoConfig,
  name: string,
): Promise<{ description: string; source: string; found: boolean }> {
  const resolved = await resolvePackage(config, name)
  if (!resolved) {
    return { description: `Tool "${name}" not found in any configured registry.`, source: "", found: false }
  }

  if (resolved.entry.type !== "tool") {
    return {
      description: `Package "${name}" is a ${resolved.entry.type}, not a tool.`,
      source: "",
      found: false,
    }
  }

  const source = await readCachedFile(
    resolved.cacheDir,
    join(resolved.entry.path, "tool.ts"),
  )

  if (!source) {
    return {
      description: `Tool "${name}" is listed in registry "${resolved.registry}" but the tool.ts file is missing.`,
      source: "",
      found: false,
    }
  }

  return {
    description: resolved.entry.description,
    source,
    found: true,
  }
}

/**
 * Execute a tool from pre-fetched source code.
 *
 * Accepts the source directly rather than re-reading from cache,
 * eliminating the TOCTOU race between scanning and execution (#1).
 *
 * IMPORTANT: This should only be called AFTER the user has approved
 * execution via the permission system and the source has been scanned.
 */
export async function executeTool(
  source: string,
  name: string,
  toolArgs: Record<string, unknown>,
  toolContext: { sessionID: string; messageID: string; agent: string; directory: string; worktree: string },
): Promise<string> {
  validateName(name, "tool")

  // Write to a temp file for dynamic import
  const tempDir = join(tmpdir(), "opencode-neo")
  await mkdir(tempDir, { recursive: true })
  const tempFile = join(tempDir, `${name}-${Date.now()}.ts`)

  try {
    await writeFile(tempFile, source, "utf-8")

    // Dynamic import -- Bun handles .ts natively
    const mod = await import(tempFile)
    const toolDef = mod.default ?? mod

    if (typeof toolDef?.execute !== "function") {
      return `Tool "${name}" does not export an execute function.`
    }

    // Call the tool's execute with the provided args and a minimal context
    const result = await toolDef.execute(toolArgs, toolContext)

    if (typeof result === "string") {
      return result
    }

    return JSON.stringify(result, null, 2)
  } catch (err: any) {
    return `Error executing tool "${name}": ${err.message}`
  } finally {
    // Clean up temp file
    await rm(tempFile, { force: true }).catch(() => {})
  }
}
