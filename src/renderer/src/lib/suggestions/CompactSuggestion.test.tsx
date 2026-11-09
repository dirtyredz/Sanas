import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CompactSuggestion, parseCompactSuggestion } from './CompactSuggestion'
import { stripFillerMarkers } from '@shared/suggestion/filler-marker'

describe('compact suggestion renderer', () => {
  it('parses a headline, one fenced code block, and two follow-up lines', () => {
    expect(
      parseCompactSuggestion(
        '**Use a tiny linked-list class.**\n```js\nclass Node {\n  next = null\n}\n```\n`next` holds the following node.\nNull ends the list.',
      ),
    ).toEqual({
      headline: 'Use a tiny linked-list class.',
      language: 'js',
      code: 'class Node {\n  next = null\n}',
      followUps: ['`next` holds the following node.', 'Null ends the list.'],
    })
  })

  it('renders inline code while escaping model-supplied HTML', () => {
    const html = renderToStaticMarkup(
      <CompactSuggestion text={'**Use `<Node>` safely.**\n<script>alert(1)</script>'} />,
    )
    expect(html).toContain('<code>&lt;Node&gt;</code>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('renders fenced code in a copyable code box', () => {
    const html = renderToStaticMarkup(
      <CompactSuggestion text={'**Run it.**\n```sh\nnpm test\n```'} />,
    )
    expect(html).toContain('class="compact-code"')
    expect(html).toContain('<pre><code>npm test</code></pre>')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('>Copy</button>')
  })
})

describe('filler marker rendering', () => {
  const text =
    '**I led ⟨a payments integration⟩ where I owned the API.**\nShipped ⟨on a tight timeline⟩.'
  it('renders marked filler as a dimmed span and never shows the markers', () => {
    const html = renderToStaticMarkup(<CompactSuggestion text={text} />)
    expect(html).toContain(
      '<span class="filler" title="Improvised — not from your facts">a payments integration</span>',
    )
    expect(html).toContain('on a tight timeline</span>')
    expect(html).not.toMatch(/[⟨⟩]/)
  })
  it('degrades to speakable plain text with the markers stripped', () => {
    expect(stripFillerMarkers(parseCompactSuggestion(text).headline)).toBe(
      'I led a payments integration where I owned the API.',
    )
  })
  it('tolerates an unclosed marker while streaming', () => {
    const html = renderToStaticMarkup(<CompactSuggestion text={'**I led ⟨a payments'} />)
    expect(html).toContain(
      '<span class="filler" title="Improvised — not from your facts">a payments</span>',
    )
  })
})
