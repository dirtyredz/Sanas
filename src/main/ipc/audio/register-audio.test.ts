import { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  handles: new Map<string, (...args: any[]) => any>(),
  events: new Map<string, (...args: any[]) => any>(),
  bind: vi.fn(() => true),
  stop: vi.fn(),
  reply: vi.fn(),
  send: vi.fn(),
  invalid: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (key: string, cb: (...args: any[]) => any) => mocks.handles.set(key, cb),
    on: (key: string, cb: (...args: any[]) => any) => mocks.events.set(key, cb),
  },
}))
vi.mock('../../services/meetings', () => ({
  bindAudioCapture: mocks.bind,
  stopAudioCapture: mocks.stop,
  receiveCaptureReply: mocks.reply,
  sendCapturedAudio: mocks.send,
  invalidCaptureMetadata: mocks.invalid,
}))
import { registerAudioIpc } from './register-audio'
import { IPC } from '@shared/ipc'
beforeEach(() => {
  vi.clearAllMocks()
  registerAudioIpc()
})

it('binds the sender, rejects foreign audio, and bounds crash/reload listeners across resumes', () => {
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    send: vi.fn(),
    isDestroyed: () => false,
  })
  const event = { sender }
  const bind = mocks.handles.get(IPC.CaptureBind)!
  expect(bind(event, 7, 'g')).toBe(true)
  expect(bind(event, 7, 'next')).toBe(true)
  expect(sender.listenerCount('destroyed')).toBe(1)
  sender.emit('render-process-gone')
  expect(mocks.stop).toHaveBeenLastCalledWith('next')
  const frame = {
    generation: 'next',
    sequence: 0,
    startFrame: 0,
    endFrame: 1,
    sourceEndFrame: 1,
    sourceRate: 16000,
    channels: 1,
    pcm: new ArrayBuffer(2),
  }
  mocks.events.get(IPC.AudioChunk)!({ sender: { id: 2 } }, frame)
  expect(mocks.send).not.toHaveBeenCalled()
  mocks.events.get(IPC.AudioChunk)!(event, frame)
  expect(mocks.send).toHaveBeenCalledOnce()
  mocks.events.get(IPC.AudioChunk)!(event, { ...frame, pcm: new ArrayBuffer(3) })
  expect(mocks.invalid).toHaveBeenCalledWith('next')
  mocks.events.get(IPC.CaptureStop)!(event, 'g')
  expect(mocks.stop).toHaveBeenCalledOnce()
})
