import type { NeoConfig, Shell } from "../types.js"
import { saveConfig } from "../config.js"
import { registryCacheDir } from "../registry/cache.js"

/**
 * Record a lock entry for an installed package by capturing the
 * current HEAD SHA from the registry's cached clone.
 */
export async function lockPackage(
  $: Shell,
  config: NeoConfig,
  name: string,
): Promise<void> {
  const installed = config.installed[name]
  if (!installed) return

  const cacheDir = registryCacheDir(config, installed.registry)
  const sha = await getHeadSha($, cacheDir)
  if (!sha) return

  if (!config.locks) config.locks = {}
  config.locks[name] = {
    registry: installed.registry,
    version: installed.version,
    sha,
    lockedAt: new Date().toISOString(),
  }
  await saveConfig(config)
}

/**
 * Remove a lock entry for a package.
 */
export async function unlockPackage(
  config: NeoConfig,
  name: string,
): Promise<void> {
  if (!config.locks) return
  delete config.locks[name]
  await saveConfig(config)
}

/**
 * Check if a package has a newer version than its locked SHA.
 */
export async function isLockedBehind(
  $: Shell,
  config: NeoConfig,
  name: string,
): Promise<{ behind: boolean; lockedSha: string; currentSha: string } | null> {
  const lock = config.locks?.[name]
  if (!lock) return null

  const reg = config.registries.find((r) => r.name === lock.registry)
  if (!reg) return null

  const cacheDir = registryCacheDir(config, reg.name)
  const currentSha = await getHeadSha($, cacheDir)
  if (!currentSha) return null

  return {
    behind: currentSha !== lock.sha,
    lockedSha: lock.sha,
    currentSha,
  }
}

async function getHeadSha($: Shell, cacheDir: string): Promise<string | null> {
  try {
    const result = await $`git -C ${cacheDir} rev-parse HEAD`.quiet()
    return result.text().trim() || null
  } catch {
    return null
  }
}
