import type { Plugin } from "@opencode-ai/plugin"
import { loadConfig } from "./config.js"
import { refreshStaleRegistries } from "./registry/manager.js"
import { buildSearchTool } from "./tools/neo-search.js"
import { buildLoadTool } from "./tools/neo-load.js"
import { buildExecTool } from "./tools/neo-exec.js"
import { buildInstallTool } from "./tools/neo-install.js"
import { buildRemoveTool } from "./tools/neo-remove.js"
import { buildListTool } from "./tools/neo-list.js"
import { buildUpdateTool } from "./tools/neo-update.js"
import { buildRegistriesTool } from "./tools/neo-registries.js"
import { buildCreateTool } from "./tools/neo-create.js"
import { buildPublishTool } from "./tools/neo-publish.js"
import { buildValidateTool } from "./tools/neo-validate.js"
import { buildSuggestTool } from "./tools/neo-suggest.js"
import { buildSetupTool } from "./tools/neo-setup.js"
import { buildProfileTool } from "./tools/neo-profile.js"
import { buildConfigTool } from "./tools/neo-config.js"

/**
 * Neo -- Dynamic package manager for OpenCode skills, tools, and commands.
 *
 * "I know kung-fu."
 *
 * Neo provides an npm/npx-like experience for discovering, loading, and
 * installing skills, tools, and commands from git-based registries.
 *
 * - Skills can be loaded dynamically into the current session (like npx)
 * - Tools can be executed dynamically with permission (like npx)
 * - Commands can be run via the /neo bootstrap command (like npx)
 * - All package types can be installed persistently (like npm install)
 * - New registries and packages can be scaffolded (like npm init)
 * - Registries support federation via links
 * - Packages support bundles, profiles, version locking, and dependencies
 * - Security scanning for tool packages before install/execute
 * - Context-aware suggestions based on project analysis
 * - Setup export/import for team onboarding
 * - Project-level config that layers on top of global config
 */
export const Neo: Plugin = async ({ $, worktree }) => {
  const config = await loadConfig(worktree)

  // Background refresh of stale registries on startup.
  // Non-blocking -- failures are silently ignored.
  if (config.registries.length > 0) {
    refreshStaleRegistries($, config).catch(() => {})
  }

  // Build a summary of configured registries for the system prompt
  const registrySummary = config.registries.length > 0
    ? `${config.registries.length} registry(ies) configured: ${config.registries.map((r) => r.name).join(", ")}.`
    : "No registries configured yet. Use neo_registries to add one."

  return {
    tool: {
      // Discovery
      neo_search:     buildSearchTool(config, $),
      neo_suggest:    buildSuggestTool(config, $),

      // Dynamic loading (npx)
      neo_load:       buildLoadTool(config, $),
      neo_exec:       buildExecTool(config, $),

      // Package management (npm)
      neo_install:    buildInstallTool(config, $, worktree),
      neo_remove:     buildRemoveTool(config, $, worktree),
      neo_update:     buildUpdateTool(config, $, worktree),
      neo_list:       buildListTool(config, $),

      // Registry management
      neo_registries: buildRegistriesTool(config, $),

      // Authoring
      neo_create:     buildCreateTool(config, $, worktree),
      neo_publish:    buildPublishTool(config, $, worktree),
      neo_validate:   buildValidateTool(config, $),

      // Configuration
      neo_setup:      buildSetupTool(config, $, worktree),
      neo_profile:    buildProfileTool(config, $),
      neo_config:     buildConfigTool(config, $, worktree),
    },

    // Inject Neo awareness into the agent's system prompt so it knows
    // to use neo_* tools for package-related requests.
    "experimental.chat.system.transform": async (_input, output) => {
      output.system.push(`
## Neo Package Manager

You have access to the Neo package manager (opencode-neo). Neo provides tools
prefixed with neo_ for managing skills, tools, commands, and agents from
package registries. ${registrySummary}

When the user asks about packages, skills, tools, commands, or agents:
- To search or discover packages, use neo_search or neo_suggest
- To load a skill or command for the current session, use neo_load
- To install a package persistently, use neo_install
- To list packages, use neo_list
- To manage registries, use neo_registries

Do NOT use npm, pip, or other package managers when the user is asking
about Neo packages, OpenCode skills, tools, commands, or agents.
`.trim())
    },
  }
}
