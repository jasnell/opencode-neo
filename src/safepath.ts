import { resolve, sep } from "node:path"

/**
 * Safe name pattern for registry names and package names.
 * Allows lowercase alphanumeric, hyphens, and underscores.
 */
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

/**
 * Validate that a name is safe for use in filesystem paths.
 * Rejects path traversal characters, empty strings, and hidden files.
 */
export function validateName(name: string, label: string): void {
  if (!name || !SAFE_NAME_RE.test(name)) {
    throw new Error(
      `Invalid ${label} name "${name}". ` +
        `Names must be alphanumeric with hyphens/underscores, ` +
        `and cannot start with a hyphen or underscore.`,
    )
  }
}

/**
 * Join paths and verify the result stays within the expected base directory.
 * Prevents path traversal attacks from untrusted input.
 */
export function safeJoin(baseDir: string, ...parts: string[]): string {
  const base = resolve(baseDir)
  const target = resolve(base, ...parts)
  if (!target.startsWith(base + sep) && target !== base) {
    throw new Error(`Path traversal detected: "${parts.join("/")}" escapes "${baseDir}"`)
  }
  return target
}

/**
 * Escape a string for safe use in an XML attribute value.
 */
export function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
