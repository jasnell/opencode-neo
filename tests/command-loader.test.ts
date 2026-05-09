import { describe, it, expect, vi } from "vitest"

// We need to test the internal parsing/substitution functions.
// They're not exported, so we test through loadCommand which calls them.
// Mock the dependencies to isolate the logic.

vi.mock("../src/registry/resolver.js", () => ({
  resolvePackage: vi.fn(),
}))

vi.mock("../src/registry/cache.js", () => ({
  readCachedFile: vi.fn(),
}))

import { loadCommand } from "../src/loader/command.js"
import { resolvePackage } from "../src/registry/resolver.js"
import { readCachedFile } from "../src/registry/cache.js"
import type { NeoConfig } from "../src/types.js"

const mockResolve = vi.mocked(resolvePackage)
const mockRead = vi.mocked(readCachedFile)

const config: NeoConfig = {
  registries: [{ name: "test", url: "", branch: "main", enabled: true }],
  cache: { ttl: 3600, dir: "/cache" },
  installed: {},
}

describe("loadCommand", () => {
  it("substitutes $ARGUMENTS", async () => {
    mockResolve.mockResolvedValue({
      name: "greet",
      registry: "test",
      entry: { type: "command", description: "Greet", version: "1.0.0", path: "commands/greet" },
      cacheDir: "/cache/test",
    })
    mockRead.mockResolvedValue(`---
description: Greet someone
---

Say hello to $ARGUMENTS.
`)

    const result = await loadCommand(config, "greet", "Alice")
    expect(result).toContain("Say hello to Alice.")
  })

  it("substitutes positional arguments $1, $2", async () => {
    mockResolve.mockResolvedValue({
      name: "create-file",
      registry: "test",
      entry: { type: "command", description: "Create file", version: "1.0.0", path: "commands/create-file" },
      cacheDir: "/cache/test",
    })
    mockRead.mockResolvedValue(`---
description: Create a file
---

Create $1 in directory $2.
`)

    const result = await loadCommand(config, "create-file", "config.json src")
    expect(result).toContain("Create config.json in directory src.")
  })

  it("handles quoted arguments", async () => {
    mockResolve.mockResolvedValue({
      name: "test-cmd",
      registry: "test",
      entry: { type: "command", description: "Test", version: "1.0.0", path: "commands/test-cmd" },
      cacheDir: "/cache/test",
    })
    mockRead.mockResolvedValue(`---
description: Test
---

First: $1, Second: $2
`)

    const result = await loadCommand(config, "test-cmd", '"hello world" simple')
    expect(result).toContain("First: hello world, Second: simple")
  })

  it("does not interpret $ replacement patterns in arguments", async () => {
    // Regression test for #24
    mockResolve.mockResolvedValue({
      name: "test-cmd",
      registry: "test",
      entry: { type: "command", description: "Test", version: "1.0.0", path: "commands/test-cmd" },
      cacheDir: "/cache/test",
    })
    mockRead.mockResolvedValue(`---
description: Test
---

Echo: $ARGUMENTS
`)

    const result = await loadCommand(config, "test-cmd", "price is $100")
    expect(result).toContain("Echo: price is $100")
  })

  it("returns error for non-command package", async () => {
    mockResolve.mockResolvedValue({
      name: "my-skill",
      registry: "test",
      entry: { type: "skill", description: "A skill", version: "1.0.0", path: "skills/my-skill" },
      cacheDir: "/cache/test",
    })

    const result = await loadCommand(config, "my-skill", "")
    expect(result).toContain("is a skill, not a command")
  })

  it("returns error for unknown package", async () => {
    mockResolve.mockResolvedValue(null)
    const result = await loadCommand(config, "nonexistent", "")
    expect(result).toContain("not found")
  })
})
