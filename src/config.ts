import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { readFile, writeFile, mkdir, stat } from "node:fs/promises"
import type { NeoConfig, RegistryConfig } from "./types.js"

const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "opencode")
const GLOBAL_CONFIG_FILE = join(GLOBAL_CONFIG_DIR, "neo.json")

function defaultConfig(): NeoConfig {
  return {
    registries: [],
    cache: {
      ttl: 3600,
      dir: join(homedir(), ".cache", "opencode", "neo"),
    },
    installed: {},
  }
}

/**
 * Resolve the project-level config path from a worktree.
 */
function projectConfigFile(worktree: string): string {
  return join(worktree, ".opencode", "neo.json")
}

/**
 * Read and parse a config file, returning null if it doesn't exist.
 */
async function readConfigFile(path: string): Promise<Partial<NeoConfig> | null> {
  try {
    const raw = await readFile(path, "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Write a config object to a file, creating directories as needed.
 */
async function writeConfigFile(path: string, config: Partial<NeoConfig>): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", "utf-8")
}

// ---------------------------------------------------------------------------
// ConfigManager -- manages global + project config with merge
// ---------------------------------------------------------------------------

/**
 * ConfigManager owns the merged config view and routes saves to
 * the correct file (global vs project) based on scope.
 *
 * Tools receive the merged NeoConfig and mutate it directly.
 * When they call saveConfig(), the manager splits the changes
 * back into the appropriate files.
 */
export class ConfigManager {
  private globalPath: string
  private projectPath: string | null
  private globalRaw: Partial<NeoConfig>
  private projectRaw: Partial<NeoConfig> | null

  /** The merged config -- this is what tools read and mutate. */
  readonly config: NeoConfig

  private constructor(
    globalPath: string,
    projectPath: string | null,
    globalRaw: Partial<NeoConfig>,
    projectRaw: Partial<NeoConfig> | null,
    merged: NeoConfig,
  ) {
    this.globalPath = globalPath
    this.projectPath = projectPath
    this.globalRaw = globalRaw
    this.projectRaw = projectRaw
    this.config = merged
  }

  /**
   * Load config from global and optionally project paths, merge them.
   * Also auto-discovers a project-local registry at .opencode/neo/registry.json.
   */
  static async load(worktree?: string): Promise<ConfigManager> {
    const globalPath = GLOBAL_CONFIG_FILE
    const projectPath = worktree ? projectConfigFile(worktree) : null

    const globalRaw = (await readConfigFile(globalPath)) ?? {}
    const projectRaw = projectPath ? await readConfigFile(projectPath) : null

    const defaults = defaultConfig()
    const merged = mergeConfigs(defaults, globalRaw, projectRaw)

    // Auto-discover a project-local registry
    if (worktree) {
      await discoverProjectRegistry(merged, worktree)
    }

    // Ensure the global config file exists
    if (!(await readConfigFile(globalPath))) {
      await writeConfigFile(globalPath, defaults)
    }

    return new ConfigManager(globalPath, projectPath, globalRaw, projectRaw, merged)
  }

  /**
   * Save the current config state. Splits changes into global vs project files.
   *
   * The routing logic:
   * - Registries: always saved to global (registries are shared)
   * - Cache config: always global
   * - Installed packages with scope "project": saved to project config
   * - Installed packages with scope "global": saved to global config
   * - Locks: follow installed package scope
   * - Profiles: saved to project config if one exists, else global
   * - activeProfile: saved to project config if one exists, else global
   */
  async save(): Promise<void> {
    const cfg = this.config

    // Partition installed packages and locks by scope
    const globalInstalled: typeof cfg.installed = {}
    const projectInstalled: typeof cfg.installed = {}
    for (const [name, pkg] of Object.entries(cfg.installed)) {
      if (pkg.scope === "project" && this.projectPath) {
        projectInstalled[name] = pkg
      } else {
        globalInstalled[name] = pkg
      }
    }

    const globalLocks: typeof cfg.locks = {}
    const projectLocks: typeof cfg.locks = {}
    if (cfg.locks) {
      for (const [name, lock] of Object.entries(cfg.locks)) {
        if (projectInstalled[name] && this.projectPath) {
          projectLocks[name] = lock
        } else {
          globalLocks[name] = lock
        }
      }
    }

    // Build global config to save
    const globalToSave: Partial<NeoConfig> = {
      registries: cfg.registries,
      cache: cfg.cache,
      installed: globalInstalled,
    }
    if (Object.keys(globalLocks).length > 0) {
      globalToSave.locks = globalLocks
    }
    // Profiles go to project config when one exists
    if (!this.projectPath) {
      if (cfg.profiles && Object.keys(cfg.profiles).length > 0) {
        globalToSave.profiles = cfg.profiles
      }
      if (cfg.activeProfile) {
        globalToSave.activeProfile = cfg.activeProfile
      }
    }

    await writeConfigFile(this.globalPath, globalToSave)

    // Build and save project config (if project context exists)
    if (this.projectPath) {
      const projectToSave: Partial<NeoConfig> = {}
      let hasProjectData = false

      if (Object.keys(projectInstalled).length > 0) {
        projectToSave.installed = projectInstalled
        hasProjectData = true
      }
      if (Object.keys(projectLocks).length > 0) {
        projectToSave.locks = projectLocks
        hasProjectData = true
      }
      if (cfg.profiles && Object.keys(cfg.profiles).length > 0) {
        projectToSave.profiles = cfg.profiles
        hasProjectData = true
      }
      if (cfg.activeProfile) {
        projectToSave.activeProfile = cfg.activeProfile
        hasProjectData = true
      }

      if (hasProjectData) {
        await writeConfigFile(this.projectPath, projectToSave)
      }
    }
  }

  /** Whether a project-level config exists. */
  get hasProjectConfig(): boolean {
    return this.projectRaw !== null
  }

  /** Path to the project config file (may not exist yet). */
  get projectConfigPath(): string | null {
    return this.projectPath
  }

  /** Path to the global config file. */
  get globalConfigPath(): string {
    return this.globalPath
  }
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

function mergeConfigs(
  defaults: NeoConfig,
  global: Partial<NeoConfig>,
  project: Partial<NeoConfig> | null,
): NeoConfig {
  // Start from global over defaults
  const merged: NeoConfig = {
    registries: global.registries ?? defaults.registries,
    cache: {
      ttl: global.cache?.ttl ?? defaults.cache.ttl,
      dir: resolveHome(global.cache?.dir ?? defaults.cache.dir),
    },
    installed: { ...(global.installed ?? {}) },
    locks: global.locks ? { ...global.locks } : undefined,
    profiles: global.profiles ? { ...global.profiles } : undefined,
    activeProfile: global.activeProfile,
  }

  // Layer project config on top
  if (project) {
    // Project-installed packages merge in
    if (project.installed) {
      Object.assign(merged.installed, project.installed)
    }

    // Project locks merge in
    if (project.locks) {
      if (!merged.locks) merged.locks = {}
      Object.assign(merged.locks, project.locks)
    }

    // Project profiles override global ones with same name
    if (project.profiles) {
      if (!merged.profiles) merged.profiles = {}
      Object.assign(merged.profiles, project.profiles)
    }

    // Project active profile takes precedence
    if (project.activeProfile !== undefined) {
      merged.activeProfile = project.activeProfile
    }
  }

  return merged
}

// ---------------------------------------------------------------------------
// Auto-discovery
// ---------------------------------------------------------------------------

/**
 * The project registry directory relative to the worktree.
 * If .opencode/neo/registry.json exists, it's auto-injected as a local registry.
 */
const PROJECT_REGISTRY_DIR = join(".opencode", "neo")
const PROJECT_REGISTRY_NAME = "project"

/**
 * Check for a project-local registry at <worktree>/.opencode/neo/registry.json
 * and inject it into the config as an auto-discovered local registry.
 */
async function discoverProjectRegistry(config: NeoConfig, worktree: string): Promise<void> {
  const registryDir = join(worktree, PROJECT_REGISTRY_DIR)
  const registryFile = join(registryDir, "registry.json")

  try {
    const s = await stat(registryFile)
    if (!s.isFile()) return
  } catch {
    return // Doesn't exist, no project registry
  }

  // Don't add if a registry with this name already exists
  if (config.registries.some((r) => r.name === PROJECT_REGISTRY_NAME)) return

  // Verify it's valid JSON
  try {
    const raw = await readFile(registryFile, "utf-8")
    JSON.parse(raw)
  } catch {
    return // Malformed, skip silently
  }

  const entry: RegistryConfig = {
    name: PROJECT_REGISTRY_NAME,
    url: registryDir,
    branch: "main",
    enabled: true,
    type: "local",
    auto: true,
  }

  // Insert at the front so project packages take priority
  config.registries.unshift(entry)
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

// The active ConfigManager instance. Set by loadConfig(), used by
// saveConfig() and getConfigManager(). There is exactly one per plugin
// lifetime since Neo is loaded once per OpenCode session.
let _manager: ConfigManager | null = null

/**
 * Load the merged config. Call this once at plugin startup.
 */
export async function loadConfig(worktree?: string): Promise<NeoConfig> {
  _manager = await ConfigManager.load(worktree)
  return _manager.config
}

/**
 * Save the current config state, routing changes to the correct files.
 * Throws if called before loadConfig() or with an unrecognized config object.
 */
export async function saveConfig(config: NeoConfig): Promise<void> {
  if (!_manager) {
    throw new Error("saveConfig called before loadConfig")
  }
  if (_manager.config !== config) {
    throw new Error(
      "saveConfig called with a config object that doesn't match the loaded config. " +
        "This is a bug -- all tools should mutate the shared config from loadConfig().",
    )
  }
  await _manager.save()
}

/**
 * Get the current ConfigManager (available after loadConfig).
 */
export function getConfigManager(): ConfigManager | null {
  return _manager
}

/**
 * Resolve ~ to the user's home directory.
 */
export function resolveHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(1))
  }
  return p
}

export function configPath(): string {
  return GLOBAL_CONFIG_FILE
}
