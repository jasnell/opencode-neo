# Security

Neo involves fetching and potentially executing code from remote git repositories. This document describes the security model.

## Threat model

### What Neo protects against

1. **Malicious tool code** -- Tools are TypeScript that runs in the OpenCode process. A malicious tool could read files, access environment variables, make network requests, or execute system commands.

2. **Path traversal** -- A malicious registry could declare packages with names like `../../etc` or paths like `../../../.ssh` to read or write files outside expected directories.

3. **TOCTOU attacks** -- The source code scanned for security issues could differ from the code actually executed if the cache is modified between scan and execution.

4. **Silent installation** -- Tools installed via bulk operations (setup import, bundle install) could bypass security review.

### What Neo does NOT protect against

- **Sophisticated obfuscation** -- The scanner is pattern-based, not a full static analyzer. Determined adversaries can construct malicious code that evades pattern matching.
- **Supply chain attacks on registries** -- If a registry's git repo is compromised, Neo will fetch the compromised content. Trust in a registry is trust in its maintainers.
- **Runtime sandboxing** -- Dynamically executed tools (`neo_exec`) run in the same Node.js/Bun process as OpenCode. There is no sandbox or capability restriction beyond the permission prompt.

## Security layers

### 1. Static security scanning

Before installing or executing a tool, Neo scans the source code for known dangerous patterns.

**Severity levels:**

| Level | What it catches |
|-------|----------------|
| Critical | `eval()`, `new Function()`, `child_process`, `exec`/`spawn`, `Bun.spawn()`, shell template literals |
| Warning | `fetch()`, HTTP client libraries, filesystem access (`fs`, `Bun.file`), path traversal patterns, `process.env` / `Bun.env`, dynamic imports with computed specifiers, hardcoded secret patterns, base64/hex obfuscation |
| Info | `process.exit()`, global scope mutation |

**Risk levels:**

| Level | Criteria |
|-------|----------|
| `high` | Any critical finding |
| `moderate` | 3+ warnings |
| `low` | 1-2 warnings |
| `clean` | No findings |

The scan report is included in the tool's response so the agent can present it to the user before asking for permission.

**Limitations:**

The scanner uses regex pattern matching. It is not a full AST-based analyzer. Known blind spots:

- String concatenation to construct dangerous calls (`"ev" + "al"`)
- Computed property access (`global["eval"]`)
- Code inside comments may occasionally produce false negatives or positives
- Obfuscation techniques beyond base64/hex encoding

The scanner is a first line of defense, not a guarantee. Users should review tool source when the scan flags concerns.

### 2. Permission gates

All operations that modify the filesystem or execute code use OpenCode's built-in permission system via `context.ask()`. The user sees a prompt and can:

- **Allow** -- Proceed this time
- **Always allow** -- Proceed and remember for this package
- **Deny** -- Block the operation

The following operations require permission:

| Permission | Operations |
|------------|-----------|
| `neo.install` | Installing any package |
| `neo.install.bundle` | Installing a bundle |
| `neo.exec` | Dynamically executing a tool |
| `neo.remove` | Uninstalling a package |
| `neo.update` | Updating packages |

The permission metadata includes the package name, type, scope, and (for tools) the security scan report.

### 3. Path validation

All package names and registry names are validated against a safe pattern:

```
/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
```

This rejects:
- Path traversal sequences (`../`, `../../`)
- Path separators (`/`, `\`)
- Hidden files (`.git`, `.env`)
- Empty strings
- Names starting with `-` or `_`

All path joins with untrusted input use `safeJoin()`, which resolves the path and verifies it stays within the expected base directory.

### 4. TOCTOU protection

When a tool is dynamically executed via `neo_exec`:

1. The source is read from the registry cache **once** by `describeTool()`
2. The **same source string** is passed to the security scanner
3. The **same source string** is passed to `executeTool()` for execution
4. The executed code is identical to the scanned code

There is no second read from the cache between scanning and execution.

### 5. Setup import safety

When importing a setup file via `neo_setup`, tool packages are security-scanned before installation:

- **HIGH risk** tools are skipped entirely with a message directing the user to install manually via `neo_install` (where they'll see the full scan report)
- Tools with warnings are installed but the warnings are reported
- Skills, commands, and agents are installed without scanning (they are not executable code)

## Registry trust

Neo does not have a concept of "verified" or "signed" registries. Trust is established by:

1. **The user explicitly adds registries** -- Git and local registries are added by explicit user action
2. **Project registries are auto-discovered** -- If `.opencode/neo/registry.json` exists in the project worktree, it is automatically loaded as a local registry. This means cloning a repository that contains this file will make its packages visible to Neo. This is by design (for team sharing), but users should be aware that any cloned project can provide packages. Tool packages from auto-discovered registries still go through the security scanner and permission gate before installation or execution.
3. **Federation is advisory** -- Linked registries are surfaced as suggestions, not auto-added
4. **Git authentication** -- Private registries use the system's existing git credentials (SSH keys, credential helpers)

### Recommendations for registry maintainers

- Enable branch protection on your registry repo
- Require PR review for changes to `registry.json` and tool source files
- Use the `neo_validate` tool in CI to catch structural issues
- Pin tool dependencies to specific versions
- Document the security profile of tools that require elevated access (network, filesystem, etc.)

### Recommendations for users

- Review `.opencode/neo/` in cloned repositories before using their packages
- Use `neo_list --available` to see what packages are visible from all registries including auto-discovered ones
- Tool packages always go through security scanning regardless of source

## Reporting vulnerabilities

If you discover a security issue in Neo itself, please report it at:

https://github.com/jasnell/opencode-neo/security/advisories
