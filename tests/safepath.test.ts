import { describe, it, expect } from "vitest"
import { validateName, safeJoin, escapeXmlAttr } from "../src/safepath.js"

describe("validateName", () => {
  it("accepts simple alphanumeric names", () => {
    expect(() => validateName("react-patterns", "package")).not.toThrow()
    expect(() => validateName("db-query", "package")).not.toThrow()
    expect(() => validateName("myTool", "package")).not.toThrow()
    expect(() => validateName("tool123", "package")).not.toThrow()
    expect(() => validateName("a", "package")).not.toThrow()
  })

  it("accepts underscores", () => {
    expect(() => validateName("my_tool", "package")).not.toThrow()
    expect(() => validateName("my_tool_v2", "package")).not.toThrow()
  })

  it("rejects empty strings", () => {
    expect(() => validateName("", "package")).toThrow("Invalid package name")
  })

  it("rejects path traversal sequences", () => {
    expect(() => validateName("../etc", "package")).toThrow()
    expect(() => validateName("../../passwd", "package")).toThrow()
    expect(() => validateName("foo/bar", "package")).toThrow()
  })

  it("rejects names starting with hyphen or underscore", () => {
    expect(() => validateName("-leading", "package")).toThrow()
    expect(() => validateName("_leading", "package")).toThrow()
  })

  it("rejects hidden file names", () => {
    expect(() => validateName(".hidden", "package")).toThrow()
    expect(() => validateName(".git", "package")).toThrow()
  })

  it("rejects names with special characters", () => {
    expect(() => validateName("foo bar", "package")).toThrow()
    expect(() => validateName("foo@bar", "package")).toThrow()
    expect(() => validateName("foo;bar", "package")).toThrow()
  })

  it("includes the label in error message", () => {
    expect(() => validateName("../bad", "registry")).toThrow("Invalid registry name")
  })
})

describe("safeJoin", () => {
  it("joins paths within the base directory", () => {
    const result = safeJoin("/base/dir", "sub", "file.txt")
    expect(result).toBe("/base/dir/sub/file.txt")
  })

  it("allows the base directory itself", () => {
    const result = safeJoin("/base/dir")
    expect(result).toBe("/base/dir")
  })

  it("throws on path traversal via ..", () => {
    expect(() => safeJoin("/base/dir", "..", "outside")).toThrow("Path traversal detected")
  })

  it("throws on traversal via nested ..", () => {
    expect(() => safeJoin("/base/dir", "sub", "..", "..", "outside")).toThrow(
      "Path traversal detected",
    )
  })

  it("allows .. that stays within base", () => {
    // /base/dir/sub/../other resolves to /base/dir/other -- still within /base/dir
    const result = safeJoin("/base/dir", "sub", "..", "other")
    expect(result).toBe("/base/dir/other")
  })

  it("throws on absolute path escape", () => {
    expect(() => safeJoin("/base/dir", "/etc/passwd")).toThrow("Path traversal detected")
  })
})

describe("escapeXmlAttr", () => {
  it("escapes ampersands", () => {
    expect(escapeXmlAttr("a&b")).toBe("a&amp;b")
  })

  it("escapes double quotes", () => {
    expect(escapeXmlAttr('a"b')).toBe("a&quot;b")
  })

  it("escapes angle brackets", () => {
    expect(escapeXmlAttr("a<b>c")).toBe("a&lt;b&gt;c")
  })

  it("leaves safe strings unchanged", () => {
    expect(escapeXmlAttr("hello-world_123")).toBe("hello-world_123")
  })

  it("handles empty string", () => {
    expect(escapeXmlAttr("")).toBe("")
  })

  it("handles multiple special characters", () => {
    expect(escapeXmlAttr('<"&">')).toBe("&lt;&quot;&amp;&quot;&gt;")
  })
})
