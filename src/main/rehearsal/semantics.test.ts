import { expect, it } from 'vitest'
import { Script } from 'node:vm'
import { semanticMatch } from './semantics'

it('accepts the five retained literal false negatives without requiring echoed questions', () => {
  const quadratic = 'Worst case is O(n²); a Set gets it to O(n) time'
  expect(semanticMatch('quadratic', quadratic)).toBe(true) // scripted coding
  expect(semanticMatch('quadratic', 'Worst case is O(n²); a Set brings it to O(n) time')).toBe(true) // audio coding
  expect(
    semanticMatch(
      'owner',
      'Let me check and follow up with the delivery date, owner, and budget status',
    ),
  ).toBe(true)
  expect(
    semanticMatch(
      'budget',
      "Avoid guessing a date or saying the budget is approved unless you've seen the sign-off.",
    ),
  ).toBe(true)
  expect(
    semanticMatch(
      'empty-array',
      'even sum([]) returns NaN, because 0 <= 0 is true. With i < arr.length, the loop never runs and the function returns 0.',
    ),
  ).toBe(true)
})

it('accepts retained quadratic notation, not linear nested-loop claims', () => {
  for (const text of ['Worst case is O(n²)', 'O(n^2)', 'O(n**2)', 'quadratic time'])
    expect(semanticMatch('quadratic', text)).toBe(true)
  expect(semanticMatch('quadratic', 'Worst case is O(n)')).toBe(false)
})
it('requires all empty-array facts and the correct NULL predicate', () => {
  expect(
    semanticMatch('empty-array', 'sum([]) returns NaN; with i < arr.length it returns 0'),
  ).toBe(true)
  expect(semanticMatch('empty-array', 'An empty array returns 0')).toBe(false)
  expect(semanticMatch('sql-null', 'Use o.id IS NULL')).toBe(true)
  expect(semanticMatch('sql-null', 'Use o.id = NULL')).toBe(false)
  expect(semanticMatch('sql-null', 'Use o.id IS NOT NULL')).toBe(false)
})
it('reproduces the duplicate-declaration defect without runtime rewriting', () => {
  expect(() => new Script('function sum(a) { return 0 }\nconst sum = a => 0')).toThrow()
  expect(
    () => new Script('function sum(a) { let n=0; for(let i=0;i<a.length;i++) n+=a[i]; return n }'),
  ).not.toThrow()
})
