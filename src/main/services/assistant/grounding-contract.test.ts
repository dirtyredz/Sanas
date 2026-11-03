import { expect, it } from 'vitest'
import { buildSystemPrompt } from './prompts'
import { COMPACT_CONTRACT } from './compact-contract'
import { CAPTURE_INSTRUCTION, TYPED_CAPTURE_INSTRUCTION } from './live-controls/capture-prompts'

it('grounds personal examples and reserves templates for preparation or More detail', () => {
  const system = buildSystemPrompt(null, [])
  expect(system).toContain('Never invent personal history')
  expect(system).toContain('Let me check the exact count.')
  expect(system).toContain('Which technology did you mean?')
  expect(system).toContain(
    'Reserve labelled fill-in templates for explicit preparation or More detail',
  )
})
it('uses the same compact runnable-code contract for automatic, typed and capture answers', () => {
  for (const prompt of [COMPACT_CONTRACT, CAPTURE_INSTRUCTION, TYPED_CAPTURE_INSTRUCTION]) {
    expect(prompt).toContain('80 prose words excluding code')
    expect(prompt).toContain('one runnable minimal replacement')
    expect(prompt).toContain('never redeclare')
    expect(prompt).toContain('More detail')
  }
})
