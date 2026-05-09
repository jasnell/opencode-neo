export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate a SKILL.md file has the required frontmatter.
 */
export function validateSkill(content: string): ValidationResult {
  if (!content.trim()) {
    return { valid: false, error: "SKILL.md is empty" }
  }

  // Check for YAML frontmatter delimiters
  if (!content.startsWith("---")) {
    return { valid: false, error: "SKILL.md must start with YAML frontmatter (---)" }
  }

  const endIdx = content.indexOf("---", 3)
  if (endIdx === -1) {
    return { valid: false, error: "SKILL.md frontmatter is not closed (missing closing ---)" }
  }

  const frontmatter = content.slice(3, endIdx)

  // Check for required fields (simple line-based check, not a full YAML parser)
  if (!frontmatter.match(/^name\s*:/m)) {
    return { valid: false, error: "SKILL.md frontmatter is missing required 'name' field" }
  }
  if (!frontmatter.match(/^description\s*:/m)) {
    return { valid: false, error: "SKILL.md frontmatter is missing required 'description' field" }
  }

  return { valid: true }
}

/**
 * Validate a tool.ts file has basic expected structure.
 */
export function validateTool(content: string): ValidationResult {
  if (!content.trim()) {
    return { valid: false, error: "tool.ts is empty" }
  }

  // Check for an export (default or named)
  const hasExport = content.includes("export default") || content.includes("export const") || content.includes("export function")
  if (!hasExport) {
    return { valid: false, error: "tool.ts must have at least one export" }
  }

  return { valid: true }
}

/**
 * Validate a command.md file has the expected structure.
 */
export function validateCommand(content: string): ValidationResult {
  if (!content.trim()) {
    return { valid: false, error: "command.md is empty" }
  }

  // Commands should have frontmatter with at least a description
  if (!content.startsWith("---")) {
    return { valid: false, error: "command.md must start with YAML frontmatter (---)" }
  }

  const endIdx = content.indexOf("---", 3)
  if (endIdx === -1) {
    return { valid: false, error: "command.md frontmatter is not closed (missing closing ---)" }
  }

  const frontmatter = content.slice(3, endIdx)

  if (!frontmatter.match(/^description\s*:/m)) {
    return { valid: false, error: "command.md frontmatter is missing required 'description' field" }
  }

  return { valid: true }
}

/**
 * Validate an agent.md file has the required frontmatter.
 */
export function validateAgent(content: string): ValidationResult {
  if (!content.trim()) {
    return { valid: false, error: "agent.md is empty" }
  }

  if (!content.startsWith("---")) {
    return { valid: false, error: "agent.md must start with YAML frontmatter (---)" }
  }

  const endIdx = content.indexOf("---", 3)
  if (endIdx === -1) {
    return { valid: false, error: "agent.md frontmatter is not closed (missing closing ---)" }
  }

  const frontmatter = content.slice(3, endIdx)

  if (!frontmatter.match(/^description\s*:/m)) {
    return { valid: false, error: "agent.md frontmatter is missing required 'description' field" }
  }

  // Agents should declare a mode
  if (!frontmatter.match(/^mode\s*:/m)) {
    return { valid: false, error: "agent.md frontmatter is missing 'mode' field (primary or subagent)" }
  }

  return { valid: true }
}

/**
 * Validate an mcp.json file has the required fields.
 */
export function validateMcp(content: string): ValidationResult {
  if (!content.trim()) {
    return { valid: false, error: "mcp.json is empty" }
  }

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    return { valid: false, error: "mcp.json is not valid JSON" }
  }

  if (!parsed.type) {
    return { valid: false, error: "mcp.json is missing required 'type' field ('local' or 'remote')" }
  }

  if (parsed.type !== "local" && parsed.type !== "remote") {
    return { valid: false, error: `mcp.json has invalid type "${parsed.type}" (must be 'local' or 'remote')` }
  }

  if (parsed.type === "local" && (!parsed.command || !Array.isArray(parsed.command) || parsed.command.length === 0)) {
    return { valid: false, error: "Local MCP is missing required 'command' array" }
  }

  if (parsed.type === "remote" && !parsed.url) {
    return { valid: false, error: "Remote MCP is missing required 'url' field" }
  }

  return { valid: true }
}
