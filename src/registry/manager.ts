import { resolve, join } from "node:path"
import { stat } from "node:fs/promises"
import type { NeoConfig, RegistryConfig, RegistryIndex, RegistryLink, RegistryType, Shell } from "../types.js"
import { saveConfig } from "../config.js"
import { validateName } from "../safepath.js"
import { cloneRegistry, refreshRegistry, isGitRepo } from "./git.js"
import {
  registryCacheDir,
  isLocalRegistry,
  isCacheStale,
  ensureCacheDir,
  readCachedFile,
  cleanCache,
} from "./cache.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddRegistryResult {
  /** Number of packages available in the newly added registry */
  packageCount: number
  /** Linked registries declared by this registry (federation) */
  links: RegistryLink[]
}

export interface LinkedRegistryInfo {
  link: RegistryLink
  /** Which of our configured registries declared this link */
  sourceRegistry: string
  /** Whether this linked registry is already configured locally */
  alreadyAdded: boolean
}

// ---------------------------------------------------------------------------
// Add / remove
// ---------------------------------------------------------------------------

/**
 * Add a new registry to the configuration.
 *
 * For git registries: clones the repo into the cache.
 * For local registries: verifies the directory exists and contains registry.json.
 *
 * Returns metadata about the registry including any linked registries
 * it declares, so the caller can surface them to the user.
 */
export async function addRegistry(
  $: Shell,
  config: NeoConfig,
  name: string,
  url: string,
  branch: string = "main",
  type: RegistryType = "git",
): Promise<AddRegistryResult> {
  // Validate registry name early (before any path construction)
  validateName(name, "registry")

  // Check for duplicate names
  if (config.registries.some((r) => r.name === name)) {
    throw new Error(`Registry "${name}" already exists. Remove it first or use a different name.`)
  }

  let contentDir: string
  let raw: string | null

  if (type === "local") {
    // Local registry: verify path exists
    const localPath = resolve(url)
    try {
      const s = await stat(localPath)
      if (!s.isDirectory()) throw new Error("not a directory")
    } catch {
      throw new Error(`Local registry path does not exist or is not a directory: ${localPath}`)
    }
    raw = await readCachedFile(localPath, "registry.json")
    if (!raw) {
      throw new Error(`${localPath} does not contain a registry.json file.`)
    }
    contentDir = localPath
  } else {
    // Git registry: clone into cache
    // Compute cache dir directly instead of mutating the shared config array
    contentDir = join(config.cache.dir, name)

    await ensureCacheDir(config.cache.dir)
    await cloneRegistry($, url, contentDir, branch)

    raw = await readCachedFile(contentDir, "registry.json")
    if (!raw) {
      await cleanCache(contentDir)
      throw new Error(
        `Repository ${url} does not contain a registry.json file. ` +
          `This doesn't appear to be a valid Neo registry.`,
      )
    }
  }

  // Validate the index
  let index: RegistryIndex
  try {
    index = JSON.parse(raw)
  } catch {
    if (type === "git") await cleanCache(contentDir)
    throw new Error(`registry.json in ${url} is not valid JSON.`)
  }

  const entry: RegistryConfig = { name, url, branch, enabled: true, type }
  config.registries.push(entry)
  await saveConfig(config)

  return {
    packageCount: Object.keys(index.packages ?? {}).length,
    links: index.links ?? [],
  }
}

/**
 * Remove a registry from the configuration.
 * For git registries, also cleans the cache directory.
 * For local registries, only removes the config entry (not the directory).
 * Auto-discovered registries cannot be removed.
 */
export async function removeRegistry(config: NeoConfig, name: string): Promise<void> {
  const idx = config.registries.findIndex((r) => r.name === name)
  if (idx === -1) {
    throw new Error(`Registry "${name}" not found.`)
  }

  const reg = config.registries[idx]
  if (reg.auto) {
    throw new Error(`Registry "${name}" is auto-discovered and cannot be removed. Remove the source directory instead.`)
  }

  // Only clean the cache for git registries -- never delete a local directory
  if (!isLocalRegistry(reg)) {
    const cacheDir = registryCacheDir(config, name)
    await cleanCache(cacheDir)
  }

  config.registries.splice(idx, 1)
  await saveConfig(config)
}

/**
 * List all configured registries.
 */
export function listRegistries(config: NeoConfig): RegistryConfig[] {
  return config.registries
}

/**
 * Refresh all enabled git registries by fetching latest from remote.
 * Local registries are skipped (they read from the filesystem directly).
 */
export async function refreshAllRegistries($: Shell, config: NeoConfig): Promise<void> {
  const results: Array<{ name: string; error?: string }> = []

  for (const reg of config.registries) {
    if (!reg.enabled || isLocalRegistry(reg)) continue
    const cacheDir = registryCacheDir(config, reg.name)
    try {
      if (await isGitRepo(cacheDir)) {
        await refreshRegistry($, cacheDir)
      } else {
        await ensureCacheDir(config.cache.dir)
        await cloneRegistry($, reg.url, cacheDir, reg.branch)
      }
    } catch (err: any) {
      results.push({ name: reg.name, error: err.message })
    }
  }

  if (results.some((r) => r.error)) {
    const failures = results
      .filter((r) => r.error)
      .map((r) => `  ${r.name}: ${r.error}`)
      .join("\n")
    console.error(`Some registries failed to refresh:\n${failures}`)
  }
}

/**
 * Refresh only stale git registries (based on configured TTL).
 * Local registries are skipped.
 * Intended for startup background refresh.
 */
export async function refreshStaleRegistries($: Shell, config: NeoConfig): Promise<void> {
  for (const reg of config.registries) {
    if (!reg.enabled || isLocalRegistry(reg)) continue
    const cacheDir = registryCacheDir(config, reg.name)
    try {
      if (await isGitRepo(cacheDir)) {
        if (await isCacheStale(cacheDir, config.cache.ttl)) {
          await refreshRegistry($, cacheDir)
        }
      } else {
        await ensureCacheDir(config.cache.dir)
        await cloneRegistry($, reg.url, cacheDir, reg.branch)
      }
    } catch {
      // Silently ignore failures during background refresh
    }
  }
}

/**
 * Load and parse the registry.json index from a registry's cache.
 */
export async function loadRegistryIndex(cacheDir: string): Promise<RegistryIndex | null> {
  const raw = await readCachedFile(cacheDir, "registry.json")
  if (!raw) return null
  try {
    return JSON.parse(raw) as RegistryIndex
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Federation
// ---------------------------------------------------------------------------

/**
 * Collect all linked registries declared across all configured registries.
 *
 * Each result is annotated with:
 * - which local registry declared the link
 * - whether the linked registry is already configured locally
 *   (matched by URL, since names may differ)
 */
export async function getLinkedRegistries(
  config: NeoConfig,
): Promise<LinkedRegistryInfo[]> {
  const configuredUrls = new Set(
    config.registries.map((r) => normalizeUrl(r.url)),
  )

  const results: LinkedRegistryInfo[] = []
  const seen = new Set<string>()

  for (const reg of config.registries) {
    if (!reg.enabled) continue
    const cacheDir = registryCacheDir(config, reg.name)
    const index = await loadRegistryIndex(cacheDir)
    if (!index?.links) continue

    for (const link of index.links) {
      // Deduplicate by URL across registries
      const normalizedUrl = normalizeUrl(link.url)
      if (seen.has(normalizedUrl)) continue
      seen.add(normalizedUrl)

      results.push({
        link,
        sourceRegistry: reg.name,
        alreadyAdded: configuredUrls.has(normalizedUrl),
      })
    }
  }

  return results
}

/**
 * Normalize a git URL for comparison.
 * Strips trailing .git, trailing slashes, and lowercases.
 */
export function normalizeUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
}
