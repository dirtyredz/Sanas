export type SummaryBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }

export type SummaryInline = { kind: 'text' | 'strong' | 'code'; text: string }

/** Parses only the deliberately small Markdown subset requested by the summary prompt. */
export function parseSummaryMarkdown(text: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = []
  let paragraph: string[] = []
  let items: string[] = []

  const flushParagraph = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushItems = (): void => {
    if (items.length > 0) blocks.push({ kind: 'list', items })
    items = []
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    const heading = /^\*\*(.+)\*\*$/.exec(line)
    const item = /^[-*•]\s+(.+)$/.exec(line)
    if (!line) {
      flushParagraph()
      flushItems()
    } else if (heading) {
      flushParagraph()
      flushItems()
      blocks.push({ kind: 'heading', text: heading[1].trim() })
    } else if (item) {
      flushParagraph()
      items.push(item[1])
    } else {
      flushItems()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushItems()
  return blocks
}

/** Inline code and bold are data, never HTML; consumers choose their own safe rendering. */
export function parseSummaryInline(text: string): SummaryInline[] {
  return text
    .split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return { kind: 'code', text: part.slice(1, -1) }
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return { kind: 'strong', text: part.slice(2, -2) }
      }
      return { kind: 'text', text: part }
    })
}
