import { beforeEach, expect, it, vi } from 'vitest'
import type { MeetingObservation } from '../meetings/observation/meeting-observation'

const mock = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  unsubscribe: vi.fn(),
  listener: undefined as ((event: MeetingObservation) => void) | undefined,
}))
vi.mock('electron', () => ({
  globalShortcut: { register: mock.register, unregister: mock.unregister },
}))
vi.mock('../meetings/observation/meeting-observation', () => ({
  subscribeMeeting: (listener: (event: MeetingObservation) => void) => {
    mock.listener = listener
    return mock.unsubscribe
  },
}))
import { registerMockShortcuts } from './shortcuts'

beforeEach(() => {
  vi.resetAllMocks()
  mock.listener = undefined
  mock.register.mockReturnValue(true)
})
const actions = { skip: vi.fn(), end: vi.fn(), dismiss: vi.fn() }

it('binds controls and releases shortcuts when the meeting ends, before observation cleanup', () => {
  const close = registerMockShortcuts(actions)
  expect(mock.register.mock.calls.map(([key, action]) => [key, action])).toEqual([
    ['CommandOrControl+Alt+Right', actions.skip],
    ['CommandOrControl+Alt+End', actions.end],
    ['CommandOrControl+Alt+Backspace', actions.dismiss],
  ])
  mock.listener?.({ kind: 'state', value: { status: 'idle', meetingId: null } })
  expect(mock.unregister).toHaveBeenCalledTimes(3)
  expect(mock.unsubscribe).not.toHaveBeenCalled()
  close()
  expect(mock.unregister).toHaveBeenCalledTimes(3)
  expect(mock.unsubscribe).toHaveBeenCalledOnce()
})

it('rolls back only shortcuts it registered if a later key is unavailable', () => {
  mock.register.mockReturnValueOnce(true).mockReturnValueOnce(false)
  expect(() => registerMockShortcuts(actions)).toThrow(
    'Mock interview shortcut unavailable: CommandOrControl+Alt+End',
  )
  expect(mock.unregister.mock.calls).toEqual([['CommandOrControl+Alt+Right']])
  expect(mock.listener).toBeUndefined()
})
