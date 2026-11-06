import { describe, expect, it } from 'vitest'
import {
  formatVerdict,
  malformedShape,
  parseClassification,
  parseVerdict,
  type Addressee,
  type ResponseKind,
} from './classifier-verdict'

const KINDS: ResponseKind[] = ['question', 'request', 'objection']
const ADDRESSEES: Addressee[] = ['me', 'room', 'other']
const PAIRS = KINDS.flatMap((kind) => ADDRESSEES.map((addressee) => ({ kind, addressee })))

describe('classifier verdict parsing', () => {
  it('reads the reversed order seen from Haiku ("room question", dk-98a73491)', () => {
    expect(parseClassification('room question')).toEqual({ kind: 'question', addressee: 'room' })
  })

  it.each(PAIRS)('accepts $kind $addressee in either order, any case or punctuation', (v) => {
    for (const text of [
      `${v.kind} ${v.addressee}`,
      `${v.addressee} ${v.kind}`,
      `${v.kind.toUpperCase()} ${v.addressee.toUpperCase()}`,
      `  ${v.kind},\n${v.addressee}.  `,
      `Verdict: ${v.addressee.toUpperCase()}, ${v.kind.toUpperCase()}.`,
      `"${v.kind} ${v.addressee}"`,
    ])
      expect(parseClassification(text), text).toEqual(v)
  })

  it('accepts the labelled example from the plan as its canonical pair', () => {
    const v = parseClassification('Verdict: ROOM, QUESTION.')
    expect(v && formatVerdict(v)).toBe('question room')
  })

  it.each(['none', 'NONE', 'None.', 'Verdict: none', '"none"'])('accepts %j as none', (text) => {
    expect(parseClassification(text)).toEqual({ kind: 'none' })
  })

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['x'.repeat(121), 'oversized'],
    [`question me ${'and more '.repeat(20)}`, 'oversized'],
    ['question', 'incomplete'],
    ['room', 'incomplete'],
    ['yes', 'no-verdict'],
    ['questions for me', 'incomplete'], // plural is not the enum word
    ['requested', 'no-verdict'],
    ['meeting roommate', 'no-verdict'], // substrings never match
    ['question me room', 'conflict'],
    ['question request me', 'conflict'],
    ['none room', 'conflict'],
    ['none, question me', 'conflict'],
    ['not me, question room', 'hedged'],
    ['question me or room', 'hedged'],
    ['maybe question me', 'hedged'],
    ['probably request room', 'hedged'],
    ["It isn't a question for me", 'hedged'],
    ['unclear: question me', 'hedged'],
    ['either question me', 'hedged'],
  ] as const)('fails closed on %j (%s)', (text, rejection) => {
    expect(parseVerdict(text)).toEqual({ ok: false, rejection })
    expect(parseClassification(text)).toBeNull()
  })

  it('never selects the first pair from conflicting prose', () => {
    expect(parseClassification('question me. Actually objection room')).toBeNull()
  })
})

describe('malformed shape', () => {
  it('keeps enum tokens, a length bucket and flags, never the text', () => {
    const text = 'Sarah ASKED: question me or room? (secret project Falcon)'
    const shape = malformedShape(text, 'hedged')
    expect(shape).toEqual({
      rejection: 'hedged',
      lengthBucket: '49-120',
      tokens: ['question', 'me', 'room'],
      punctuation: true,
      uppercase: true,
    })
    expect(JSON.stringify(shape)).not.toMatch(/Sarah|ASKED|secret|Falcon/i)
  })

  it('caps tokens and buckets oversized input', () => {
    const shape = malformedShape('me '.repeat(500), 'oversized')
    expect(shape.tokens).toHaveLength(6)
    expect(shape.lengthBucket).toBe('>120')
    expect(malformedShape('', 'empty')).toMatchObject({ lengthBucket: '0', tokens: [] })
  })
})
