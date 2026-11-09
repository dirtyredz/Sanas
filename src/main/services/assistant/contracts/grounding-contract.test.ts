import { expect, it } from 'vitest'
import { buildSystemPrompt } from '../prompts/prompts'
import { COMPACT_CONTRACT } from './compact-contract'
import { CAPTURE_INSTRUCTION, TYPED_CAPTURE_INSTRUCTION } from '../live-controls/capture-prompts'

it('always gives a speakable answer, builds on facts and marks improvised filler', () => {
  const system = buildSystemPrompt(null, []).replace(/\s+/g, ' ')
  expect(system).toContain('Always give a usable, speakable answer')
  expect(system).toContain('build on them and never contradict one')
  expect(system).toContain('plausible first-person answer the user can')
  expect(system).toContain('a payments integration where I owned the API layer')
  expect(system).toContain('no exact metrics, named employers or clients')
  expect(system).toContain('Wrap every phrase that is NOT supported')
  expect(system).toContain('⟨ and ⟩')
  expect(system).toContain('speakable when the markers are removed')
  expect(system).toContain('Which technology did you mean?')
})
it('drops the old stall, limitation-notice and placeholder-template rules', () => {
  const system = buildSystemPrompt(null, []).replace(/\s+/g, ' ')
  expect(system).not.toContain('No resume attached')
  expect(system).not.toContain('Never invent personal history')
  expect(system).not.toContain('Reserve labelled fill-in templates')
  expect(system).not.toContain('Never substitute a content-free stall')
  // the only mention of the old deflection is the prohibition itself
  expect(system).toContain('never say "Let me check the exact count"')
  expect(system).not.toContain('give a short truthful reply such as')
})
it('uses the same compact runnable-code contract for automatic, typed and capture answers', () => {
  for (const prompt of [COMPACT_CONTRACT, CAPTURE_INSTRUCTION, TYPED_CAPTURE_INSTRUCTION]) {
    expect(prompt).toContain('80 prose words excluding code')
    expect(prompt).toContain('one runnable minimal replacement')
    expect(prompt).toContain('never redeclare')
    expect(prompt).toContain('More detail')
  }
})
