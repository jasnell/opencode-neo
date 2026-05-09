import { describe, it, expect, vi } from "vitest"
import type { NeoConfig } from "../src/types.js"

// Mock external dependencies but use real filesystem for integration-style tests
vi.mock("../src/registry/resolver.js", () => ({
  resolvePackage: vi.fn(),
}))

vi.mock("../src/registry/cache.js", () => {
  const actual = vi.importActual("../src/registry/cache.js")
  return {
    ...actual,
    readCachedFile: vi.fn(),
  }
})

vi.mock("../src/config.js", () => ({
  saveConfig: vi.fn(),
  loadConfig: vi.fn(),
  resolveHome: (p: string) => p,
  configPath: () => "/tmp/neo.json",
  getConfigManager: () => null,
}))

import { installPackage } from "../src/packages/installer.js"
import { resolvePackage } from "../src/registry/resolver.js"
import { readCachedFile } from "../src/registry/cache.js"

const mockResolve = vi.mocked(resolvePackage)
const mockRead = vi.mocked(readCachedFile)

function makeConfig(): NeoConfig {
  return {
    registries: [{ name: "test", url: "", branch: "main", enabled: true }],
    cache: { ttl: 3600, dir: "/cache" },
    installed: {},
  }
}

describe("installPackage", () => {
  it("rejects invalid package names", async () => {
    const config = makeConfig()
    const result = await installPackage(config, "../evil-path", "global")
    expect(result).toContain("Invalid package name")
  })

  it("rejects package names with path separators", async () => {
    const config = makeConfig()
    const result = await installPackage(config, "foo/bar", "global")
    expect(result).toContain("Invalid package name")
  })

  it("reports already installed packages", async () => {
    const config = makeConfig()
    config.installed["existing-pkg"] = {
      registry: "test",
      type: "skill",
      version: "1.0.0",
      scope: "global",
      installedAt: "",
    }
    const result = await installPackage(config, "existing-pkg", "global")
    expect(result).toContain("already installed")
  })

  it("reports package not found", async () => {
    const config = makeConfig()
    mockResolve.mockResolvedValue(null)
    const result = await installPackage(config, "nonexistent", "global")
    expect(result).toContain("not found")
  })

  it("reports validation failure", async () => {
    const config = makeConfig()
    mockResolve.mockResolvedValue({
      name: "bad-skill",
      registry: "test",
      entry: { type: "skill", description: "Bad", version: "1.0.0", path: "skills/bad-skill" },
      cacheDir: "/cache/test",
    })
    // Return a SKILL.md with no frontmatter
    mockRead.mockResolvedValue("# Just a heading, no frontmatter")

    const result = await installPackage(config, "bad-skill", "global")
    expect(result).toContain("failed validation")
  })
})
