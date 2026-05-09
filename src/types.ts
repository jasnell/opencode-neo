import type { PluginInput } from "@opencode-ai/plugin"

// ---------------------------------------------------------------------------
// Package types
// ---------------------------------------------------------------------------

export type PackageType = "skill" | "tool" | "command" | "agent" | "mcp"

/** A single entry in a registry's registry.json */
export interface PackageEntry {
  type: PackageType
  description: string
  version: string
  /** Path relative to the registry repo root */
  path: string
  tags?: string[]
  /** npm dependencies the tool requires (informational) */
  dependencies?: string[]
  /** Neo packages this package requires (cross-package deps) */
  requires?: string[]
  /** Minimum opencode version required */
  compatibility?: string
}

/** A named bundle of packages that install together */
export interface BundleEntry {
  description: string
  /** Package names included in this bundle */
  packages: string[]
}

// ---------------------------------------------------------------------------
// Registry federation
// ---------------------------------------------------------------------------

export type LinkRelationship =
  /** This registry recommends also using the linked registry */
  | "recommends"
  /** This registry extends or builds on top of the linked registry */
  | "extends"
  /** Packages in this registry may depend on packages from the linked registry */
  | "requires"

/** A link from one registry to another (federation) */
export interface RegistryLink {
  /** Short identifier for the linked registry */
  name: string
  /** Git URL of the linked registry */
  url: string
  /** How this registry relates to the linked one */
  relationship: LinkRelationship
  /** Human-readable reason for the link */
  description?: string
  /** Git branch (defaults to "main" if omitted) */
  branch?: string
}

/** The top-level registry.json structure */
export interface RegistryIndex {
  name: string
  description?: string
  /** Links to related registries (federation) */
  links?: RegistryLink[]
  /** Named bundles of packages */
  bundles?: Record<string, BundleEntry>
  packages: Record<string, PackageEntry>
}

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export type RegistryType = "git" | "local"

export interface RegistryConfig {
  name: string
  /** Git URL or local filesystem path */
  url: string
  branch: string
  enabled: boolean
  /** Registry source type. Defaults to "git" if omitted. */
  type?: RegistryType
  /** Whether this registry was auto-discovered (e.g. project registry) */
  auto?: boolean
}

export interface InstalledPackage {
  registry: string
  type: PackageType
  version: string
  scope: "global" | "project"
  installedAt: string
}

/** A locked package version (pinned to a git SHA) */
export interface LockedPackage {
  registry: string
  version: string
  sha: string
  lockedAt: string
}

/** A named profile -- a set of packages to activate together */
export interface Profile {
  description?: string
  packages: string[]
}

export interface CacheConfig {
  /** Cache staleness TTL in seconds (default 3600) */
  ttl: number
  /** Cache directory (default ~/.cache/opencode/neo) */
  dir: string
}

export interface NeoConfig {
  registries: RegistryConfig[]
  cache: CacheConfig
  installed: Record<string, InstalledPackage>
  /** Pinned package versions */
  locks?: Record<string, LockedPackage>
  /** Named profiles */
  profiles?: Record<string, Profile>
  /** Currently active profile (if any) */
  activeProfile?: string
}

// ---------------------------------------------------------------------------
// Search / resolve result types
// ---------------------------------------------------------------------------

export interface SearchResult {
  name: string
  type: PackageType
  description: string
  version: string
  registry: string
  tags: string[]
}

export interface ResolvedPackage {
  name: string
  registry: string
  entry: PackageEntry
  cacheDir: string
}

// ---------------------------------------------------------------------------
// Shell type -- extracted from PluginInput["$"]
// ---------------------------------------------------------------------------

export type Shell = PluginInput["$"]
