import { tool } from "@opencode-ai/plugin"
import { Effect } from "effect"
import type { NeoConfig, Shell } from "../types.js"
import { describeTool, executeTool } from "../loader/tool.js"
import { scanToolSource, formatScanReport } from "../packages/scanner.js"

const NO_REGISTRIES_MSG = `Neo is not configured yet -- no package registries have been added.

To get started, call neo_registries to add your first registry:

  neo_registries({ action: "add", url: "https://github.com/your-org/opencode-packages", name: "my-registry" })

A registry is a git repository containing a registry.json index file and skill/tool/command packages. Ask the user which git repository they'd like to use.`

export function buildExecTool(config: NeoConfig, _$: Shell) {
  return tool({
    description:
      "Execute a tool from Neo registries without installing it. " +
      "This fetches remote tool code and runs it locally. " +
      "A security scan is performed and the user will be asked for " +
      "permission before any code is executed. " +
      "For skills use neo_load, for persistent installation use neo_install.",
    args: {
      name: tool.schema.string().describe("Tool package name to execute"),
      arguments: tool.schema
        .string()
        .optional()
        .default("{}")
        .describe("JSON-encoded arguments to pass to the tool"),
    },
    async execute(args, context) {
      if (config.registries.length === 0) {
        return NO_REGISTRIES_MSG
      }

      // Describe the tool (fetches source) so we can scan it
      const info = await describeTool(config, args.name)
      if (!info.found) {
        return info.description
      }

      // Scan the source for security issues before asking permission.
      // The agent MUST present these findings to the user.
      const scanResult = scanToolSource(info.source)
      const scanReport = formatScanReport(scanResult)

      // Request permission before executing remote code.
      // Include the scan report in metadata so the agent can relay it.
      await Effect.runPromise(
        context.ask({
          permission: "neo.exec",
          patterns: [args.name],
          always: [`neo.exec.${args.name}`],
          metadata: {
            tool: args.name,
            description: info.description,
            action: "Execute remote tool code from Neo registry",
            securityScan: scanReport,
            riskLevel: scanResult.riskLevel,
          },
        }),
      )

      // Parse arguments
      let toolArgs: Record<string, unknown>
      try {
        toolArgs = JSON.parse(args.arguments ?? "{}")
      } catch {
        return `Invalid JSON in arguments: ${args.arguments}`
      }

      // Execute the tool using the SAME source that was scanned (no TOCTOU)
      const execResult = await executeTool(info.source, args.name, toolArgs, {
        sessionID: context.sessionID,
        messageID: context.messageID,
        agent: context.agent,
        directory: context.directory,
        worktree: context.worktree,
      })

      // Return both the scan report and execution result
      return [
        "--- Security Scan Results ---",
        scanReport,
        "",
        "--- Execution Result ---",
        execResult,
      ].join("\n")
    },
  })
}
