import { describe, expect, it } from 'vitest'
import { ftsAllOf, ftsAnyOf } from './fts-query'

describe('ftsAllOf', () => {
  it('quotes every word and prefix-matches the last', () => {
    expect(ftsAllOf('azure cred')).toBe('"azure" "cred"*')
  })
  it('neutralises FTS5 operator syntax in user input', () => {
    expect(ftsAllOf('foo" OR bar NEAR/2 (baz')).toBe('"foo" "or" "bar" "near" "2" "baz"*')
  })
  it('is empty for no tokens', () => {
    expect(ftsAllOf('  ?!  ')).toBe('')
  })
})

describe('ftsAnyOf', () => {
  it('drops stopwords, dedupes, and ORs the rest', () => {
    expect(ftsAnyOf('What did we decide about the Azure credits? the credits')).toBe(
      '"decide" OR "azure" OR "credits"',
    )
  })
  it('keeps numbers and non-Latin letters', () => {
    expect(ftsAnyOf('phase 2 für München')).toBe('"phase" OR "für" OR "münchen"')
  })
  it('is empty when only stopwords remain', () => {
    expect(ftsAnyOf('what is it')).toBe('')
  })
})
