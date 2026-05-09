import { describe, it, expect } from "vitest"
import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { validateSkill, validateTool, validateCommand, validateAgent } from "../src/packages/validator.js"
import type { RegistryIndex } from "../src/types.js"

const REGISTRY_DIR = join(__dirname, "..", "samples", "registry")

describe("sample registry", () => {
  let index: RegistryIndex

  it("has a valid registry.json", async () => {
    const raw = await readFile(join(REGISTRY_DIR, "registry.json"), "utf-8")
    index = JSON.parse(raw)
    expect(index.name).toBe("neo-samples")
    expect(index.packages).toBeDefined()
    expect(Object.keys(index.packages).length).toBe(4)
  })

  it("declares all four package types", async () => {
    const raw = await readFile(join(REGISTRY_DIR, "registry.json"), "utf-8")
    index = JSON.parse(raw)
    const types = new Set(Object.values(index.packages).map((p) => p.type))
    expect(types).toContain("skill")
    expect(types).toContain("tool")
    expect(types).toContain("command")
    expect(types).toContain("agent")
  })

  it("has a bundle referencing valid packages", async () => {
    const raw = await readFile(join(REGISTRY_DIR, "registry.json"), "utf-8")
    index = JSON.parse(raw)
    expect(index.bundles).toBeDefined()
    const bundle = index.bundles!["lorem-all"]
    expect(bundle).toBeDefined()
    for (const pkg of bundle.packages) {
      expect(index.packages[pkg]).toBeDefined()
    }
  })

  it("has federation links", async () => {
    const raw = await readFile(join(REGISTRY_DIR, "registry.json"), "utf-8")
    index = JSON.parse(raw)
    expect(index.links).toBeDefined()
    expect(index.links!.length).toBeGreaterThan(0)
    expect(index.links![0].relationship).toBe("recommends")
  })

  it("has valid lorem-ipsum skill", async () => {
    const content = await readFile(join(REGISTRY_DIR, "skills/lorem-ipsum/SKILL.md"), "utf-8")
    const result = validateSkill(content)
    expect(result).toEqual({ valid: true })
  })

  it("has valid lorem-generate tool", async () => {
    const content = await readFile(join(REGISTRY_DIR, "tools/lorem-generate/tool.ts"), "utf-8")
    const result = validateTool(content)
    expect(result).toEqual({ valid: true })
  })

  it("has valid lorem command", async () => {
    const content = await readFile(join(REGISTRY_DIR, "commands/lorem/command.md"), "utf-8")
    const result = validateCommand(content)
    expect(result).toEqual({ valid: true })
  })

  it("has valid lorem-writer agent", async () => {
    const content = await readFile(join(REGISTRY_DIR, "agents/lorem-writer/agent.md"), "utf-8")
    const result = validateAgent(content)
    expect(result).toEqual({ valid: true })
  })

  it("all declared package paths exist on disk", async () => {
    const raw = await readFile(join(REGISTRY_DIR, "registry.json"), "utf-8")
    index = JSON.parse(raw)
    for (const [name, entry] of Object.entries(index.packages)) {
      const pkgDir = join(REGISTRY_DIR, entry.path)
      const s = await stat(pkgDir)
      expect(s.isDirectory(), `${name}: ${entry.path} should be a directory`).toBe(true)
    }
  })

  it("no package is missing required fields", async () => {
    const raw = await readFile(join(REGISTRY_DIR, "registry.json"), "utf-8")
    index = JSON.parse(raw)
    for (const [name, entry] of Object.entries(index.packages)) {
      expect(entry.type, `${name} missing type`).toBeDefined()
      expect(entry.description, `${name} missing description`).toBeTruthy()
      expect(entry.version, `${name} missing version`).toBeTruthy()
      expect(entry.path, `${name} missing path`).toBeTruthy()
    }
  })
})
