import { afterEach, expect, it, vi } from 'vitest'
import type { SuggestionView } from '../../lib/suggestions/whisper-history'

const hooks = vi.hoisted(() => ({ effects: [] as (() => (() => void) | void)[] }))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => (() => void) | void) => hooks.effects.push(effect),
  useRef: (current: unknown) => ({ current }),
}))
import { useSuggestionVisibilityAck } from './useSuggestionVisibilityAck'

afterEach(() => {
  hooks.effects = []
  vi.unstubAllGlobals()
})

it('acknowledges selected readable content only in the post-commit frame, tagging unselected/hidden content', () => {
  const acknowledgeVisibility = vi.fn().mockResolvedValue(undefined)
  const frames: (() => void)[] = []
  const cancel = vi.fn()
  vi.stubGlobal('window', { sanas: { assist: { acknowledgeVisibility } } })
  vi.stubGlobal('document', { hidden: false })
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const selected = {
    meetingId: 7,
    suggestionId: 1,
    text: '**Readable answer**',
    error: null,
  } as unknown as SuggestionView
  const other = { ...selected, suggestionId: 2 }
  const items = [selected, other, { ...selected, suggestionId: 3, text: '**' }]
  useSuggestionVisibilityAck(items, selected)
  expect(acknowledgeVisibility).not.toHaveBeenCalled()
  const cleanup = hooks.effects[0]()
  expect(acknowledgeVisibility).toHaveBeenCalledExactlyOnceWith({
    meetingId: 7,
    runId: 2,
    state: 'unselected',
  })
  expect(frames).toHaveLength(1)
  frames[0]()
  expect(acknowledgeVisibility).toHaveBeenLastCalledWith({
    meetingId: 7,
    runId: 1,
    state: 'frame-after-commit',
  })
  cleanup?.()
  expect(cancel.mock.calls.map(([id]) => id)).toEqual([1])
  vi.stubGlobal('document', { hidden: true })
  useSuggestionVisibilityAck(items, selected)
  hooks.effects[1]()
  expect(acknowledgeVisibility).toHaveBeenCalledWith({ meetingId: 7, runId: 1, state: 'hidden' })
})
