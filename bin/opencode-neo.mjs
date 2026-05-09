#!/usr/bin/env node

/**
 * CLI entry point wrapper.
 * Uses tsx to run the TypeScript CLI source directly.
 * Resolves tsx's register hook by absolute path so it works
 * when invoked from any directory.
 */

import { execFileSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { join, dirname } from "node:path"
import { createRequire } from "node:module"

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliEntry = join(__dirname, "..", "src", "cli", "index.ts")
const args = process.argv.slice(2)

// Resolve tsx's loader by absolute path so it works from any cwd
const require = createRequire(import.meta.url)
const tsxLoaderPath = require.resolve("tsx")
const tsxImportUrl = pathToFileURL(tsxLoaderPath).href

try {
  execFileSync(
    process.execPath,
    ["--import", tsxImportUrl, "--no-deprecation", cliEntry, ...args],
    { stdio: "inherit" },
  )
} catch (err) {
  if (err && typeof err === "object" && "status" in err) {
    process.exit(err.status ?? 1)
  }
  process.exit(1)
}
