import { expect, it } from 'vitest'
import { mockStartInput } from './mock-interview-validation'
it('accepts only shipped plans, a real job ID and stereo topology', () => {
  expect(mockStartInput('interview', 7, 2)).toEqual({
    plan: 'interview',
    job: 7,
    channels: 2,
  })
  for (const args of [
    ['../../secret', 7, 2],
    ['client-qa', -1, 2],
    ['interview', '7', 2],
    ['interview', 7, 1],
    ['interview', 7, '2'],
  ])
    expect(() => mockStartInput(...(args as [unknown, unknown, unknown]))).toThrow()
})
