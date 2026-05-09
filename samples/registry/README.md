# neo-samples

Sample [Neo](https://github.com/jasnell/opencode-neo) registry demonstrating all package types.

## Packages

| Name | Type | Description |
|------|------|-------------|
| `lorem-ipsum` | skill | Teaches the agent lorem ipsum conventions and when to use placeholder text |
| `lorem-generate` | tool | Generates lorem ipsum text with configurable paragraphs, sentences, and format |
| `lorem` | command | Quick-generate lorem ipsum via `/neo lorem <paragraphs>` |
| `lorem-writer` | agent | Subagent specialized in generating realistic placeholder content |

## Bundles

| Name | Packages | Description |
|------|----------|-------------|
| `lorem-all` | All 4 above | Install the complete lorem ipsum toolkit |

## Usage

Add this registry to Neo:

```
neo_registries({ action: "add", url: "<this-repo-url>", name: "samples" })
```

Then install individual packages or the whole bundle:

```
neo_install({ name: "lorem-ipsum" })
neo_install({ name: "lorem-all", bundle: true })
```

Or use them dynamically without installing:

```
neo_load({ name: "lorem-ipsum" })           # Load the skill
/neo lorem 5                                 # Generate 5 paragraphs
neo_exec({ name: "lorem-generate", arguments: '{"paragraphs": 3, "format": "html"}' })
```

## Structure

```
registry.json              # Package index with bundles and links
skills/
  lorem-ipsum/
    SKILL.md               # Skill instructions for the agent
tools/
  lorem-generate/
    tool.ts                # OpenCode custom tool (TypeScript)
commands/
  lorem/
    command.md             # Command template with argument substitution
agents/
  lorem-writer/
    agent.md               # Subagent with system prompt and permissions
```

## Federation

This registry links to:
- **community** (recommends) -- Community-maintained packages
