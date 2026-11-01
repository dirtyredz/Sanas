import { expect, it } from 'vitest'
import type { CaptureStatus } from '@shared/live-controls/capture'
import { captureNotice, isCapturing, newerStatus } from './capture-status'

const status = (over: Partial<CaptureStatus>): CaptureStatus => ({
  meetingId: 1,
  phase: 'capturing',
  message: 'Capturing…',
  seq: 1,
  ...over,
})

it('shows capturing, analysing while the answer streams, and readable failures', () => {
  expect(captureNotice(status({}), 1, false)).toEqual({ text: 'Capturing…', failed: false })
  const analyzing = status({ phase: 'analyzing', message: 'Screen captured: Laptop — analyzing…' })
  expect(captureNotice(analyzing, 1, true)?.text).toContain('Laptop')
  expect(captureNotice(analyzing, 1, false)).toBeNull() // the answer finished
  expect(captureNotice(status({ phase: 'failed', message: 'empty capture' }), 1, false)).toEqual({
    text: 'empty capture',
    failed: true,
  })
  // a shortcut with no meeting reports against no meeting, and is still shown
  expect(captureNotice(status({ meetingId: null, phase: 'failed' }), null, false)?.failed).toBe(
    true,
  )
})

it('never shows another meeting’s feedback, or idle', () => {
  expect(captureNotice(status({ meetingId: 2 }), 1, false)).toBeNull()
  expect(captureNotice(status({ phase: 'idle' }), 1, false)).toBeNull()
  expect(captureNotice(null, 1, false)).toBeNull()
})

it('keeps the newest status when a late fetch arrives', () => {
  const late = status({ seq: 1 })
  const fresh = status({ seq: 3, phase: 'analyzing' })
  expect(newerStatus(fresh, late)).toBe(fresh)
  expect(newerStatus(late, fresh)).toBe(fresh)
  expect(newerStatus(null, late)).toBe(late)
})

it('reports capturing only for this meeting', () => {
  expect(isCapturing(status({}), 1)).toBe(true)
  expect(isCapturing(status({}), 2)).toBe(false)
  expect(isCapturing(status({ phase: 'analyzing' }), 1)).toBe(false)
  expect(isCapturing(null, 1)).toBe(false)
})
