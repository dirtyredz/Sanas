import { globalShortcut, type WebContents } from 'electron'
import { IPC } from '@shared/ipc'
import type { MockPlanId, MockSetup, MockState } from '@shared/mock-interview/types'
import { loadSettings } from '../../config/settings'
import { getJob } from '../../db/repos/jobs'
import { saveMockResult } from '../../db/repos/practice'
import { broadcast } from '../../windows/broadcast'
import { closeInterviewer, openInterviewer } from '../../windows/interviewer-window'
import { showOverlay } from '../../windows/overlay-window'
import { claudeProvider } from '../assistant/claude'
import { currentState, meetingAudioMs, startMeeting, stopMeeting } from '../meetings'
import { subscribeMeeting } from '../meetings/observation'
import { subscribeRuns } from '../meetings/assist/run-observation'
import { subscribeAssistance } from '../meetings/assist/diagnostics'
import { createInterviewer } from './interviewer'
import { plans, fixtureData } from './catalog'
import { MockSession } from './session'

let session: MockSession | undefined
export function mockSetup(): MockSetup {
  const s = loadSettings()
  return {
    plans: (Object.entries(plans) as [MockPlanId, typeof plans.interview][]).map(([id, p]) => ({
      id,
      name: p.name,
      persona: p.persona,
    })),
    missingKeys: [!s.anthropicApiKey && 'Claude', !s.deepgramApiKey && 'Deepgram'].filter(
      Boolean,
    ) as string[],
  }
}
export function mockState(): MockState {
  return (
    session?.state() ?? {
      meetingId: null,
      status: 'idle',
      persona: '',
      caption: '',
      share: null,
      speech: null,
      result: null,
    }
  )
}
export async function startMock(
  planId: MockPlanId,
  jobId: number,
  channels: number,
  owner: WebContents,
): Promise<MockState> {
  if (channels !== 2)
    throw new Error(
      'Mock interviews need This PC microphone and system audio. Check your default output and try again.',
    )
  if (!['idle', 'ended'].includes(mockState().status) || currentState().meetingId !== null)
    throw new Error('End the current meeting before starting a mock interview.')
  const missing = mockSetup().missingKeys
  if (missing.length) throw new Error(`Add ${missing.join(' and ')} API keys in Settings.`)
  if (!getJob(jobId)) throw new Error('Choose an existing job.')
  const settings = loadSettings(),
    epoch = performance.now()
  const own = new MockSession(
    plans[planId],
    createInterviewer(claudeProvider, {
      apiKey: settings.anthropicApiKey,
      workspaceId: settings.anthropicWorkspaceId,
      model: settings.nudgeModel,
    }),
    {
      start: (id) => startMeeting(id, 2, true),
      stop: stopMeeting,
      audioNow: meetingAudioMs,
      open: async (onClose) => {
        await openInterviewer(onClose)
        showOverlay()
      },
      close: closeInterviewer,
      subscribeMeeting,
      subscribeRuns,
      subscribeAssistance,
      share: fixtureData,
      publish: (state) => {
        if (session === own) broadcast(IPC.MockChanged, state)
      },
      save: saveMockResult,
      now: () => Math.round(performance.now() - epoch),
      observeOwner: (closed) => {
        owner.once('destroyed', closed)
        owner.once('render-process-gone', closed)
        return () => {
          owner.removeListener('destroyed', closed)
          owner.removeListener('render-process-gone', closed)
        }
      },
      controls: (actions) => {
        const keys: string[] = []
        const release = (): void => {
          for (const key of keys.splice(0)) globalShortcut.unregister(key)
        }
        try {
          for (const [key, action] of [
            ['CommandOrControl+Alt+Right', actions.skip],
            ['CommandOrControl+Alt+End', actions.end],
            ['CommandOrControl+Alt+Backspace', actions.dismiss],
          ] as const) {
            if (!globalShortcut.register(key, action))
              throw new Error(`Mock interview shortcut unavailable: ${key}`)
            keys.push(key)
          }
        } catch (e) {
          release()
          throw e
        }
        // Shortcuts are released at End, independently of late suggestion observation.
        const unsubscribe = subscribeMeeting((e) => {
          if (e.kind === 'state' && e.value.status !== 'live') release()
        })
        return () => {
          release()
          unsubscribe()
        }
      },
    },
  )
  session = own
  await own.start(jobId)
  return own.state()
}
export const endMock = (): Promise<void> => session?.end() ?? Promise.resolve()
export const skipMock = (): void => session?.skip()
export const dismissMockShare = (): void => session?.dismiss()
export const mockSpeechDone = (id: number, ok: boolean): void => session?.acknowledge(id, ok)
