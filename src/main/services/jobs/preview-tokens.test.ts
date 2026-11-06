import { expect, it } from 'vitest'
import { createPreviewTokens, isPreviewToken } from './preview-tokens'

it('binds tokens to the sender, consumes them once and expires them', () => {
  let t = 0
  const tokens = createPreviewTokens<string>(1000, () => t)
  const a = tokens.issue(1, 'a')
  expect(isPreviewToken(a)).toBe(true)
  expect(tokens.take(a, 2)).toBeNull() // another window
  expect(tokens.take(a, 1)).toBe('a')
  expect(tokens.take(a, 1)).toBeNull() // single use
  const b = tokens.issue(1, 'b')
  t = 1000
  expect(tokens.take(b, 1)).toBeNull() // expired
  expect(isPreviewToken('../etc')).toBe(false)
  expect(isPreviewToken(42)).toBe(false)
})
