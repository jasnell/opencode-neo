# Tutorial: Using Neo inside OpenCode

This walkthrough shows what a real session with Neo looks like. The
indented blocks are what you type into the OpenCode prompt. The
descriptions explain what happens.

## First-time setup

The first time you use any Neo tool, it detects that no registries are
configured and walks you through setup.

> I need a skill for writing Terraform modules. Can you find one?

The agent calls `neo_search`, gets the "no registries" bootstrap
message, and asks you which registry to add:

> Add our team's registry at https://github.com/acme/opencode-packages

The agent calls `neo_registries` to add it. Neo clones the repo,
reads the index, and reports what's available. If the registry links
to other registries (federation), those are shown too:

```
Registry "acme" added successfully from https://github.com/acme/opencode-packages.
14 package(s) available.

This registry links to 1 other registry(ies):
  - community (recommends) [not added]
    https://github.com/opencode-neo/community-registry
    Community-maintained packages
```

> Add the community one too.

## Discovering packages

> What packages are available for this project?

The agent calls `neo_suggest`, which detects your project's languages
and frameworks from `package.json`, `go.mod`, `Dockerfile`, etc., then
matches them against package tags across all registries.

> Search for anything related to Kubernetes.

```
3 result(s):

  k8s-debugging (skill) v1.0.0 [community]
    Kubernetes debugging patterns and kubectl workflows
    tags: kubernetes, k8s, debugging
  helm-deploy (command) v1.0.0 [acme]
    Deploy a Helm chart via /neo helm-deploy <release> <chart>
    tags: kubernetes, helm, deploy
  k8s-lint (tool) v1.2.0 [community]
    Lint Kubernetes manifests for best practices
    tags: kubernetes, lint, yaml
```

## Loading a skill dynamically

Skills can be loaded into the current session without installing.
This is the "npx" experience -- use it once, no permanent changes.

> Load the k8s-debugging skill so you can help me troubleshoot this pod.

The agent calls `neo_load({ name: "k8s-debugging" })`. The skill's
full SKILL.md content is injected into the conversation, and the agent
immediately has that domain knowledge.

> Now help me figure out why my pod is in CrashLoopBackOff.

The agent now applies the debugging patterns from the skill.

## Running a command dynamically

> /neo helm-deploy my-release ./charts/api --values values-staging.yaml

The `/neo` command fetches the `helm-deploy` command template from
the registry, substitutes the arguments into `$1`, `$2`, `$ARGUMENTS`,
and the agent follows the resulting instructions.

## Installing persistently

When you know you'll use a package regularly, install it so it's
always available.

> Install the k8s-debugging skill and the k8s-lint tool.

The agent calls `neo_install` for each. Skills are available
immediately (via the built-in `skill` tool). Tools are available
after restarting OpenCode.

For tools, a security scan runs first:

```
--- Security Scan ---
Security scan: LOW risk

WARNINGS (1):
  [line 8] Spawns a child process or executes a system command
    > const result = execSync(`kubectl ...`)

LOW RISK: Minor concerns detected (process-spawn).
These may be expected for the tool's functionality.
```

The agent relays the findings and asks for your approval before
writing any files.

## Installing a bundle

> Install the full Kubernetes bundle.

```
neo_install({ name: "kubernetes", bundle: true })

Installing bundle "kubernetes" (4 packages):
  k8s-debugging: Installed (skill v1.0.0)
  k8s-deploy: Installed (command v1.0.0)
  helm-patterns: Installed (skill v1.0.0)
  k8s-lint: Installed (tool v1.2.0)
```

## Executing a tool without installing

> Run the k8s-lint tool against my manifests in ./k8s/ without installing it.

The agent calls `neo_exec`. Neo fetches the tool source, scans it,
shows you the findings, and asks permission. On approval, it runs
the tool and returns the result -- all in one session, no files
written to disk.

## Working with profiles

> Create a profile called "infra" with the k8s-debugging, terraform-modules, and docker-build packages.

```
Profile "infra" created with 3 package(s).
```

> Activate the infra profile.

The agent calls `neo_profile({ action: "activate", name: "infra" })`.
Any skills in the profile are loaded into the current session.

## Creating a registry for your team

> Create a new registry for our platform team in ./platform-registry.

The agent calls `neo_create({ type: "registry", ... })`. Neo
scaffolds the full directory structure with `registry.json`, type
directories, a README, and a git initial commit.

> Now add a skill called "incident-response" to it.

```
neo_create({
  type: "skill",
  name: "incident-response",
  path: "./platform-registry",
  description: "Incident response runbook and debugging workflows"
})
```

Neo creates the SKILL.md template and updates `registry.json`.

> Also publish my existing code-review agent from ~/.config/opencode/agents/review.md into the registry.

The agent calls `neo_publish`, which detects the file type (agent,
since it has `mode:` in its frontmatter), copies it into the
registry, and updates the index.

## Sharing your setup with the team

> Export my Neo setup so the rest of the team can use the same packages.

```
Neo setup exported to neo-setup.json.
  2 registry(ies)
  7 package(s)
  1 profile(s)
```

A teammate opens OpenCode in the same project and says:

> Import the Neo setup from neo-setup.json.

Neo adds any missing registries, installs missing packages (with
security scanning for tools), and imports profiles.

## Using a project-local registry

If your project has packages at `.opencode/neo/registry.json`, they're
auto-discovered -- no setup needed. A teammate clones the repo, opens
OpenCode, and the project's skills/tools/commands/agents are
immediately available.

> What Neo packages come with this project?

The agent calls `neo_list({ filter: "available" })` and the
auto-discovered `project` registry appears alongside any others:

```
  incident-runbook (skill) v1.0.0 [project]
    Team incident response procedures
  deploy-staging (command) v1.0.0 [project]
    Deploy to staging environment
```

## Updating packages

> Check if any of my installed packages have updates.

```
neo_list({ filter: "updates" })

1 update(s) available:
  k8s-lint: 1.2.0 -> 1.3.0 [community]
```

> Show me what changed before updating.

```
neo_update({ name: "k8s-lint", preview: true })

Package "k8s-lint": 1.2.0 -> 1.3.0

Changes since last install:
  abc1234 Add CronJob schedule validation
  def5678 Fix false positive on empty configMap
```

> Looks good, update it.

```
neo_update({ name: "k8s-lint" })
```
