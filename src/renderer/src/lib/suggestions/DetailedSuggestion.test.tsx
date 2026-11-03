import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DetailedSuggestion } from './DetailedSuggestion'
it('retains six paragraphs and 40 code lines while rendering HTML literally', () => {
  const text =
    '**Headline**\n\n' +
    Array.from({ length: 6 }, (_, i) => `Paragraph ${i} <script>alert(1)</script>`).join('\n\n') +
    '\n\n```ts\n' +
    Array.from({ length: 40 }, (_, i) => `line${i}`).join('\n') +
    '\n```'
  const html = renderToStaticMarkup(<DetailedSuggestion text={text} />)
  expect(html).toContain('Paragraph 5')
  expect(html).toContain('line39')
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
})

it('renders filler markers as dimmed spans and never shows them', () => {
  const html = renderToStaticMarkup(
    <DetailedSuggestion
      text={'**Story ⟨with a vendor⟩.**\n\nI owned ⟨the API layer⟩ end to end.'}
    />,
  )
  expect(html).toContain('class="filler"')
  expect(html).toContain('the API layer</span>')
  expect(html).not.toMatch(/[⟨⟩]/)
})
