import type { NeoConfig } from "../types.js"
import { resolvePackage } from "../registry/resolver.js"

export interface DependencyCheck {
  /** Packages that are satisfied (installed or available) */
  satisfied: string[]
  /** Packages that are missing entirely */
  missing: string[]
  /** Packages available in a registry but not installed */
  available: string[]
}

/**
 * Check whether a package's declared dependencies are satisfied.
 *
 * A dependency is "satisfied" if it's installed. It's "available" if it
 * exists in a registry but isn't installed. It's "missing" if it can't
 * be found anywhere.
 */
export async function checkDependencies(
  config: NeoConfig,
  requires: string[],
): Promise<DependencyCheck> {
  const satisfied: string[] = []
  const missing: string[] = []
  const available: string[] = []

  for (const dep of requires) {
    if (config.installed[dep]) {
      satisfied.push(dep)
    } else {
      const resolved = await resolvePackage(config, dep)
      if (resolved) {
        available.push(dep)
      } else {
        missing.push(dep)
      }
    }
  }

  return { satisfied, missing, available }
}

/**
 * Format a dependency check result as a human-readable string.
 */
export function formatDependencyCheck(
  packageName: string,
  check: DependencyCheck,
): string | null {
  if (check.missing.length === 0 && check.available.length === 0) {
    return null // All satisfied
  }

  const lines: string[] = []

  if (check.missing.length > 0) {
    lines.push(
      `Package "${packageName}" requires ${check.missing.join(", ")} ` +
        `which cannot be found in any configured registry.`,
    )
  }

  if (check.available.length > 0) {
    lines.push(
      `Package "${packageName}" requires ${check.available.join(", ")} ` +
        `which are available but not installed. Consider installing them first.`,
    )
  }

  return lines.join("\n")
}
