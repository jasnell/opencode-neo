import { describe, it, expect, vi, beforeEach } from "vitest"
import { searchPackages, resolvePackage } from "../src/registry/resolver.js"
import type { NeoConfig, RegistryIndex } from "../src/types.js"

// Mock the registry index loading
vi.mock("../src/registry/cache.js", () => ({
  registryCacheDir: (config: any, name: string) => `/cache/${name}`,
}))

vi.mock("../src/registry/manager.js", () => ({
  loadRegistryIndex: vi.fn(),
}))

import { loadRegistryIndex } from "../src/registry/manager.js"
const mockLoadIndex = vi.mocked(loadRegistryIndex)

function makeConfig(registries: Array<{ name: string }>): NeoConfig {
  return {
    registries: registries.map((r) => ({ name: r.name, url: "", branch: "main", enabled: true })),
    cache: { ttl: 3600, dir: "/cache" },
    installed: {},
  }
}

const testIndex: RegistryIndex = {
  name: "test-registry",
  packages: {
    "react-patterns": {
      type: "skill",
      description: "React component patterns and best practices",
      version: "1.0.0",
      path: "skills/react-patterns",
      tags: ["react", "frontend", "typescript"],
    },
    "db-query": {
      type: "tool",
      description: "Query PostgreSQL databases",
      version: "2.0.0",
      path: "tools/db-query",
      tags: ["database", "sql", "postgres"],
    },
    "deploy": {
      type: "command",
      description: "Deploy to production",
      version: "1.0.0",
      path: "commands/deploy",
      tags: ["deploy", "ci"],
    },
    "security-auditor": {
      type: "agent",
      description: "Reviews code for security vulnerabilities",
      version: "1.0.0",
      path: "agents/security-auditor",
      tags: ["security", "review"],
    },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadIndex.mockResolvedValue(testIndex)
})

describe("searchPackages", () => {
  it("finds packages by exact name match", async () => {
    const config = makeConfig([{ name: "test" }])
    const results = await searchPackages(config, "deploy")
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("deploy")
  })

  it("finds packages by partial name match", async () => {
    const config = makeConfig([{ name: "test" }])
    const results = await searchPackages(config, "react")
    expect(results.some((r) => r.name === "react-patterns")).toBe(true)
  })

  it("finds packages by description match", async () => {
    const config = makeConfig([{ name: "test" }])
    const results = await searchPackages(config, "PostgreSQL")
    expect(results.some((r) => r.name === "db-query")).toBe(true)
  })

  it("finds packages by tag match", async () => {
    const config = makeConfig([{ name: "test" }])
    const results = await searchPackages(config, "frontend")
    expect(results.some((r) => r.name === "react-patterns")).toBe(true)
  })

  it("filters by type", async () => {
    const config = makeConfig([{ name: "test" }])
    const results = await searchPackages(config, "deploy", "command")
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("command")
  })

  it("filters agents by type", async () => {
    const config = makeConfig([{ name: "test" }])
    const results = await searchPackages(config, "security", "agent")
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe("security-auditor")
  })

  it("returns empty for no match", async () => {
    const config = makeConfig([{ name: "test" }])
    const results = await searchPackages(config, "nonexistent-xyz")
    expect(results).toHaveLength(0)
  })

  it("ranks exact name match highest", async () => {
    const config = makeConfig([{ name: "test" }])
    const results = await searchPackages(config, "deploy")
    // "deploy" exact match should be first
    expect(results[0].name).toBe("deploy")
  })

  it("skips disabled registries", async () => {
    const config: NeoConfig = {
      registries: [{ name: "test", url: "", branch: "main", enabled: false }],
      cache: { ttl: 3600, dir: "/cache" },
      installed: {},
    }
    const results = await searchPackages(config, "react")
    expect(results).toHaveLength(0)
    expect(mockLoadIndex).not.toHaveBeenCalled()
  })
})

describe("resolvePackage", () => {
  it("resolves existing package", async () => {
    const config = makeConfig([{ name: "test" }])
    const result = await resolvePackage(config, "db-query")
    expect(result).not.toBeNull()
    expect(result!.name).toBe("db-query")
    expect(result!.registry).toBe("test")
    expect(result!.entry.type).toBe("tool")
  })

  it("returns null for unknown package", async () => {
    const config = makeConfig([{ name: "test" }])
    const result = await resolvePackage(config, "does-not-exist")
    expect(result).toBeNull()
  })

  it("uses first registry match when duplicates exist", async () => {
    const config = makeConfig([{ name: "first" }, { name: "second" }])

    const secondIndex: RegistryIndex = {
      name: "second",
      packages: {
        "db-query": { type: "tool", description: "Different version", version: "3.0.0", path: "tools/db-query" },
      },
    }

    mockLoadIndex
      .mockResolvedValueOnce(testIndex)  // first registry
      .mockResolvedValueOnce(secondIndex)  // second registry

    const result = await resolvePackage(config, "db-query")
    expect(result!.registry).toBe("first")
    expect(result!.entry.version).toBe("2.0.0")
  })
})
