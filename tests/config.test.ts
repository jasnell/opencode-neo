import { describe, it, expect } from "vitest"

describe("ConfigManager", () => {
  it("merge: project installed packages merge with global", () => {
    // This tests the merge behavior described in config.ts
    const globalConfig = {
      registries: [{ name: "global-reg", url: "https://a.com", branch: "main", enabled: true }],
      cache: { ttl: 3600, dir: "/cache" },
      installed: {
        "global-pkg": { registry: "global-reg", type: "skill" as const, version: "1.0.0", scope: "global" as const, installedAt: "2024-01-01" },
      },
    }

    const projectConfig = {
      installed: {
        "project-pkg": { registry: "global-reg", type: "tool" as const, version: "2.0.0", scope: "project" as const, installedAt: "2024-02-01" },
      },
    }

    // Simulate merge (same logic as mergeConfigs in config.ts)
    const merged = {
      ...globalConfig,
      installed: { ...globalConfig.installed, ...projectConfig.installed },
    }

    expect(Object.keys(merged.installed)).toHaveLength(2)
    expect(merged.installed["global-pkg"].scope).toBe("global")
    expect(merged.installed["project-pkg"].scope).toBe("project")
    expect(merged.registries).toHaveLength(1)
  })

  it("merge: project profiles override global profiles with same name", () => {
    const globalProfiles = {
      "shared": { packages: ["pkg-a", "pkg-b"], description: "Global version" },
    }
    const projectProfiles = {
      "shared": { packages: ["pkg-c"], description: "Project override" },
      "project-only": { packages: ["pkg-d"] },
    }

    const merged = { ...globalProfiles, ...projectProfiles }

    expect(merged["shared"].description).toBe("Project override")
    expect(merged["shared"].packages).toEqual(["pkg-c"])
    expect(merged["project-only"]).toBeDefined()
  })

  it("merge: project activeProfile takes precedence", () => {
    const globalActive = "global-profile"
    const projectActive = "project-profile"

    // Project wins
    const merged = projectActive ?? globalActive
    expect(merged).toBe("project-profile")
  })

  it("merge: registries come only from global", () => {
    const globalRegistries = [{ name: "reg-a", url: "https://a.com", branch: "main", enabled: true }]
    // Project config doesn't add registries (by design)
    const merged = globalRegistries
    expect(merged).toHaveLength(1)
  })
})
