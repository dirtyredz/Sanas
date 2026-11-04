import type { PresentationHistory } from '@shared/presentation/types'

// Presentation mode is retired: the preview only serves recorded (historical) slide history.
const histories = new Map<number, PresentationHistory>()

export const mockPresentation: Window['sanas']['presentation'] = {
  getHistory: async (id) => structuredClone(histories.get(id) ?? { slides: [], events: [] }),
}
