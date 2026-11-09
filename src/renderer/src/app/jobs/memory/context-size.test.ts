import { expect, it } from 'vitest'
import { contextSize } from './context-size'
it('counts saved notes, approved memory and rendered terms with exact warning boundary', () => {
  expect(contextSize('x'.repeat(11999), 'a', [])).toEqual({
    chars: 12000,
    tokens: 3000,
    large: false,
  })
  expect(contextSize('x'.repeat(12000), 'a', [])).toEqual({
    chars: 12001,
    tokens: 3001,
    large: true,
  })
  expect(
    contextSize('note', 'memory', [{ id: 1, jobId: 1, term: 'SLA', note: '24 hours' }]).chars,
  ).toBe(25)
})
