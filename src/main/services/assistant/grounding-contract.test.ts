import { expect, it } from 'vitest'
import { buildSystemPrompt } from './prompts'
import { COMPACT_CONTRACT } from './compact-contract'
import { CAPTURE_INSTRUCTION, TYPED_CAPTURE_INSTRUCTION } from './live-controls/capture-prompts'

it('grounds personal examples and gives missing facts an explicit placeholder', () => {
  const system = buildSystemPrompt(null, [])
  expect(system).toContain('Never invent personal history')
  expect(system).toContain('[your example: a time you resolved a design disagreement]')
})
it('uses the same compact runnable-code contract for automatic, typed and capture answers', () => {
  for (const prompt of [COMPACT_CONTRACT, CAPTURE_INSTRUCTION, TYPED_CAPTURE_INSTRUCTION]) {
    expect(prompt).toContain('80 prose words excluding code')
    expect(prompt).toContain('one runnable minimal replacement')
    expect(prompt).toContain('never redeclare')
    expect(prompt).toContain('More detail')
  }
})
