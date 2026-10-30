import { expect, it } from 'vitest'
import { parsePresentation } from './presentation-import'
it('imports both heading styles in input order, BOM/CRLF and multiline labelled content', () => {
  const result = parsePresentation(
    '\uFEFF## First\r\nTalking point:\r\none\r\ntwo\r\nScript: words\r\nmore words\r\n09 / Last\r\npoint\r\nKey facts: fact',
  )
  expect(result.error).toBe('')
  expect(result.slides.map((s) => s.title)).toEqual(['First', 'Last'])
  expect(result.slides[0].talkingPoint).toBe('one\ntwo')
  expect(result.slides[0].script).toBe('words\nmore words')
  expect(result.slides[1].keyFacts).toBe('fact')
})
it('preserves preambles, repeated labels, fenced and escaped content, and unknown labels', () => {
  const result = parsePresentation(
    'Preamble\nbody\n## Slide\npoint\nScript: first\nScript: second\n```\n## literal\nKey facts: literal\n```\n\\## escaped\nUnknown: literal',
  )
  expect(result.slides).toHaveLength(2)
  expect(result.warnings).toHaveLength(2)
  expect(result.slides[1].script).toBe(
    'first\nsecond\n```\n## literal\nKey facts: literal\n```\n## escaped\nUnknown: literal',
  )
})
it('handles heading-free text and exposes invalid drafts without truncating', () => {
  expect(parsePresentation('Title\npoint').slides[0].talkingPoint).toBe('point')
  expect(parsePresentation('Only').warnings).toHaveLength(1)
  expect(parsePresentation('## Empty').error).toContain('required')
  const long = 'x'.repeat(12001)
  const result = parsePresentation(`## Title\npoint\nScript: ${long}`)
  expect(result.slides[0].script).toBe(long)
  expect(result.error).toContain('12000')
})
