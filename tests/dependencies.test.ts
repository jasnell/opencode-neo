import { describe, it, expect, vi, beforeEach } from "vitest"
import { checkDependencies, formatDependencyCheck } from "../src/packages/dependencies.js"
import type { NeoConfig } from "../src/types.js"

vi.mock("../src/registry/resolver.js", () => ({
  resolvePackage: vi.fn(),
}))

import { resolvePackage } from "../src/registry/resolver.js"
const mockResolve = vi.mocked(resolvePackage)

function makeConfig(installed: Record<string, any> = {}): NeoConfig {
  return {
    registries: [{ name: "test", url: "", branch: "main", enabled: true }],
    cache: { ttl: 3600, dir: "/cache" },
    installed,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("checkDependencies", () => {
  it("marks installed packages as satisfied", async () => {
    const config = makeConfig({
      "dep-a": { registry: "test", type: "skill", version: "1.0.0", scope: "global", installedAt: "" },
    })
    mockResolve.mockResolvedValue(null)

    const result = await checkDependencies(config, ["dep-a"])
    expect(result.satisfied).toEqual(["dep-a"])
    expect(result.available).toEqual([])
    expect(result.missing).toEqual([])
  })

  it("marks available-but-not-installed as available", async () => {
    const config = makeConfig({})
    mockResolve.mockResolvedValue({
      name: "dep-a",
      registry: "test",
      entry: { type: "skill", description: "", version: "1.0.0", path: "" },
      cacheDir: "/cache/test",
    })

    const result = await checkDependencies(config, ["dep-a"])
    expect(result.satisfied).toEqual([])
    expect(result.available).toEqual(["dep-a"])
    expect(result.missing).toEqual([])
  })

  it("marks unfindable packages as missing", async () => {
    const config = makeConfig({})
    mockResolve.mockResolvedValue(null)

    const result = await checkDependencies(config, ["dep-a"])
    expect(result.satisfied).toEqual([])
    expect(result.available).toEqual([])
    expect(result.missing).toEqual(["dep-a"])
  })

  it("handles a mix of satisfied, available, and missing", async () => {
    const config = makeConfig({
      "installed-pkg": { registry: "test", type: "skill", version: "1.0.0", scope: "global", installedAt: "" },
    })

    mockResolve.mockImplementation(async (_config, name) => {
      if (name === "available-pkg") {
        return {
          name: "available-pkg",
          registry: "test",
          entry: { type: "skill", description: "", version: "1.0.0", path: "" },
          cacheDir: "",
        }
      }
      return null
    })

    const result = await checkDependencies(config, [
      "installed-pkg",
      "available-pkg",
      "missing-pkg",
    ])
    expect(result.satisfied).toEqual(["installed-pkg"])
    expect(result.available).toEqual(["available-pkg"])
    expect(result.missing).toEqual(["missing-pkg"])
  })
})

describe("formatDependencyCheck", () => {
  it("returns null when all dependencies are satisfied", () => {
    const result = formatDependencyCheck("my-pkg", {
      satisfied: ["dep-a"],
      available: [],
      missing: [],
    })
    expect(result).toBeNull()
  })

  it("warns about missing dependencies", () => {
    const result = formatDependencyCheck("my-pkg", {
      satisfied: [],
      available: [],
      missing: ["dep-x"],
    })
    expect(result).toContain("my-pkg")
    expect(result).toContain("dep-x")
    expect(result).toContain("cannot be found")
  })

  it("warns about available but not installed dependencies", () => {
    const result = formatDependencyCheck("my-pkg", {
      satisfied: [],
      available: ["dep-y"],
      missing: [],
    })
    expect(result).toContain("dep-y")
    expect(result).toContain("not installed")
  })
})
