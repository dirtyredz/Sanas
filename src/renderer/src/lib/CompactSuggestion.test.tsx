import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CompactSuggestion, parseCompactSuggestion } from './CompactSuggestion'

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
