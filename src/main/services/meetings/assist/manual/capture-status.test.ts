import { expect, it, vi } from 'vitest'
import { CaptureStatusBroadcaster } from './capture-status'

it('stamps a rising seq, publishes each update and keeps the latest for late readers', () => {
  const publish = vi.fn()
  const status = new CaptureStatusBroadcaster(publish)
  expect(status.get()).toEqual({ meetingId: null, phase: 'idle', message: '', seq: 0 })
  status.set(4, 'capturing', 'Capturing…')
  status.set(4, 'failed', 'nope')
  expect(publish).toHaveBeenCalledTimes(2)
  expect(status.get()).toEqual({ meetingId: 4, phase: 'failed', message: 'nope', seq: 2 })
})

it('clear goes idle only when there is feedback to clear', () => {
  const publish = vi.fn()
  const status = new CaptureStatusBroadcaster(publish)
  status.clear()
  expect(publish).not.toHaveBeenCalled()
  status.set(1, 'analyzing', 'x')
  status.clear()
  expect(status.get()).toEqual({ meetingId: null, phase: 'idle', message: '', seq: 2 })
})
