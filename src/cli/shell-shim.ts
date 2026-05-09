/**
 * A minimal shell shim that implements the BunShell tagged template literal
 * interface using Node.js child_process. This lets the CLI reuse all core
 * modules (registry/git.ts, scaffolding.ts, etc.) that expect a BunShell.
 *
 * Only implements the subset of the API actually used by Neo:
 *   $`command ${arg}`.quiet()  -> ShellPromise with .text(), .quiet()
 */

import { execFile } from "node:child_process"
import type { Shell } from "../types.js"

interface ShimResult {
  stdout: Buffer
  stderr: Buffer
  exitCode: number
  text(): string
}

interface ShimPromise extends Promise<ShimResult> {
  quiet(): ShimPromise
  text(): Promise<string>
}

function createShimPromise(args: string[]): ShimPromise {
  if (args.length === 0) {
    return Object.assign(
      Promise.reject(new Error("Empty shell command")),
      { quiet: () => createShimPromise(args), text: () => Promise.reject(new Error("Empty shell command")) },
    ) as ShimPromise
  }
  const cmd = args[0]
  const cmdArgs = args.slice(1)

  const promise = new Promise<ShimResult>((resolve, reject) => {
    execFile(cmd, cmdArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const result: ShimResult = {
          stdout: Buffer.from(stdout ?? ""),
          stderr: Buffer.from(stderr ?? ""),
          exitCode: err.code ? (typeof err.code === "number" ? err.code : 1) : 1,
          text() { return (stdout ?? "").toString() },
        }
        // Attach stderr for error handlers that inspect it
        const shellErr: any = new Error(`Command failed: ${cmd} ${cmdArgs.join(" ")}`)
        shellErr.stderr = result.stderr
        shellErr.stdout = result.stdout
        shellErr.exitCode = result.exitCode
        reject(shellErr)
        return
      }
      resolve({
        stdout: Buffer.from(stdout ?? ""),
        stderr: Buffer.from(stderr ?? ""),
        exitCode: 0,
        text() { return (stdout ?? "").toString() },
      })
    })
  })

  // Augment the promise with .quiet() and .text()
  const shimPromise = promise as ShimPromise
  shimPromise.quiet = () => shimPromise // no-op in CLI (no terminal echoing)
  shimPromise.text = async () => {
    const result = await promise
    return result.text()
  }

  return shimPromise
}

/**
 * Parse a tagged template literal into a flat array of string arguments.
 *
 * Interpolated expressions are treated as single atomic arguments (not split
 * on spaces), matching BunShell behavior. Static template parts are split
 * on whitespace normally.
 */
function parseTemplate(strings: TemplateStringsArray, expressions: any[]): string[] {
  // Build segments: each is either { text, split: true } (template literal part,
  // should be split on whitespace) or { text, split: false } (expression, atomic).
  const segments: Array<{ text: string; split: boolean }> = []
  for (let i = 0; i < strings.length; i++) {
    segments.push({ text: strings[i], split: true })
    if (i < expressions.length) {
      segments.push({ text: String(expressions[i]), split: false })
    }
  }

  // Walk segments, building args. Splittable text breaks on whitespace;
  // non-splittable text is appended to the current arg without breaking.
  const args: string[] = []
  let current = ""

  for (const seg of segments) {
    if (!seg.split) {
      // Expression: append as a single unit (may be mid-arg)
      current += seg.text
      continue
    }

    // Template literal part: split on whitespace
    for (const ch of seg.text) {
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        if (current) {
          args.push(current)
          current = ""
        }
      } else {
        current += ch
      }
    }
  }
  if (current) args.push(current)

  return args
}

/**
 * Create a shell function that mimics the BunShell tagged template API
 * using Node.js child_process under the hood.
 */
export function createNodeShell(): Shell {
  const shell = function (strings: TemplateStringsArray, ...expressions: any[]) {
    const args = parseTemplate(strings, expressions)
    return createShimPromise(args)
  }

  // Stub out the additional BunShell methods (not used by Neo)
  shell.braces = (_pattern: string) => []
  shell.escape = (input: string) => {
    // Escape for POSIX shell: wrap in single quotes, escape existing single quotes
    return "'" + input.replace(/'/g, "'\\''") + "'"
  }
  shell.env = () => shell as any
  shell.cwd = () => shell as any
  shell.nothrow = () => shell as any
  shell.throws = () => shell as any

  return shell as unknown as Shell
}
