import { describe, expect, it } from 'vitest'
import {
  couldBeNoSuggestion,
  headlineOf,
  isNoSuggestion,
  recentSuggestionsBlock,
} from './compact-contract'

describe('the no-op output', () => {
  it('recognises <none> (and a bare NONE) as no suggestion', () => {
    for (const t of ['', '  ', '<none>', ' <NONE>\n', 'NONE', 'none', '**NONE**', 'NONE.']) {
      expect(isNoSuggestion(t)).toBe(true)
    }
    expect(isNoSuggestion('**Next, cover the status endpoint.**')).toBe(false)
    expect(isNoSuggestion('None of the models support that.')).toBe(false)
  })

  it('holds a streaming prefix only while it could still be the no-op', () => {
    for (const p of ['', '<', '<no', '<none', '<none>', 'N', 'no', '**', '**NO']) {
      expect(couldBeNoSuggestion(p)).toBe(true)
    }
    for (const p of ['**Use', 'No,', 'Yes', '<nonsense', '**Not']) {
      expect(couldBeNoSuggestion(p)).toBe(false)
    }
  })
})

describe('recently shown suggestions', () => {
  it('takes the headline without bold markers', () => {
    expect(headlineOf('\n**Verify AS9 writeback in sandbox.**\nThen report back.')).toBe(
      'Verify AS9 writeback in sandbox.',
    )
  })

  it('lists the last three and tells the model not to repeat them', () => {
    const block = recentSuggestionsBlock(['a', 'b', 'c', 'd'])
    expect(block).toContain('- b\n- c\n- d')
    expect(block).not.toContain('- a')
    expect(block).toContain('Do not repeat or re-assert these')
    expect(block).toContain('output exactly <none>')
  })
})
