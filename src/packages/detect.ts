import { join } from "node:path"
import { readFile, stat } from "node:fs/promises"
import type { NeoConfig, SearchResult } from "../types.js"
import { registryCacheDir } from "../registry/cache.js"
import { loadRegistryIndex } from "../registry/manager.js"

/** Detected project characteristics */
export interface ProjectContext {
  languages: string[]
  frameworks: string[]
  tools: string[]
}

/**
 * Detect project characteristics from common config files.
 */
export async function detectProject(directory: string): Promise<ProjectContext> {
  const languages: Set<string> = new Set()
  const frameworks: Set<string> = new Set()
  const tools: Set<string> = new Set()

  // package.json -> Node.js / JS ecosystem
  const pkg = await readJson(join(directory, "package.json"))
  if (pkg) {
    languages.add("javascript")
    languages.add("typescript")
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }
    if (allDeps.react || allDeps["react-dom"]) frameworks.add("react")
    if (allDeps.next) frameworks.add("nextjs")
    if (allDeps.vue) frameworks.add("vue")
    if (allDeps.svelte) frameworks.add("svelte")
    if (allDeps.angular || allDeps["@angular/core"]) frameworks.add("angular")
    if (allDeps.express) frameworks.add("express")
    if (allDeps.fastify) frameworks.add("fastify")
    if (allDeps.hono) frameworks.add("hono")
    if (allDeps.prisma || allDeps["@prisma/client"]) tools.add("prisma")
    if (allDeps.drizzle || allDeps["drizzle-orm"]) tools.add("drizzle")
    if (allDeps.tailwindcss) tools.add("tailwind")
    if (allDeps.vitest) tools.add("vitest")
    if (allDeps.jest) tools.add("jest")
  }

  // tsconfig.json -> TypeScript
  if (await exists(join(directory, "tsconfig.json"))) {
    languages.add("typescript")
  }

  // go.mod -> Go
  if (await exists(join(directory, "go.mod"))) {
    languages.add("go")
  }

  // Cargo.toml -> Rust
  if (await exists(join(directory, "Cargo.toml"))) {
    languages.add("rust")
  }

  // pyproject.toml or requirements.txt -> Python
  if (
    (await exists(join(directory, "pyproject.toml"))) ||
    (await exists(join(directory, "requirements.txt")))
  ) {
    languages.add("python")
  }

  // Dockerfile / docker-compose -> Docker
  if (
    (await exists(join(directory, "Dockerfile"))) ||
    (await exists(join(directory, "docker-compose.yml"))) ||
    (await exists(join(directory, "docker-compose.yaml")))
  ) {
    tools.add("docker")
  }

  // Kubernetes manifests
  if (
    (await exists(join(directory, "k8s"))) ||
    (await exists(join(directory, "kubernetes"))) ||
    (await exists(join(directory, "helm")))
  ) {
    tools.add("kubernetes")
  }

  // Terraform
  if (await exists(join(directory, "main.tf"))) {
    tools.add("terraform")
  }

  // .github -> GitHub Actions
  if (await exists(join(directory, ".github"))) {
    tools.add("github-actions")
  }

  return {
    languages: [...languages],
    frameworks: [...frameworks],
    tools: [...tools],
  }
}

/**
 * Find packages across registries that match the detected project context.
 */
export async function suggestPackages(
  config: NeoConfig,
  context: ProjectContext,
): Promise<SearchResult[]> {
  const keywords = [...context.languages, ...context.frameworks, ...context.tools]
  if (keywords.length === 0) return []

  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()))
  const results: Array<SearchResult & { relevance: number }> = []
  const installed = new Set(Object.keys(config.installed))

  for (const reg of config.registries) {
    if (!reg.enabled) continue
    const cacheDir = registryCacheDir(config, reg.name)
    const index = await loadRegistryIndex(cacheDir)
    if (!index) continue

    for (const [name, entry] of Object.entries(index.packages)) {
      // Skip already installed
      if (installed.has(name)) continue

      // Score by tag/name/description overlap with project context
      const tags = (entry.tags ?? []).map((t) => t.toLowerCase())
      const nameLower = name.toLowerCase()
      const descLower = entry.description.toLowerCase()

      let relevance = 0
      for (const kw of keywordSet) {
        if (tags.includes(kw)) relevance += 3
        if (nameLower.includes(kw)) relevance += 2
        if (descLower.includes(kw)) relevance += 1
      }

      if (relevance > 0) {
        results.push({
          name,
          type: entry.type,
          description: entry.description,
          version: entry.version,
          registry: reg.name,
          tags: entry.tags ?? [],
          relevance,
        })
      }
    }
  }

  results.sort((a, b) => b.relevance - a.relevance)
  return results.map(({ relevance: _, ...rest }) => rest)
}

// Helpers

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function readJson(p: string): Promise<any> {
  try {
    return JSON.parse(await readFile(p, "utf-8"))
  } catch {
    return null
  }
}
