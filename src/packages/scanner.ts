/**
 * Static security scanner for tool source code.
 *
 * Performs pattern-based analysis to identify potential security concerns
 * before the agent asks the user for permission to install or execute.
 * Not a substitute for human review, but catches common red flags.
 */

export type Severity = "critical" | "warning" | "info"

export interface Finding {
  severity: Severity
  category: string
  description: string
  /** The matched source fragment (trimmed) */
  match: string
  line: number
}

export interface ScanResult {
  findings: Finding[]
  summary: string
  riskLevel: "high" | "moderate" | "low" | "clean"
}

interface Rule {
  /** Pattern source string -- a fresh RegExp is created per scan to avoid shared state */
  pattern: string
  flags: string
  severity: Severity
  category: string
  description: string
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const rules: Rule[] = [
  // -- Critical: direct code execution from strings --
  { pattern: "\\beval\\s*\\(", flags: "g", severity: "critical", category: "dynamic-execution", description: "Uses eval() to execute arbitrary code from a string" },
  { pattern: "new\\s+Function\\s*\\(", flags: "g", severity: "critical", category: "dynamic-execution", description: "Constructs a function from a string (equivalent to eval)" },

  // -- Critical: process/shell execution --
  { pattern: "\\bchild_process\\b", flags: "g", severity: "critical", category: "process-spawn", description: "Imports child_process module for spawning system commands" },
  { pattern: "\\bexecSync\\s*\\(|\\bexec\\s*\\(|\\bspawnSync\\s*\\(|\\bspawn\\s*\\(", flags: "g", severity: "critical", category: "process-spawn", description: "Spawns a child process or executes a system command" },
  { pattern: "Bun\\s*\\.\\s*spawn\\s*\\(", flags: "g", severity: "critical", category: "process-spawn", description: "Uses Bun.spawn() to execute a system command" },
  { pattern: "\\$`[^`]*`", flags: "g", severity: "critical", category: "process-spawn", description: "Uses Bun shell template literal to execute a command" },

  // -- Warning: network access --
  { pattern: "\\bfetch\\s*\\(\\s*['\"`]", flags: "g", severity: "warning", category: "network-access", description: "Makes an HTTP request via fetch()" },
  { pattern: "\\baxios\\b|\\bnode-fetch\\b|\\bgot\\b|\\bundici\\b", flags: "g", severity: "warning", category: "network-access", description: "Imports an HTTP client library" },
  { pattern: "require\\s*\\(\\s*['\"]https?['\"]|from\\s+['\"]https?['\"]", flags: "g", severity: "warning", category: "network-access", description: "Imports the Node.js http/https module" },
  { pattern: "new\\s+WebSocket\\s*\\(", flags: "g", severity: "warning", category: "network-access", description: "Opens a WebSocket connection" },

  // -- Warning: filesystem access --
  { pattern: "\\bfs\\b\\.|\\breadFileSync\\b|\\bwriteFileSync\\b|\\breadFile\\b|\\bwriteFile\\b", flags: "g", severity: "warning", category: "filesystem-access", description: "Accesses the filesystem directly" },
  { pattern: "Bun\\s*\\.\\s*file\\s*\\(|Bun\\s*\\.\\s*write\\s*\\(", flags: "g", severity: "warning", category: "filesystem-access", description: "Uses Bun file APIs for filesystem access" },
  { pattern: "\\.\\.\\/\\.\\.\\//|\\/etc\\/|\\/usr\\/|\\/var\\/|\\/tmp\\/|\\/root\\/", flags: "g", severity: "warning", category: "path-traversal", description: "References paths outside the expected working directory" },

  // -- Warning: environment variable access --
  { pattern: "process\\s*\\.\\s*env\\b", flags: "g", severity: "warning", category: "env-access", description: "Reads environment variables (may access secrets)" },
  { pattern: "Bun\\s*\\.\\s*env\\b", flags: "g", severity: "warning", category: "env-access", description: "Reads Bun environment variables (may access secrets)" },

  // -- Warning: dynamic imports --
  { pattern: "import\\s*\\(\\s*[^'\"]", flags: "g", severity: "warning", category: "dynamic-import", description: "Uses dynamic import with a non-literal specifier (could load arbitrary modules)" },
  { pattern: "require\\s*\\(\\s*[^'\"]", flags: "g", severity: "warning", category: "dynamic-import", description: "Uses require() with a non-literal specifier" },

  // -- Warning: credential/secret patterns --
  { pattern: "['\"](?:api[_-]?key|secret|token|password|auth|credential|private[_-]?key)['\"]s*:", flags: "gi", severity: "warning", category: "hardcoded-secret", description: "May contain hardcoded credentials or secret references" },

  // -- Warning: obfuscation indicators --
  { pattern: "atob\\s*\\(|btoa\\s*\\(|Buffer\\s*\\.\\s*from\\s*\\([^)]*,\\s*['\"]base64['\"]", flags: "g", severity: "warning", category: "obfuscation", description: "Uses base64 encoding/decoding (may hide malicious content)" },
  { pattern: "\\\\x[0-9a-f]{2}(?:\\\\x[0-9a-f]{2}){3,}", flags: "gi", severity: "warning", category: "obfuscation", description: "Contains hex-escaped string sequences (may hide content)" },

  // -- Info: broad capabilities --
  { pattern: "\\bprocess\\s*\\.\\s*exit\\s*\\(", flags: "g", severity: "info", category: "process-control", description: "Calls process.exit() which could terminate the host process" },
  { pattern: "\\bglobalThis\\b|\\bglobal\\b\\.", flags: "g", severity: "info", category: "global-mutation", description: "Accesses or mutates the global scope" },
]

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Scan tool source code for security concerns.
 *
 * Returns structured findings the agent can present to the user
 * when requesting permission to install or execute the tool.
 */
export function scanToolSource(source: string): ScanResult {
  const lines = source.split("\n")
  const findings: Finding[] = []
  const seen = new Set<string>()

  for (const rule of rules) {
    // Create a fresh RegExp per scan to avoid shared global state (#12)
    const re = new RegExp(rule.pattern, rule.flags)
    let match: RegExpExecArray | null

    while ((match = re.exec(source)) !== null) {
      // Find which line this match is on
      const beforeMatch = source.slice(0, match.index)
      const lineNum = beforeMatch.split("\n").length

      // Get the matched line content (trimmed)
      const lineContent = lines[lineNum - 1]?.trim() ?? match[0]

      // Deduplicate: same category + same line
      const key = `${rule.category}:${lineNum}`
      if (seen.has(key)) continue
      seen.add(key)

      // Skip matches that appear inside comments
      if (isInComment(lineContent)) continue

      findings.push({
        severity: rule.severity,
        category: rule.category,
        description: rule.description,
        match: lineContent.length > 120 ? lineContent.slice(0, 120) + "..." : lineContent,
        line: lineNum,
      })
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  const riskLevel = determineRiskLevel(findings)
  const summary = buildSummary(findings, riskLevel)

  return { findings, summary, riskLevel }
}

/**
 * Format scan results into a human-readable report for the agent
 * to include in the permission request.
 */
export function formatScanReport(result: ScanResult): string {
  const header = `Security scan: ${result.riskLevel.toUpperCase()} risk`

  if (result.findings.length === 0) {
    return [
      header,
      "",
      "No security concerns detected. The tool does not appear to use",
      "dangerous APIs (network, filesystem, process spawning, eval, etc.).",
    ].join("\n")
  }

  const sections: string[] = [header, ""]

  const critical = result.findings.filter((f) => f.severity === "critical")
  const warnings = result.findings.filter((f) => f.severity === "warning")
  const infos = result.findings.filter((f) => f.severity === "info")

  if (critical.length > 0) {
    sections.push(`CRITICAL (${critical.length}):`)
    for (const f of critical) {
      sections.push(`  [line ${f.line}] ${f.description}`)
      sections.push(`    > ${f.match}`)
    }
    sections.push("")
  }

  if (warnings.length > 0) {
    sections.push(`WARNINGS (${warnings.length}):`)
    for (const f of warnings) {
      sections.push(`  [line ${f.line}] ${f.description}`)
      sections.push(`    > ${f.match}`)
    }
    sections.push("")
  }

  if (infos.length > 0) {
    sections.push(`INFO (${infos.length}):`)
    for (const f of infos) {
      sections.push(`  [line ${f.line}] ${f.description}`)
      sections.push(`    > ${f.match}`)
    }
    sections.push("")
  }

  sections.push(result.summary)

  return sections.join("\n")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInComment(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")
}

function determineRiskLevel(findings: Finding[]): ScanResult["riskLevel"] {
  const hasCritical = findings.some((f) => f.severity === "critical")
  const warningCount = findings.filter((f) => f.severity === "warning").length

  if (hasCritical) return "high"
  if (warningCount >= 3) return "moderate"
  if (warningCount > 0) return "low"
  return "clean"
}

function buildSummary(findings: Finding[], riskLevel: ScanResult["riskLevel"]): string {
  const categories = [...new Set(findings.map((f) => f.category))]

  switch (riskLevel) {
    case "high":
      return (
        "HIGH RISK: This tool uses dangerous APIs (" +
        categories.join(", ") +
        "). Review the source carefully before approving."
      )
    case "moderate":
      return (
        "MODERATE RISK: This tool accesses several sensitive APIs (" +
        categories.join(", ") +
        "). Verify that each use is expected for the tool's purpose."
      )
    case "low":
      return (
        "LOW RISK: Minor concerns detected (" +
        categories.join(", ") +
        "). These may be expected for the tool's functionality."
      )
    case "clean":
      return "CLEAN: No security concerns detected."
  }
}
