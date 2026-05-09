import { tool } from "@opencode-ai/plugin"

/**
 * A pool of lorem ipsum sentences to build paragraphs from.
 * Sourced from the traditional De Finibus passage.
 */
const SENTENCES = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Curabitur pretium tincidunt lacus.",
  "Nulla gravida orci a odio.",
  "Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.",
  "Integer in mauris eu nibh euismod gravida.",
  "Duis ac tellus et risus vulputate vehicula.",
  "Donec lobortis risus a elit.",
  "Etiam tempor augue at sapien faucibus, eget scelerisque lectus aliquet.",
  "Praesent dapibus, neque id cursus faucibus, tortor neque egestas augue, eu vulputate magna eros eu erat.",
  "Aliquam erat volutpat.",
  "Nam dui mi, tincidunt quis, accumsan porttitor, facilisis luctus, metus.",
  "Phasellus ultrices nulla quis nibh.",
  "Quisque a lectus.",
  "Donec consectetuer ligula vulputate sem tristique cursus.",
  "Fusce commodo aliquam arcu.",
  "Nam commodo suscipit quam.",
  "Vestibulum convallis, lorem a tempus semper, dui dui euismod elit, vitae placerat urna tortor vitae lacus.",
  "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.",
  "Suspendisse potenti.",
  "Morbi in sem quis dui placerat ornare.",
]

function pickRandom<T>(arr: T[], count: number): T[] {
  const result: T[] = []
  const pool = [...arr]
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    result.push(pool.splice(idx, 1)[0])
  }
  return result
}

function generateParagraph(sentenceCount: number, startTraditional: boolean): string {
  if (startTraditional) {
    const rest = pickRandom(SENTENCES.slice(1), sentenceCount - 1)
    return [SENTENCES[0], ...rest].join(" ")
  }
  return pickRandom(SENTENCES, sentenceCount).join(" ")
}

export default tool({
  description:
    "Generate lorem ipsum placeholder text. Returns paragraphs of " +
    "traditional lorem ipsum with configurable count and style.",
  args: {
    paragraphs: tool.schema
      .number()
      .optional()
      .default(3)
      .describe("Number of paragraphs to generate (1-20, default 3)"),
    sentences_per_paragraph: tool.schema
      .number()
      .optional()
      .default(5)
      .describe("Approximate sentences per paragraph (2-10, default 5)"),
    format: tool.schema
      .enum(["plain", "markdown", "html"])
      .optional()
      .default("plain")
      .describe("Output format: plain text, markdown, or HTML"),
  },
  async execute(args) {
    const count = Math.max(1, Math.min(20, args.paragraphs ?? 3))
    const spp = Math.max(2, Math.min(10, args.sentences_per_paragraph ?? 5))
    const format = args.format ?? "plain"

    const paragraphs: string[] = []
    for (let i = 0; i < count; i++) {
      paragraphs.push(generateParagraph(spp, i === 0))
    }

    switch (format) {
      case "plain":
        return paragraphs.join("\n\n")
      case "markdown":
        return paragraphs.join("\n\n")
      case "html":
        return paragraphs.map((p) => `<p>${p}</p>`).join("\n")
    }
  },
})
