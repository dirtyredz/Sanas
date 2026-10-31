import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SuggestionContent } from './SuggestionContent'

const diagnosis =
  '**Null user in load()**\n\nThe visible error is TypeError at app.ts:42.\n\nLikely cause: load() runs before login.\n\n' +
  'Third paragraph <b>kept literal</b>.\n\n```ts\nconst id = user?.id\n```\n\nVerify: reload and check the console.'

it('renders screen answers completely — the compact renderer would drop the diagnosis', () => {
  const html = renderToStaticMarkup(<SuggestionContent text={diagnosis} manualKind="capture" />)
  expect(html).toContain('Likely cause')
  expect(html).toContain('Third paragraph')
  expect(html).toContain('Verify: reload')
  expect(html).toContain('const id = user?.id')
  expect(html).toContain('&lt;b&gt;kept literal')
  const compact = renderToStaticMarkup(<SuggestionContent text={diagnosis} manualKind="typed" />)
  expect(compact).not.toContain('Verify: reload')
})
