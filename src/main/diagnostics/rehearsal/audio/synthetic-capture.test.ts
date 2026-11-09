import { expect, it, vi } from 'vitest'
import type { CaptureProbe, CaptureFrame, CaptureReply } from '@shared/meeting/audio-capture'
const mock = vi.hoisted(() => ({
  state: { status: 'live', meetingId: 7 },
  bind: vi.fn((_id: number, _generation: string, _cb: (p: CaptureProbe) => void) => true),
  send: vi.fn((_frame: CaptureFrame) => {}),
  reply: vi.fn((_reply: CaptureReply) => {}),
  stop: vi.fn(),
}))
vi.mock('../../../services/meetings', () => ({
  currentState: () => mock.state,
  bindAudioCapture: mock.bind,
  sendCapturedAudio: mock.send,
  receiveCaptureReply: mock.reply,
  stopAudioCapture: mock.stop,
}))
import { SyntheticCapture } from './synthetic-capture'

it('labels synthetic sample positions, replies only on the next quantum, and retires paused capture', () => {
  let probe!: (p: CaptureProbe) => void
  mock.bind.mockImplementation((_id, _generation, cb) => {
    probe = cb
    return true
  })
  const capture = new SyntheticCapture()
  capture.push(Buffer.alloc(1280), 2)
  const first = mock.send.mock.calls[0][0]
  expect(first).toMatchObject({ startFrame: 0, endFrame: 320, channels: 2 })
  probe({ generation: first.generation, nonce: 1 })
  expect(mock.reply).not.toHaveBeenCalled()
  capture.push(Buffer.alloc(1280), 2)
  expect(mock.reply.mock.calls[0][0]).toMatchObject({ outputFrame: 640, quantumFrames: 320 })
  mock.state.status = 'paused'
  capture.push(Buffer.alloc(1280), 2)
  expect(mock.stop).toHaveBeenCalledWith(first.generation)
  expect(mock.send).toHaveBeenCalledTimes(2)
  capture.stop()
})
