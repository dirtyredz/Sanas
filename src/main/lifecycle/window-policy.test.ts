import { beforeEach, expect, it, vi } from 'vitest'
import type { MeetingObservation } from '../services/meetings/observation/meeting-observation'

const f = vi.hoisted(() => ({
  quit: vi.fn(),
  hideOverlay: vi.fn(),
  closed: null as (() => void) | null,
  observe: null as ((e: MeetingObservation) => void) | null,
}))
vi.mock('electron', () => ({ app: { quit: f.quit } }))
vi.mock('../windows/overlay-window', () => ({ hideOverlay: f.hideOverlay }))
vi.mock('../windows/main-window', () => ({
  onMainWindowClosed: (handler: () => void) => {
    f.closed = handler
  },
}))
vi.mock('../services/meetings/observation/meeting-observation', () => ({
  subscribeMeeting: (listener: (e: MeetingObservation) => void) => {
    f.observe = listener
    return () => undefined
  },
}))

import { registerWindowPolicy } from './window-policy'

const state = (status: string, meetingId: number | null): MeetingObservation =>
  ({ kind: 'state', value: { status, meetingId } }) as MeetingObservation

beforeEach(() => {
  vi.clearAllMocks()
  registerWindowPolicy()
})

it('quits Sanas when the main window closes', () => {
  expect(f.quit).not.toHaveBeenCalled()
  f.closed?.()
  expect(f.quit).toHaveBeenCalledOnce()
})

it('hides the overlay when a meeting ends, never on live, pause or resume', () => {
  f.observe?.(state('live', 7))
  f.observe?.(state('paused', 7))
  f.observe?.(state('live', 7))
  f.observe?.({ kind: 'signal', value: {} } as MeetingObservation)
  expect(f.hideOverlay).not.toHaveBeenCalled()
  f.observe?.(state('idle', null))
  expect(f.hideOverlay).toHaveBeenCalledOnce()
})
