import type { PresentationHistory, PresentationState, Slide } from '@shared/presentation/types'
import { EMPTY_PRESENTATION } from '../lib/meeting/presentation-state'
const decks = new Map<number, Slide[]>()
const histories = new Map<number, PresentationHistory>()
const listeners = new Set<(state: PresentationState) => void>()
let state = EMPTY_PRESENTATION
function publish(): void {
  listeners.forEach((cb) => cb(structuredClone(state)))
}
export function beginMockPresentation(id: number, jobId: number): void {
  const slides = structuredClone(decks.get(jobId) ?? [])
  histories.set(id, {
    slides,
    versions: { 0: slides },
    events: slides.length ? [{ deckVersion: 0, revision: 1, ordinal: 0, tMs: 0 }] : [],
  })
  state = {
    meetingId: id,
    revision: slides.length ? 1 : 0,
    deckVersion: 0,
    count: slides.length,
    ordinal: 0,
    current: slides[0] ?? null,
    next: slides[1] ?? null,
  }
  publish()
}
export function endMockPresentation(): void {
  state = EMPTY_PRESENTATION
  publish()
}
export function replaceMockPresentation(
  id: number,
  slides: Slide[],
  version: number,
  ordinal: number,
  expected: number,
): void {
  if (state.meetingId !== id || state.revision !== expected)
    throw new Error('Slide changed. Reload before applying.')
  const history = histories.get(id)!
  history.slides = structuredClone(slides)
  history.versions![version] = history.slides
  state = {
    meetingId: id,
    deckVersion: version,
    revision: state.revision + 1,
    count: slides.length,
    ordinal,
    current: slides[ordinal] ?? null,
    next: slides[ordinal + 1] ?? null,
  }
  history.events.push({
    revision: state.revision,
    deckVersion: version,
    ordinal: slides.length ? ordinal : null,
    tMs: 0,
  })
  publish()
}
export const mockPresentation: Window['sanas']['presentation'] = {
  getJobSlides: async (id) => structuredClone(decks.get(id) ?? []),
  replaceJobSlides: async (id, slides) => {
    decks.set(id, structuredClone(slides))
    return structuredClone(slides)
  },
  getState: async () => structuredClone(state),
  move: async (request) => {
    if (request.meetingId !== state.meetingId) throw new Error('This meeting is no longer active.')
    const ordinal = state.ordinal + (request.direction === 'next' ? 1 : -1)
    if (ordinal < 0 || ordinal >= state.count) return structuredClone(state)
    const history = histories.get(request.meetingId)!,
      slides = history.slides
    state = {
      ...state,
      ordinal,
      revision: state.revision + 1,
      current: slides[ordinal],
      next: slides[ordinal + 1] ?? null,
    }
    history.events.push({
      revision: state.revision,
      deckVersion: state.deckVersion,
      ordinal,
      tMs: 0,
    })
    publish()
    return structuredClone(state)
  },
  getHistory: async (id) => structuredClone(histories.get(id) ?? { slides: [], events: [] }),
  onChanged: (cb) => {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
    }
  },
}
