import { afterEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('../../../audio/mic', () => ({ startCapture: mock.capture }))
import { startCapturedMeeting } from './start-captured-meeting'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('opens the normal This PC path and releases mono fallback before starting a practice meeting', async () => {
  const stop = vi.fn(),
    open = vi.fn()
  vi.stubGlobal('window', {
    sanas: {
      meeting: { getState: async () => ({ meetingId: null }) },
      settings: { set: vi.fn(async () => ({ audioDeviceId: 'device' })) },
    },
  })
  mock.capture.mockResolvedValue({ channels: 1, stop })
  await expect(startCapturedMeeting('this-pc', open, () => true, true)).rejects.toThrow(
    'System audio is unavailable',
  )
  expect(mock.capture).toHaveBeenCalledWith('device', true)
  expect(open).not.toHaveBeenCalled()
  expect(stop).toHaveBeenCalledOnce()
})
it('adopts successful stereo and releases capture when main rejects setup', async () => {
  const stop = vi.fn()
  vi.stubGlobal('window', {
    sanas: {
      meeting: { getState: async () => ({ meetingId: null }) },
      settings: { set: async () => ({ audioDeviceId: '' }) },
    },
  })
  mock.capture.mockResolvedValue({ channels: 2, activate: vi.fn(), stop })
  await expect(
    startCapturedMeeting(
      'this-pc',
      async () => {
        throw new Error('Missing key')
      },
      () => true,
      true,
    ),
  ).rejects.toThrow('Missing key')
  expect(stop).toHaveBeenCalledOnce()
  const opened = await startCapturedMeeting(
    'this-pc',
    async () => 'live',
    () => true,
    true,
  )
  expect(opened.capture.channels).toBe(2)
  expect(stop).toHaveBeenCalledOnce()
})

it('refuses an existing meeting and simultaneous Start from the other mounted tab', async () => {
  const getState = vi.fn(async () => ({ meetingId: 7 as number | null }))
  vi.stubGlobal('window', {
    sanas: { meeting: { getState }, settings: { set: async () => ({ audioDeviceId: '' }) } },
  })
  await expect(startCapturedMeeting('this-pc', vi.fn(), () => true)).rejects.toThrow(
    'End the current meeting',
  )
  expect(mock.capture).not.toHaveBeenCalled()
  getState.mockResolvedValue({ meetingId: null })
  mock.capture.mockResolvedValue({ channels: 2, activate: vi.fn(), stop: vi.fn() })
  let finish!: (value: string) => void
  const first = startCapturedMeeting(
    'this-pc',
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
    () => true,
  )
  await expect(startCapturedMeeting('elsewhere', vi.fn(), () => true)).rejects.toThrow(
    'Another meeting is starting',
  )
  await vi.waitFor(() => expect(finish).toBeDefined())
  finish('live')
  await first
})
