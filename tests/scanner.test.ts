import { describe, it, expect } from "vitest"
import { scanToolSource, formatScanReport } from "../src/packages/scanner.js"

describe("scanToolSource", () => {
  it("returns clean for safe tool source", () => {
    const source = `import { tool } from "@opencode-ai/plugin"
export default tool({
  description: "Add two numbers",
  args: {
    a: tool.schema.number(),
    b: tool.schema.number(),
  },
  async execute(args) {
    return String(args.a + args.b)
  },
})
`
    const result = scanToolSource(source)
    expect(result.riskLevel).toBe("clean")
    expect(result.findings).toHaveLength(0)
  })

  it("detects eval as critical", () => {
    const source = `export default { execute(args) { return eval(args.code) } }`
    const result = scanToolSource(source)
    expect(result.riskLevel).toBe("high")
    expect(result.findings.some((f) => f.severity === "critical")).toBe(true)
    expect(result.findings.some((f) => f.category === "dynamic-execution")).toBe(true)
  })

  it("detects new Function as critical", () => {
    const source = `export default { execute(args) { return new Function(args.code)() } }`
    const result = scanToolSource(source)
    expect(result.findings.some((f) => f.category === "dynamic-execution")).toBe(true)
  })

  it("detects child_process as critical", () => {
    const source = `import { exec } from "child_process"
export default { execute(args) { exec(args.cmd) } }`
    const result = scanToolSource(source)
    expect(result.riskLevel).toBe("high")
    expect(result.findings.some((f) => f.category === "process-spawn")).toBe(true)
  })

  it("detects fetch as warning", () => {
    const source = `export default { async execute() { return await fetch("https://evil.com") } }`
    const result = scanToolSource(source)
    expect(result.findings.some((f) => f.category === "network-access")).toBe(true)
  })

  it("detects filesystem access as warning", () => {
    const source = `import { readFile } from "fs/promises"
export default { async execute() { return await readFile("/etc/passwd", "utf-8") } }`
    const result = scanToolSource(source)
    expect(result.findings.some((f) => f.category === "filesystem-access")).toBe(true)
  })

  it("detects process.env access as warning", () => {
    const source = `export default { execute() { return process.env.SECRET_KEY } }`
    const result = scanToolSource(source)
    expect(result.findings.some((f) => f.category === "env-access")).toBe(true)
  })

  it("detects process.exit as info", () => {
    const source = `export default { execute() { process.exit(1) } }`
    const result = scanToolSource(source)
    expect(result.findings.some((f) => f.severity === "info")).toBe(true)
    expect(result.findings.some((f) => f.category === "process-control")).toBe(true)
  })

  it("skips matches inside single-line comments", () => {
    const source = `// eval("this is a comment")
export default { execute() { return "safe" } }`
    const result = scanToolSource(source)
    expect(result.findings.filter((f) => f.category === "dynamic-execution")).toHaveLength(0)
  })

  it("deduplicates same category on same line", () => {
    const source = `export default { execute() { exec("a"); exec("b") } }`
    const result = scanToolSource(source)
    // Both exec calls are on the same line -- should deduplicate
    const spawnFindings = result.findings.filter((f) => f.category === "process-spawn")
    expect(spawnFindings.length).toBe(1)
  })

  it("assigns correct risk levels", () => {
    // No findings = clean
    expect(scanToolSource(`export default { execute() { return "ok" } }`).riskLevel).toBe("clean")

    // One warning = low
    expect(
      scanToolSource(`export default { execute() { return process.env.FOO } }`).riskLevel,
    ).toBe("low")

    // Critical = high
    expect(
      scanToolSource(`export default { execute(a) { return eval(a.x) } }`).riskLevel,
    ).toBe("high")
  })

  it("reports correct line numbers", () => {
    const source = `line1
line2
export default { execute() { eval("x") } }
line4`
    const result = scanToolSource(source)
    const evalFinding = result.findings.find((f) => f.category === "dynamic-execution")
    expect(evalFinding?.line).toBe(3)
  })

  it("truncates long matched lines", () => {
    const longLine = `export default { execute() { eval("${"x".repeat(200)}") } }`
    const result = scanToolSource(longLine)
    const evalFinding = result.findings.find((f) => f.category === "dynamic-execution")
    expect(evalFinding?.match.length).toBeLessThanOrEqual(123) // 120 + "..."
  })
})

describe("formatScanReport", () => {
  it("formats a clean result", () => {
    const result = scanToolSource(`export default { execute() { return "ok" } }`)
    const report = formatScanReport(result)
    expect(report).toContain("CLEAN")
    expect(report).toContain("No security concerns detected")
  })

  it("formats findings with sections", () => {
    const source = `import { exec } from "child_process"
export default { execute(a) { return eval(a.x) } }`
    const result = scanToolSource(source)
    const report = formatScanReport(result)
    expect(report).toContain("CRITICAL")
    expect(report).toContain("HIGH risk")
  })
})
