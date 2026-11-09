import { expect, it, vi } from 'vitest'
import { bridgeCapture } from './capture-clock'

it('drops pre-activation messages, forwards only its probes, and cleans up a stopped bridge', async () => {
  let probe!: (p: { generation: string; nonce: number }) => void
  const off = vi.fn()
  const api = {
    getState: async () => ({ status: 'live', meetingId: 7 }),
    bindCapture: vi.fn(async () => true),
    stopCapture: vi.fn(),
    onCaptureProbe: (cb: typeof probe) => {
      probe = cb
      return off
    },
    sendAudio: vi.fn(),
    captureReply: vi.fn(),
  }
  const port = { postMessage: vi.fn(), onmessage: null as null | ((e: unknown) => void) }
  const bridge = bridgeCapture(
    port as unknown as MessagePort,
    'g',
    api as unknown as typeof window.sanas.meeting,
  )
  port.onmessage!({ data: { generation: 'g', pcm: new ArrayBuffer(2) } })
  expect(api.sendAudio).not.toHaveBeenCalled()
  await bridge.activate()
  probe({ generation: 'old', nonce: 1 })
  probe({ generation: 'g', nonce: 2 })
  expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({ generation: 'g', nonce: 2 })
  port.onmessage!({ data: { generation: 'g', pcm: new ArrayBuffer(2) } })
  expect(api.sendAudio).toHaveBeenCalledOnce()
  bridge.stop()
  expect(off).toHaveBeenCalledOnce()
  expect(port.onmessage).toBeNull()
  probe({ generation: 'g', nonce: 3 })
  expect(port.postMessage).toHaveBeenCalledOnce()
})

it('does not adopt capture lost while main is binding it', async () => {
  let finish!: (accepted: boolean) => void
  const api = {
    getState: async () => ({ status: 'live', meetingId: 7 }),
    bindCapture: vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        }),
    ),
    stopCapture: vi.fn(),
    onCaptureProbe: () => () => {},
    sendAudio: vi.fn(),
    captureReply: vi.fn(),
  }
  const port = { postMessage: vi.fn(), onmessage: null }
  const bridge = bridgeCapture(
    port as unknown as MessagePort,
    'g',
    api as unknown as typeof window.sanas.meeting,
  )
  const activation = bridge.activate()
  await Promise.resolve()
  bridge.stop()
  finish(true)
  await expect(activation).rejects.toThrow('Capture stopped')
  expect(api.stopCapture).toHaveBeenLastCalledWith('g')
})
