import { stat } from "node:fs/promises"
import { join } from "node:path"
import type { Shell } from "../types.js"

/**
 * Shallow-clone a git repository into the given cache directory.
 */
export async function cloneRegistry(
  $: Shell,
  url: string,
  cacheDir: string,
  branch: string,
): Promise<void> {
  try {
    await $`git clone --depth 1 --single-branch --branch ${branch} ${url} ${cacheDir}`.quiet()
  } catch (err: any) {
    const stderr = err?.stderr?.toString?.() ?? String(err)
    if (stderr.includes("Authentication failed") || stderr.includes("could not read Username")) {
      throw new Error(
        `Authentication failed for ${url}. Ensure your git credentials (SSH key or credential helper) are configured.`,
      )
    }
    if (stderr.includes("not found") || stderr.includes("does not appear to be a git repository")) {
      throw new Error(`Repository not found: ${url}`)
    }
    throw new Error(`Failed to clone ${url}: ${stderr}`)
  }
}

/**
 * Fetch the latest changes for a shallow-cloned registry.
 */
export async function refreshRegistry($: Shell, cacheDir: string): Promise<void> {
  try {
    await $`git -C ${cacheDir} fetch --depth 1 origin`.quiet()
    await $`git -C ${cacheDir} reset --hard origin/HEAD`.quiet()
  } catch (err: any) {
    const stderr = err?.stderr?.toString?.() ?? String(err)
    throw new Error(`Failed to refresh registry at ${cacheDir}: ${stderr}`)
  }
}

/**
 * Check if a directory is a git repository.
 */
export async function isGitRepo(cacheDir: string): Promise<boolean> {
  try {
    const s = await stat(join(cacheDir, ".git"))
    return s.isDirectory()
  } catch {
    return false
  }
}

/**
 * Get the last time a git fetch was performed by checking FETCH_HEAD mtime.
 * Returns null if no fetch has been recorded.
 */
export async function getLastFetchTime(cacheDir: string): Promise<Date | null> {
  try {
    // FETCH_HEAD is updated on every fetch
    const s = await stat(join(cacheDir, ".git", "FETCH_HEAD"))
    return s.mtime
  } catch {
    // Fall back to HEAD if FETCH_HEAD doesn't exist (fresh clone)
    try {
      const s = await stat(join(cacheDir, ".git", "HEAD"))
      return s.mtime
    } catch {
      return null
    }
  }
}
