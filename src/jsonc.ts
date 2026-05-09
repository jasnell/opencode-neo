/**
 * JSONC (JSON with comments) parser and string manipulation utilities.
 *
 * Handles // line comments, block comments, and trailing commas.
 * Correctly preserves // inside string values (e.g., URLs like https://...).
 */

/**
 * Parse a JSONC string into an object.
 * Strips comments and trailing commas, then delegates to JSON.parse.
 */
export function parseJsonc(text: string): any {
  let result = ""
  let i = 0
  const len = text.length

  while (i < len) {
    // String literal -- copy verbatim
    if (text[i] === '"') {
      result += '"'
      i++
      while (i < len && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < len) {
          result += text[i] + text[i + 1]
          i += 2
        } else {
          result += text[i]
          i++
        }
      }
      if (i < len) { result += '"'; i++ }
      continue
    }

    // Single-line comment
    if (text[i] === '/' && i + 1 < len && text[i + 1] === '/') {
      while (i < len && text[i] !== '\n') i++
      continue
    }

    // Multi-line comment
    if (text[i] === '/' && i + 1 < len && text[i + 1] === '*') {
      i += 2
      while (i < len && !(text[i] === '*' && i + 1 < len && text[i + 1] === '/')) i++
      i += 2
      continue
    }

    result += text[i]
    i++
  }

  // Strip trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, "$1")
  return JSON.parse(result)
}

/**
 * Add a key-value pair to a JSON/JSONC object string.
 * Inserts after $schema if present, otherwise after the opening {.
 * Preserves existing formatting.
 */
export function addJsoncKey(text: string, key: string, value: string): string {
  const schemaMatch = text.match(/"?\$schema"?\s*:\s*"[^"]*"[,]?\s*\n/)
  if (schemaMatch && schemaMatch.index !== undefined) {
    const insertAt = schemaMatch.index + schemaMatch[0].length
    const indent = "  "
    return text.slice(0, insertAt) + `${indent}${value},\n` + text.slice(insertAt)
  }

  const openBrace = text.indexOf("{")
  if (openBrace !== -1) {
    return text.slice(0, openBrace + 1) + `\n  ${value},` + text.slice(openBrace + 1)
  }

  return text
}

/**
 * Remove a top-level key from a JSON/JSONC object string.
 * Handles the key being on a single line or spanning multiple lines.
 */
export function removeJsoncKey(text: string, key: string): string {
  // Match "key": <value> where value could be a string, object, array, boolean, number, null
  // This handles single-line values and multi-line objects/arrays
  const keyPattern = new RegExp(
    `\\s*"${escapeRegex(key)}"\\s*:\\s*(?:"[^"]*"|\\{[^}]*\\}|\\[[^\\]]*\\]|true|false|null|\\d+)\\s*,?\\s*\\n?`,
  )
  return text.replace(keyPattern, "\n")
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
