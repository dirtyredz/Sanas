import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IPC } from '../../../shared/ipc'

const fake = vi.hoisted(() => ({
  broadcast: undefined as undefined | ((channel: string, payload: unknown) => void),
  stt: undefined as any,
  state: { status: 'live', meetingId: 7 } as { status: string; meetingId: number | null },
  exit: vi.fn(),
  write: vi.fn(),
  save: vi.fn(),
  close: vi.fn(),
  destroy: vi.fn(),
  register: vi.fn(() => true),
  unregister: vi.fn(),
  realStart: vi.fn(async () => ({ sendAudio: vi.fn(), stop: vi.fn() })),
  devices: ['audioinput', 'audiooutput'],
}))
vi.mock('electron', () => ({
  app: { setName: vi.fn(), setPath: vi.fn(), whenReady: async () => {}, exit: fake.exit },
  BrowserWindow: { getAllWindows: () => [{ destroy: fake.destroy }] },
  globalShortcut: { register: fake.register, unregister: fake.unregister },
  dialog: {
    showMessageBox: async () => {
      await fake.stt.start({ channels: 2, onSignal: vi.fn() })
    },
  },
}))
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  mkdtempSync: () => '.tmp/live-test',
  writeFileSync: fake.write,
}))
vi.mock('./plan', () => ({
  loadLivePlan: () => ({
    version: 1,
    mode: 'live',
    name: 'Free check',
    persona: 'Client',
    durationMs: 10000,
    silenceMs: 500,
    topics: [{ id: 'one', question: 'When can we ship?', maxFollowUps: 0 }],
  }),
}))
vi.mock('../../config/settings', () => ({
  saveSettings: fake.save,
  loadSettings: () => ({ anthropicApiKey: 'stub', nudgeModel: 'stub' }),
}))
vi.mock('../../db', () => ({ openDb: async () => {}, closeDb: fake.close }))
vi.mock('../../db/repos/jobs', () => ({ createJob: vi.fn() }))
vi.mock('../../db/repos/meetings', () => ({ getMeeting: () => ({ summary: 'stub summary' }) }))
vi.mock('../../db/repos/segments', () => ({ listSegments: () => [] }))
vi.mock('../../db/repos/suggestions', () => ({ listSuggestions: () => [] }))
vi.mock('../../services/assistant/claude', () => ({
  claudeProvider: {
    complete: async () => '{"action":"next","text":"When can we ship?"}',
  },
}))
vi.mock('../../services/assistant/provider', () => ({ installRehearsalAssistant: vi.fn() }))
vi.mock('../../services/stt', () => ({
  installRehearsalStt: (p: unknown) => {
    fake.stt = p
  },
}))
vi.mock('../../services/stt/deepgram', () => ({
  deepgramProvider: { start: fake.realStart, transcribeFile: vi.fn() },
}))
vi.mock('../../windows/broadcast', () => ({
  observeRehearsalBroadcast: (fn: typeof fake.broadcast) => {
    fake.broadcast = fn
  },
}))
vi.mock('../../services/meetings/assist/diagnostics', () => ({
  observeRehearsalAssistance: vi.fn(),
}))
vi.mock('../../services/meetings', () => ({
  currentState: () => fake.state,
  stopMeeting: async () => {
    fake.state = { status: 'idle', meetingId: null }
  },
}))
vi.mock('../../services/meetings/status/post-processing', () => ({ isPostProcessing: () => false }))
vi.mock('../../ipc', () => ({ registerIpcHandlers: vi.fn() }))
vi.mock('../../system-audio', () => ({ registerSystemAudioLoopback: vi.fn() }))
vi.mock('../../windows/main-window', () => ({
  createMainWindow: () => ({
    webContents: {
      once: (_event: string, callback: () => void) => callback(),
      executeJavaScript: async () => fake.devices,
    },
  }),
}))
vi.mock('../../windows/overlay-window', () => ({ showOverlay: vi.fn() }))
vi.mock('../screens/desktop', () => ({
  RehearsalScreens: class {
    prepare = vi.fn()
    close = vi.fn()
  },
}))
vi.mock('./speech', () => ({
  speakWindows: async () => {
    // Free integration: simulated receipt through the same observer, no audio device opened.
    setTimeout(
      () =>
        fake.broadcast?.(IPC.TranscriptEvent, {
          meetingId: 7,
          isFinal: true,
          isUser: false,
          text: 'When can we ship?',
          tStartMs: 1,
          tEndMs: 100,
        }),
      10,
    )
    setTimeout(
      () =>
        fake.broadcast?.(IPC.TranscriptEvent, {
          meetingId: 7,
          isFinal: true,
          isUser: true,
          text: 'We can ship Friday.',
          tStartMs: 200,
          tEndMs: 400,
        }),
      100,
    )
  },
}))
import { runLiveRehearsal } from './run'

const originalArgv = [...process.argv]
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'performance'] })
  vi.spyOn(console, 'log')
  vi.spyOn(console, 'warn')
  vi.spyOn(console, 'error')
  vi.stubEnv('ANTHROPIC_API_KEY', 'stub')
  vi.stubEnv('DEEPGRAM_API_KEY', 'stub')
  process.argv = [
    ...originalArgv,
    '--rehearsal',
    `--rehearsal-root=${process.cwd()}`,
    '--scenario=stub',
  ]
  fake.state = { status: 'live', meetingId: 7 }
  fake.devices = ['audioinput', 'audiooutput']
})
afterEach(() => {
  process.argv = originalArgv
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
it('free live lifecycle drives a canned interviewer with simulated finals and closes the isolated session', async () => {
  const run = runLiveRehearsal()
  await vi.advanceTimersByTimeAsync(15000)
  await run
  expect(fake.exit).toHaveBeenCalledWith(0)
  const report = JSON.parse(fake.write.mock.calls[0][1])
  expect(report).toMatchObject({
    tier: 'live',
    passed: true,
    endReason: 'plan-complete',
    meetingId: 7,
  })
  expect(report.turns[0]).toMatchObject({ text: 'When can we ship?', producedSuggestion: false })
  expect(fake.realStart).toHaveBeenCalledWith(expect.objectContaining({ channels: 2 }))
  await expect(fake.stt.start({ channels: 1 })).rejects.toThrow('This PC')
  expect(fake.save).toHaveBeenLastCalledWith({
    deepgramApiKey: '',
    anthropicApiKey: '',
    anthropicWorkspaceId: '',
  })
  expect(fake.unregister).toHaveBeenCalledTimes(3)
  expect(fake.close).toHaveBeenCalledOnce()
  expect(fake.destroy).toHaveBeenCalledOnce()
})
it('fails device preflight before opening STT and still cleans up', async () => {
  fake.devices = ['audiooutput']
  const run = runLiveRehearsal()
  await vi.advanceTimersByTimeAsync(15000)
  await run
  expect(fake.exit).toHaveBeenCalledWith(1)
  expect(fake.realStart).not.toHaveBeenCalled()
  expect(JSON.parse(fake.write.mock.calls[0][1]).error).toContain('audio-device-preflight')
  expect(fake.close).toHaveBeenCalledOnce()
})
it('rejects a normal launch before any profile or device work', async () => {
  process.argv = originalArgv
  await expect(runLiveRehearsal()).rejects.toThrow('Rehearsal mode required')
  expect(fake.save).not.toHaveBeenCalled()
})
