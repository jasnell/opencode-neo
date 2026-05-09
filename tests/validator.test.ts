import { describe, it, expect } from "vitest"
import {
  validateSkill,
  validateTool,
  validateCommand,
  validateAgent,
  validateMcp,
} from "../src/packages/validator.js"

describe("validateSkill", () => {
  it("accepts valid SKILL.md with name and description", () => {
    const content = `---
name: my-skill
description: A test skill
---

# My Skill

Instructions here.
`
    expect(validateSkill(content)).toEqual({ valid: true })
  })

  it("rejects empty content", () => {
    expect(validateSkill("")).toEqual({ valid: false, error: "SKILL.md is empty" })
    expect(validateSkill("  \n  ")).toEqual({ valid: false, error: "SKILL.md is empty" })
  })

  it("rejects missing frontmatter", () => {
    const result = validateSkill("# Just a heading\n\nNo frontmatter.")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("must start with YAML frontmatter")
  })

  it("rejects unclosed frontmatter", () => {
    const result = validateSkill("---\nname: test\n# No closing delimiter")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("not closed")
  })

  it("rejects missing name field", () => {
    const result = validateSkill("---\ndescription: test\n---\nBody")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("missing required 'name'")
  })

  it("rejects missing description field", () => {
    const result = validateSkill("---\nname: test\n---\nBody")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("missing required 'description'")
  })
})

describe("validateTool", () => {
  it("accepts valid tool with default export", () => {
    const content = `import { tool } from "@opencode-ai/plugin"
export default tool({ description: "test", args: {}, async execute() { return "ok" } })
`
    expect(validateTool(content)).toEqual({ valid: true })
  })

  it("accepts valid tool with named export", () => {
    const content = `export const myTool = { execute() { return "ok" } }
`
    expect(validateTool(content)).toEqual({ valid: true })
  })

  it("accepts export function syntax", () => {
    const content = `export function execute() { return "ok" }
`
    expect(validateTool(content)).toEqual({ valid: true })
  })

  it("rejects empty content", () => {
    expect(validateTool("")).toEqual({ valid: false, error: "tool.ts is empty" })
  })

  it("rejects file without any export", () => {
    const result = validateTool("const x = 1;\nconsole.log(x);")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("must have at least one export")
  })
})

describe("validateCommand", () => {
  it("accepts valid command.md", () => {
    const content = `---
description: Run tests
---

Run the test suite with $ARGUMENTS.
`
    expect(validateCommand(content)).toEqual({ valid: true })
  })

  it("rejects empty content", () => {
    expect(validateCommand("")).toEqual({ valid: false, error: "command.md is empty" })
  })

  it("rejects missing frontmatter", () => {
    const result = validateCommand("Just a template without frontmatter.")
    expect(result.valid).toBe(false)
  })

  it("rejects missing description", () => {
    const result = validateCommand("---\ntemplate: test\n---\nBody")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("missing required 'description'")
  })
})

describe("validateAgent", () => {
  it("accepts valid agent.md with description and mode", () => {
    const content = `---
description: Code reviewer
mode: subagent
---

You are a code reviewer.
`
    expect(validateAgent(content)).toEqual({ valid: true })
  })

  it("rejects empty content", () => {
    expect(validateAgent("")).toEqual({ valid: false, error: "agent.md is empty" })
  })

  it("rejects missing description", () => {
    const result = validateAgent("---\nmode: subagent\n---\nPrompt")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("missing required 'description'")
  })

  it("rejects missing mode", () => {
    const result = validateAgent("---\ndescription: A reviewer\n---\nPrompt")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("missing 'mode'")
  })
})

describe("validateMcp", () => {
  it("accepts valid remote MCP", () => {
    const content = JSON.stringify({ type: "remote", url: "https://mcp.example.com/mcp", enabled: true })
    expect(validateMcp(content)).toEqual({ valid: true })
  })

  it("accepts valid local MCP", () => {
    const content = JSON.stringify({ type: "local", command: ["npx", "-y", "some-mcp"], enabled: true })
    expect(validateMcp(content)).toEqual({ valid: true })
  })

  it("rejects empty content", () => {
    expect(validateMcp("")).toEqual({ valid: false, error: "mcp.json is empty" })
  })

  it("rejects invalid JSON", () => {
    const result = validateMcp("not json")
    expect(result.valid).toBe(false)
    expect(result.error).toContain("not valid JSON")
  })

  it("rejects missing type field", () => {
    const result = validateMcp(JSON.stringify({ url: "https://example.com" }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain("missing required 'type'")
  })

  it("rejects invalid type value", () => {
    const result = validateMcp(JSON.stringify({ type: "invalid" }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain("invalid type")
  })

  it("rejects local MCP without command", () => {
    const result = validateMcp(JSON.stringify({ type: "local" }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain("missing required 'command'")
  })

  it("rejects remote MCP without url", () => {
    const result = validateMcp(JSON.stringify({ type: "remote" }))
    expect(result.valid).toBe(false)
    expect(result.error).toContain("missing required 'url'")
  })
})
