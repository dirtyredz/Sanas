import { expect, it } from 'vitest'
import { interviewApplies } from './meeting-start'

it('defaults to the job resume, lets an explicit choice win, and always applies for practice', () => {
  expect(interviewApplies(undefined, true)).toBe(true)
  expect(interviewApplies(undefined, false)).toBe(false)
  expect(interviewApplies(false, true)).toBe(false)
  expect(interviewApplies(true, false)).toBe(true)
  expect(interviewApplies(false, false, true)).toBe(true)
})
