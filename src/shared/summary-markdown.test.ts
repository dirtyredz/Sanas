import { describe, expect, it } from 'vitest'
import { parseSummaryInline, parseSummaryMarkdown } from './summary-markdown'

describe('summary Markdown', () => {
  it('parses section labels, paragraphs, and lists without interpreting arbitrary HTML', () => {
    expect(
      parseSummaryMarkdown(`**Overview**
Purpose and outcome.

**Specifics**
- Use \`X-Request-ID\`.
- Target \`sandbox\`.

<script>alert(1)</script>`),
    ).toEqual([
      { kind: 'heading', text: 'Overview' },
      { kind: 'paragraph', text: 'Purpose and outcome.' },
      { kind: 'heading', text: 'Specifics' },
      { kind: 'list', items: ['Use `X-Request-ID`.', 'Target `sandbox`.'] },
      { kind: 'paragraph', text: '<script>alert(1)</script>' },
    ])
  })

  it('tokenizes only inline code and bold text', () => {
    expect(parseSummaryInline('Run `npm test`; owner is **Mina**.')).toEqual([
      { kind: 'text', text: 'Run ' },
      { kind: 'code', text: 'npm test' },
      { kind: 'text', text: '; owner is ' },
      { kind: 'strong', text: 'Mina' },
      { kind: 'text', text: '.' },
    ])
  })
})
