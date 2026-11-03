import { expect, it } from 'vitest'
import { interviewAfterAttachment } from './interview-selection'
const resume = { name: 'Resume', text: 'Java' }
it('enables Interview on attachment and preserves explicit off while editing or removing it', () => {
  expect(interviewAfterAttachment(false, null, resume)).toBe(true)
  expect(interviewAfterAttachment(false, resume, { ...resume, text: 'TypeScript' })).toBe(false)
  expect(interviewAfterAttachment(false, resume, null)).toBe(false)
  expect(interviewAfterAttachment(true, resume, null)).toBe(true)
})
