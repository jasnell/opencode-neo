import { join, resolve } from "node:path"
import { mkdir, rm, readFile } from "node:fs/promises"
import type { NeoConfig, RegistryConfig } from "../types.js"
import { getLastFetchTime } from "./git.js"
import { safeJoin, validateName } from "../safepath.js"

/**
 * Get the content directory for a specific registry.
 *
 * For git registries, this is the cache directory (~/.cache/opencode/neo/<name>/).
 * For local registries, this is the local path itself (no caching needed).
 */
export function registryCacheDir(config: NeoConfig, registryName: string): string {
  const reg = config.registries.find((r) => r.name === registryName)
  if (reg && isLocalRegistry(reg)) {
    return resolve(reg.url)
  }
  validateName(registryName, "registry")
  return join(config.cache.dir, registryName)
}

/**
 * Check if a registry config represents a local directory registry.
 */
export function isLocalRegistry(reg: RegistryConfig): boolean {
  return reg.type === "local"
}

/**
 * Check if a registry's cache is stale (older than the configured TTL).
 */
export async function isCacheStale(cacheDir: string, ttlSeconds: number): Promise<boolean> {
  const lastFetch = await getLastFetchTime(cacheDir)
  if (!lastFetch) return true
  const ageMs = Date.now() - lastFetch.getTime()
  return ageMs > ttlSeconds * 1000
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export async function ensureCacheDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

/**
 * Read a file from a registry's cache directory.
 * Returns null if the file doesn't exist.
 * Validates the path stays within the cache directory.
 */
export async function readCachedFile(
  cacheDir: string,
  relativePath: string,
): Promise<string | null> {
  try {
    const safePath = safeJoin(cacheDir, relativePath)
    return await readFile(safePath, "utf-8")
  } catch (err: any) {
    if (err.message?.includes("Path traversal")) throw err
    return null
  }
}

/**
 * Remove a registry's entire cache directory.
 */
export async function cleanCache(cacheDir: string): Promise<void> {
  await rm(cacheDir, { recursive: true, force: true })
}
