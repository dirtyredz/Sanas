import { expect, it } from 'vitest'
import { fitKeyterms } from './keyterm-budget'

it('bounds hints by count, per-term length and conservative UTF-8 token budget', () => {
  const terms = fitKeyterms([
    'Camunda',
    'x'.repeat(101),
    ...Array.from({ length: 200 }, (_, i) => `Tool${i}`),
  ])
  expect(terms[0]).toBe('Camunda')
  expect(terms.length).toBeLessThanOrEqual(100)
  expect(terms.every((t) => t.length <= 100)).toBe(true)
  expect(terms.reduce((n, t) => n + Buffer.byteLength(t) + 1, 0)).toBeLessThanOrEqual(500)
})

it('drops control characters and blanks but keeps order', () => {
  expect(fitKeyterms(['  Spaced   Out ', 'bad\u0007term', '', 'Next'])).toEqual([
    'Spaced Out',
    'Next',
  ])
})
