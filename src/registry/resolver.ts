import type { NeoConfig, PackageType, SearchResult, ResolvedPackage } from "../types.js"
import { registryCacheDir } from "./cache.js"
import { loadRegistryIndex } from "./manager.js"

/**
 * Search across all enabled registries for packages matching a query.
 *
 * Scoring: exact name match > name contains > description contains > tag match.
 * Results are sorted by score descending, then by registry order.
 */
export async function searchPackages(
  config: NeoConfig,
  query: string,
  typeFilter?: PackageType,
): Promise<SearchResult[]> {
  const q = query.toLowerCase()
  const results: Array<SearchResult & { score: number }> = []

  for (const reg of config.registries) {
    if (!reg.enabled) continue
    const cacheDir = registryCacheDir(config, reg.name)
    const index = await loadRegistryIndex(cacheDir)
    if (!index) continue

    for (const [name, entry] of Object.entries(index.packages)) {
      if (typeFilter && entry.type !== typeFilter) continue

      let score = 0
      const nameLower = name.toLowerCase()
      const descLower = entry.description.toLowerCase()
      const tags = (entry.tags ?? []).map((t) => t.toLowerCase())

      if (nameLower === q) {
        score = 100
      } else if (nameLower.includes(q)) {
        score = 75
      } else if (descLower.includes(q)) {
        score = 50
      } else if (tags.some((t) => t.includes(q))) {
        score = 25
      }

      if (score > 0) {
        results.push({
          name,
          type: entry.type,
          description: entry.description,
          version: entry.version,
          registry: reg.name,
          tags: entry.tags ?? [],
          score,
        })
      }
    }
  }

  // Sort by score descending. Equal scores preserve registry order.
  results.sort((a, b) => b.score - a.score)

  // Strip internal score from results
  return results.map(({ score: _score, ...rest }) => rest)
}

/**
 * Resolve a specific package by name across all enabled registries.
 * Returns the first match (registry order = priority).
 */
export async function resolvePackage(
  config: NeoConfig,
  name: string,
): Promise<ResolvedPackage | null> {
  for (const reg of config.registries) {
    if (!reg.enabled) continue
    const cacheDir = registryCacheDir(config, reg.name)
    const index = await loadRegistryIndex(cacheDir)
    if (!index) continue

    const entry = index.packages[name]
    if (entry) {
      return { name, registry: reg.name, entry, cacheDir }
    }
  }
  return null
}
