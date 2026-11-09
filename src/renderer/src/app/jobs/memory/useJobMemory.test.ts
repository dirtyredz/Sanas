import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { JobMemoryView } from '@shared/jobs/memory'
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
}))
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const i = hooks.cursor++
    if (!(i in hooks.slots)) hooks.slots[i] = initial
    return [
      hooks.slots[i],
      (v: unknown) => {
        hooks.slots[i] = v
      },
    ]
  },
  useRef: (initial: unknown) => {
    const i = hooks.cursor++
    return (hooks.slots[i] ??= { current: initial })
  },
  useCallback: (fn: unknown) => {
    const i = hooks.cursor++
    return (hooks.slots[i] ??= fn)
  },
  useEffect: (fn: () => void | (() => void)) => {
    hooks.effects.push(fn)
  },
}))
import { useJobMemory } from './useJobMemory'
const get = vi.fn()
const view = (revision = 0, text = 'saved'): JobMemoryView => ({
  approved: { revision, text, updatedAt: null },
  eligible: true,
  proposals: [
    {
      meetingId: 1,
      jobId: 2,
      title: 'Source',
      startedAt: '2026-11-01',
      fingerprint: 'fp',
      baseRevision: revision,
      generation: `g${revision}`,
      text: 'proposed',
      status: 'pending',
    },
  ],
})
function render(job = 2) {
  hooks.cursor = 0
  hooks.effects = []
  return useJobMemory(job)
}
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
let cleanup: (() => void) | void
beforeEach(() => {
  vi.useFakeTimers()
  hooks.slots = []
  get.mockReset()
  vi.stubGlobal('window', {
    sanas: { memory: { get } },
    setInterval,
    clearInterval,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('preserves dirty text and its original revision/identity across polling and stale saves', async () => {
  get.mockResolvedValue(view())
  render()
  cleanup = hooks.effects[0]()
  await flush()
  let state = render()
  state.editDraft('my edit')
  state.editProposal('edited approval')
  get.mockResolvedValue(view(1, 'other window'))
  await vi.advanceTimersByTimeAsync(2500)
  state = render()
  expect(state.draft).toBe('my edit')
  expect(state.draftRevision).toBe(0)
  expect(state.proposalIdentity?.generation).toBe('g0')
  expect(state.proposal).toBe('edited approval')
  await state.run(async () => {
    throw new Error('Memory changed')
  })
  state = render()
  expect(state.draft).toBe('my edit')
  expect(state.error).toContain('Memory changed')
  await state.run(async () => view(1))
  state = render()
  expect(state.dirty).toBe(false)
  expect(state.draftRevision).toBe(1)
})
it('ignores a late response from the previous job', async () => {
  let old!: (v: JobMemoryView) => void
  get
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          old = r
        }),
    )
    .mockResolvedValue(view(0, 'new job'))
  render(2)
  cleanup = hooks.effects[0]()
  cleanup?.()
  render(3)
  cleanup = hooks.effects[0]()
  await flush()
  old(view(9, 'old job'))
  await flush()
  expect(render(3).draft).toBe('new job')
})
