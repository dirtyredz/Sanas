import { describe, expect, it } from 'vitest'
import { MATCH_CLOSE, MATCH_OPEN, splitMatchMarkers, stripMatchMarkers } from './search-markers'

const m = (s: string): string => MATCH_OPEN + s + MATCH_CLOSE

describe('search markers', () => {
  it('strips every marker', () => {
    expect(stripMatchMarkers(`the ${m('Azure')} ${m('credits')} expire`)).toBe(
      'the Azure credits expire',
    )
  })
  it('splits into plain and marked runs in order', () => {
    expect(splitMatchMarkers(`the ${m('Azure')} credits`)).toEqual([
      { text: 'the ', marked: false },
      { text: 'Azure', marked: true },
      { text: ' credits', marked: false },
    ])
  })
  it('handles adjacent and leading marks, and a truncated close', () => {
    expect(splitMatchMarkers(`${m('a')}${m('b')}c`)).toEqual([
      { text: 'a', marked: true },
      { text: 'b', marked: true },
      { text: 'c', marked: false },
    ])
    expect(splitMatchMarkers(`x${MATCH_OPEN}unterminated`)).toEqual([
      { text: 'x', marked: false },
      { text: 'unterminated', marked: true },
    ])
  })
  it('passes plain text through untouched', () => {
    expect(splitMatchMarkers('nothing here')).toEqual([{ text: 'nothing here', marked: false }])
  })
})
