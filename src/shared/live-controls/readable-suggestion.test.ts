import { describe, expect, it } from 'vitest'
import { couldBeNoSuggestion, hasReadableText, isNoSuggestion } from './readable-suggestion'

describe('the no-op output', () => {
  it('holds a streaming prefix only while it could still be the no-op', () => {
    for (const p of ['', '<', '<no', '<none', '<none>', 'N', 'no', '**', '**NO']) {
      expect(couldBeNoSuggestion(p)).toBe(true)
    }
    for (const p of ['**Use', 'No,', 'Yes', '<nonsense', '**Not']) {
      expect(couldBeNoSuggestion(p)).toBe(false)
    }
  })

  it('recognises <none> (and a bare NONE) as no suggestion', () => {
    for (const t of ['', '  ', '<none>', ' <NONE>\n', 'NONE', 'none', '**NONE**', 'NONE.']) {
      expect(isNoSuggestion(t)).toBe(true)
    }
    expect(isNoSuggestion('**Next, cover the status endpoint.**')).toBe(false)
    expect(isNoSuggestion('None of the models support that.')).toBe(false)
  })
})

describe('readable text', () => {
  it.each([
    ['', false],
    ['<none>', false],
    ['**', false],
    ['  __ ** ` ', false],
    ['⟨⟩', false],
    ['**Use', true],
    ['42', true],
  ])('readable %j → %s', (text, readable) => {
    expect(hasReadableText(text)).toBe(readable)
  })
})
