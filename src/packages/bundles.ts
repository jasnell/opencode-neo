import type { NeoConfig, BundleEntry } from "../types.js"
import { registryCacheDir } from "../registry/cache.js"
import { loadRegistryIndex } from "../registry/manager.js"

export interface ResolvedBundle {
  name: string
  registry: string
  entry: BundleEntry
}

/**
 * Resolve a bundle by name across all enabled registries.
 */
export async function resolveBundle(
  config: NeoConfig,
  name: string,
): Promise<ResolvedBundle | null> {
  for (const reg of config.registries) {
    if (!reg.enabled) continue
    const cacheDir = registryCacheDir(config, reg.name)
    const index = await loadRegistryIndex(cacheDir)
    if (!index?.bundles) continue

    const entry = index.bundles[name]
    if (entry) {
      return { name, registry: reg.name, entry }
    }
  }
  return null
}

/**
 * List all available bundles across registries.
 */
export async function listBundles(
  config: NeoConfig,
): Promise<Array<{ name: string; registry: string; entry: BundleEntry }>> {
  const results: Array<{ name: string; registry: string; entry: BundleEntry }> = []

  for (const reg of config.registries) {
    if (!reg.enabled) continue
    const cacheDir = registryCacheDir(config, reg.name)
    const index = await loadRegistryIndex(cacheDir)
    if (!index?.bundles) continue

    for (const [name, entry] of Object.entries(index.bundles)) {
      results.push({ name, registry: reg.name, entry })
    }
  }

  return results
}
