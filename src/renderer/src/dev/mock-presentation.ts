import type { Slide } from '@shared/presentation/types'
import { EMPTY_PRESENTATION } from '../lib/meeting/presentation-state'

const decks = new Map<number, Slide[]>()
export const mockPresentation: Window['sanas']['presentation'] = {
  getJobSlides: async (id) => structuredClone(decks.get(id) ?? []),
  replaceJobSlides: async (id, slides) => {
    decks.set(id, structuredClone(slides))
    return structuredClone(slides)
  },
  getState: async () => EMPTY_PRESENTATION,
  move: async () => EMPTY_PRESENTATION,
  getHistory: async () => ({ slides: [], events: [] }),
  onChanged: () => () => {},
}
