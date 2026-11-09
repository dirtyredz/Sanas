import { describe, expect, it } from 'vitest'
import { headlineOf, recentSuggestionsBlock, rememberHeadline } from './compact-contract'

describe('recently shown suggestions', () => {
  it('takes the headline without bold markers', () => {
    expect(headlineOf('\n**Verify AS9 writeback in sandbox.**\nThen report back.')).toBe(
      'Verify AS9 writeback in sandbox.',
    )
  })

  it('strips filler markers from remembered headlines', () => {
    expect(headlineOf('**I led ⟨a payments job⟩.**')).toBe('I led a payments job.')
  })

  it('remembers only as many headlines as the prompt carries', () => {
    const shown: string[] = []
    for (const t of ['**a**', '**b**\nmore', '**c**', '**d**']) rememberHeadline(shown, t)
    expect(shown).toEqual(['b', 'c', 'd'])
  })

  it('lists the last three and tells the model not to repeat them', () => {
    const block = recentSuggestionsBlock(['a', 'b', 'c', 'd'])
    expect(block).toContain('- b\n- c\n- d')
    expect(block).not.toContain('- a')
    expect(block).toContain('Do not repeat or re-assert these')
    expect(block).toContain('output exactly <none>')
  })
})
