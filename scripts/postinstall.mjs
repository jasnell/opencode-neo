#!/usr/bin/env node

/**
 * npm postinstall hook. Prints a reminder to run setup.
 * Does NOT auto-modify user config -- that should be explicit.
 */

// Skip in CI environments
if (process.env.CI) process.exit(0)

console.log(`
  ╭──────────────────────────────────────────────────╮
  │                                                  │
  │   opencode-neo installed.                        │
  │                                                  │
  │   Run setup to configure OpenCode:               │
  │                                                  │
  │     npm run setup                                │
  │                                                  │
  │   Or if updating, re-run to sync the /neo        │
  │   command and plugin config:                     │
  │                                                  │
  │     npm run setup                                │
  │                                                  │
  ╰──────────────────────────────────────────────────╯
`)
