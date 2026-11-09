import { DeepgramSession } from '../stt/deepgram/deepgram-session'
import { FakeSocket } from '../stt/deepgram/recovery/fake-socket.test-support'
import { writeAudio } from '../audio-store'
import { insertSegment, setSpeakerIsUser } from '../../db/repos/transcript/segments'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_WARNING } from './capture/capture-health'
import { sttProvider } from '../stt'

const created = vi.hoisted(() => ({
  input: {} as {
    practice?: boolean
    meetingContext?: string
    resume?: { name: string; text: string } | null
    interviewProfile?: string
  },
}))
const fakes = vi.hoisted(() => ({
  profile: '',
  create: vi.fn((_job: number, _title: string, input: typeof created.input) => {
    created.input = input
    return 7
  }),
  currentMeetingId: null as number | null,
  onTranscript: null as null | ((transcript: Record<string, unknown>) => void),
  liveFinal: vi.fn(),
  begin: vi.fn(),
  broadcast: vi.fn(),
  jobResumes: new Map<number, { name: string; text: string }>(),
}))

vi.mock('@shared/ipc', () => ({
  IPC: {
    MeetingState: 'meeting:state',
    MeetingResumeRequest: 'meeting:resume-request',
    MeetingUpdated: 'meeting:updated',
    TranscriptEvent: 'meeting:transcript',
  },
}))
vi.mock('../../config/settings', () => ({
  loadSettings: () => ({
    deepgramApiKey: 'dg',
    recordAudio: false,
    interviewProfile: fakes.profile,
  }),
}))
vi.mock('../stt', () => ({
  sttProvider: {
    start: vi.fn((options: { onTranscript: (transcript: Record<string, unknown>) => void }) => {
      fakes.onTranscript = options.onTranscript
      return Promise.resolve({ sendAudio: vi.fn(), stop: vi.fn() })
    }),
  },
}))
vi.mock('../../db/repos/job/jobs', () => ({
  ensureDefaultJob: () => 3,
}))
vi.mock('../../db/repos/job/glossary', () => ({ getGlossaryTerms: () => [] }))
vi.mock('../../db/repos/job/job-resume', () => ({
  getJobResume: (id: number) => fakes.jobResumes.get(id) ?? null,
}))
vi.mock('../../db/repos/meeting/meetings', () => ({
  clearMeetingAudioPath: vi.fn(),
  endMeeting: vi.fn(),
  getMeeting: () => ({ practice: !!created.input.practice }),
  updateMeetingAudioPath: vi.fn(),
}))
vi.mock('../../db/repos/meeting/meeting-context', () => ({
  getMeetingContext: vi.fn(),
  saveMeetingContext: vi.fn(),
}))
vi.mock('../../db/repos/meeting/meeting-create', () => ({ createMeeting: fakes.create }))
vi.mock('../../db/repos/meeting/meeting-grounding', () => ({
  getMeetingGrounding: () => ({
    resume: created.input.resume ?? null,
    interviewProfile: created.input.interviewProfile ?? '',
    hasBiography: !!created.input.resume || !!created.input.interviewProfile,
  }),
}))
vi.mock('../audio-store', () => ({
  discardRecording: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  writeAudio: vi.fn(),
}))
vi.mock('./postprocess/rediarize/rediarize', () => ({ rediarizeMeeting: vi.fn(async () => false) }))
vi.mock('./summary/summarize', () => ({ summarizeLines: vi.fn(async () => false) }))
vi.mock('./summary/summary-email', () => ({ autoEmailSummary: vi.fn() }))
vi.mock('./status/post-processing', () => ({
  clearPostProcessing: vi.fn(),
  markPostProcessing: vi.fn(),
}))
vi.mock('./status/live-meeting', () => ({
  isLiveMeeting: (id: number) => fakes.currentMeetingId === id,
  liveMeetingId: () => fakes.currentMeetingId,
  setLiveMeeting: (id: number | null) => {
    fakes.currentMeetingId = id
  },
}))
vi.mock('./assist/live-session', () => ({
  LiveSession: class {
    assistance = {
      automaticUnavailable: () => false,
      setIdentityNeedsConfirmation: vi.fn(),
      answerNow: vi.fn(),
      activity: vi.fn(),
      boundary: vi.fn(),
      connectionReset: vi.fn(),
      halt: vi.fn(),
      identityChanged: vi.fn(),
      settingsChanged: vi.fn(),
      start: vi.fn(),
    }
    begin = fakes.begin
    closing = vi.fn(() => ({ window: [], prompt: '' }))
    final = fakes.liveFinal
    relabel = vi.fn()
  },
}))
vi.mock('../../db/repos/transcript/segments', () => ({
  insertSegment: vi.fn(),
  setSpeakerIsUser: vi.fn(),
}))
vi.mock('../../windows/broadcast', () => ({ broadcast: fakes.broadcast }))
vi.mock('../screen-capture', () => ({
  createScreenCapture: () => ({ target: vi.fn(), acquire: vi.fn() }),
}))
vi.mock('../../windows/overlay-window', () => ({
  overlayBounds: vi.fn(() => null),
}))

import {
  currentState,
  pinSpeaker,
  meetingAudioMs,
  sendAudioChunk,
  startMeeting,
  pauseMeeting,
  resumeMeeting,
  stopMeeting,
  togglePause,
} from './index'

function silentLoopbackWithMicSpeech(ms: number): Buffer {
  const frames = Math.round((ms / 1_000) * 16_000)
  const chunk = Buffer.alloc(frames * 4)
  for (let frame = 0; frame < frames; frame++) chunk.writeInt16LE(1_000, frame * 4)
  return chunk
}

describe('meeting capture health', () => {
  it('pin → outage → buffered audio → reconnect → re-pin preserves history and records once', async () => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
    const rows: Parameters<typeof insertSegment>[0][] = []
    vi.mocked(insertSegment).mockImplementation((row) => {
      rows.push({ ...row })
      return rows.length
    })
    vi.mocked(setSpeakerIsUser).mockImplementation((_meeting, speaker, isUser) => {
      for (const row of rows) if (row.speaker === speaker) row.isUser = isUser
    })
    vi.mocked(writeAudio).mockClear()
    vi.mocked(sttProvider.start).mockImplementationOnce(async (options) => {
      const provider = new DeepgramSession(options)
      const ready = provider.connect()
      FakeSocket.instances[0].open()
      await ready
      return provider
    })
    const result = (text: string) => ({
      type: 'Results',
      is_final: true,
      channel_index: [0, 1],
      channel: {
        alternatives: [
          { transcript: text, words: [{ word: text, speaker: 0, start: 0, end: 0.5 }] },
        ],
      },
    })
    try {
      await startMeeting(5, 1)
      const first = FakeSocket.instances[0]
      sendAudioChunk(Buffer.alloc(32000, 1))
      first.message(result('Before'))
      pinSpeaker(0, true)
      const history = { ...rows[0] }
      first.emit('close', { code: 1006 })
      expect(currentState().speakerIdentity?.identityNeedsConfirmation).toBe(true)
      sendAudioChunk(Buffer.alloc(32000, 2))
      expect(meetingAudioMs()).toBe(2000)
      await vi.advanceTimersByTimeAsync(1000)
      const second = FakeSocket.instances[1]
      second.open()
      await vi.advanceTimersByTimeAsync(0)
      expect(second.sent.filter(Buffer.isBuffer)).toEqual([Buffer.alloc(32000, 2)])
      first.message(result('Retired'))
      second.message(result('Buffered'))
      expect(rows).toHaveLength(2)
      expect(rows[1]).toMatchObject({ speaker: 1, isUser: false, tStartMs: 1000 })
      expect(fakes.liveFinal.mock.calls.at(-1)![1].role).toBe('unknown')
      pinSpeaker(0, true)
      expect(currentState().speakerIdentity?.identityNeedsConfirmation).toBe(true)
      vi.mocked(setSpeakerIsUser).mockImplementationOnce(() => {
        throw new Error('Disk unavailable')
      })
      expect(() => pinSpeaker(1, true)).toThrow('Disk unavailable')
      expect(currentState().speakerIdentity?.identityNeedsConfirmation).toBe(true)
      expect(rows[1].isUser).toBe(false)
      pinSpeaker(1, true)
      expect(currentState().speakerIdentity?.identityNeedsConfirmation).toBe(false)
      expect(rows[0]).toEqual(history)
      expect(rows[1].isUser).toBe(true)
      expect(meetingAudioMs()).toBe(2000)
      expect(writeAudio).toHaveBeenCalledTimes(2)
      await pauseMeeting()
      await resumeMeeting(1)
      expect(currentState().speakerIdentity?.identityNeedsConfirmation).toBe(true)
      fakes.onTranscript!({
        channel: 0,
        speaker: 0,
        isFinal: true,
        text: 'Resumed',
        tStartMs: 2000,
        tEndMs: 2500,
      })
      expect(rows[2]).toMatchObject({ speaker: 2, isUser: false })
      first.message(result('Stale session'))
      expect(rows).toHaveLength(3)
      expect(() => pinSpeaker(999, true)).toThrow('current meeting')
    } finally {
      await stopMeeting()
      vi.mocked(insertSegment).mockReset()
      vi.mocked(setSpeakerIsUser).mockReset()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
  beforeEach(() => {
    fakes.currentMeetingId = null
    fakes.onTranscript = null
    fakes.liveFinal.mockClear()
    fakes.begin.mockClear()
  })

  it('snapshots the job resume at Start: hints survive pause/resume and later job edits', async () => {
    fakes.jobResumes.set(5, { name: 'Pasted text', text: 'Used Camunda at ExampleCo.' })
    try {
      await startMeeting(5, 1)
      expect(created.input.resume).toEqual({
        name: 'Pasted text',
        text: 'Used Camunda at ExampleCo.',
      })
      expect(sttProvider.start).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyterms: expect.arrayContaining(['Camunda']) }),
      )
      fakes.jobResumes.set(5, { name: 'v2', text: 'Now Temporal at LaterCo.' })
      await pauseMeeting()
      await resumeMeeting(1)
      const terms = () => vi.mocked(sttProvider.start).mock.calls.at(-1)![0].keyterms
      expect(terms()).toEqual(expect.arrayContaining(['Camunda']))
      expect(terms()).not.toContain('Temporal')
      await stopMeeting()
      // the next meeting for the job takes the latest saved value
      await startMeeting(5, 1)
      expect(created.input.resume).toEqual({ name: 'v2', text: 'Now Temporal at LaterCo.' })
      await stopMeeting()
      fakes.jobResumes.delete(5)
      await startMeeting(5, 1)
      expect(created.input.resume).toBeNull()
      await stopMeeting()
      await startMeeting()
      expect(sttProvider.start).toHaveBeenLastCalledWith(expect.objectContaining({ keyterms: [] }))
      await stopMeeting()
    } finally {
      fakes.jobResumes.clear()
    }
  })

  it('Unsorted (no job) gets no resume even when the bucket job has one saved', async () => {
    fakes.jobResumes.set(3, { name: 'Bucket', text: 'Camunda' })
    try {
      await startMeeting()
      expect(fakes.create).toHaveBeenLastCalledWith(3, expect.any(String), expect.anything())
      expect(created.input.resume).toBeNull()
      await stopMeeting()
    } finally {
      fakes.jobResumes.clear()
    }
  })

  it('the pause hotkey pauses a live meeting itself and asks the window to resume a paused one', async () => {
    fakes.broadcast.mockClear()
    await togglePause() // idle: nothing to do
    await startMeeting()
    await togglePause()
    expect(currentState().status).toBe('paused')
    expect(fakes.broadcast).not.toHaveBeenCalledWith('meeting:resume-request', null)
    await togglePause() // resuming needs the renderer's capture
    expect(fakes.broadcast).toHaveBeenCalledWith('meeting:resume-request', null)
    expect(currentState().status).toBe('paused')
    await stopMeeting()
  })

  it('saves the Start context with the meeting before assistance or STT begins', async () => {
    const order: string[] = []
    fakes.create.mockImplementationOnce((_job, _title, input) => {
      order.push('create')
      created.input = input
      return 7
    })
    fakes.begin.mockImplementationOnce(() => order.push('assist'))
    vi.mocked(sttProvider.start).mockImplementationOnce(async (options) => {
      order.push('stt')
      fakes.onTranscript = options.onTranscript as never
      return { sendAudio: vi.fn(), stop: vi.fn() } as never
    })
    await startMeeting(undefined, 1, { meetingContext: 'Agenda: pilot scope', interview: false })
    expect(created.input.meetingContext).toBe('Agenda: pilot scope')
    expect(order).toEqual(['create', 'assist', 'stt'])
    await stopMeeting()
    await startMeeting(undefined, 1, { practice: true }) // Mock: empty context by default
    expect(created.input.meetingContext).toBeUndefined()
    await stopMeeting()
  })

  it('keeps coaching fed while the capture warning is active', async () => {
    await startMeeting(undefined, 2)
    sendAudioChunk(silentLoopbackWithMicSpeech(5_000))
    expect(currentState()).toMatchObject({ captureWarning: CAPTURE_WARNING })

    fakes.onTranscript?.({
      channel: 0,
      speaker: 0,
      isFinal: true,
      tStartMs: 0,
      tEndMs: 5_000,
      text: 'Here is the next part of the plan.',
    })

    expect(fakes.liveFinal).toHaveBeenCalledOnce()
  })
})

it('keeps the missing-resume cue across practice pause/resume and clears it for ordinary meetings', async () => {
  const meetings = await import('./index')
  await meetings.stopMeeting()
  await meetings.startMeeting(3, 2, { practice: true })
  expect(meetings.currentState().noResume).toBe(true)
  expect((await meetings.pauseMeeting()).noResume).toBe(true)
  expect((await meetings.resumeMeeting(2)).noResume).toBe(true)
  await meetings.stopMeeting()
  expect(meetings.currentState().noResume).toBeUndefined()
  fakes.jobResumes.set(3, { name: 'x', text: 'ExampleCo' })
  await meetings.startMeeting(3, 2, { practice: true })
  expect(meetings.currentState().noResume).toBeUndefined()
  await meetings.stopMeeting()
  fakes.jobResumes.clear()
  await meetings.startMeeting(3, 2)
  expect(meetings.currentState().noResume).toBeUndefined()
  await meetings.stopMeeting()
})

it.each([
  [{}, false, false],
  [{ interview: false }, true, false],
  [{ interview: true }, false, true],
  [{}, true, true],
  [{ practice: true, interview: false }, false, true],
] as const)(
  'snapshots interview-only profile and reuses hints with options %j, job resume %s',
  async (options, jobHasResume, applies) => {
    await stopMeeting()
    fakes.profile = 'At ExampleCo I built Camunda workflows.'
    if (jobHasResume) fakes.jobResumes.set(3, { name: 'Resume', text: 'Java' })
    try {
      await startMeeting(3, 2, options)
      expect(fakes.create).toHaveBeenLastCalledWith(
        3,
        expect.any(String),
        expect.objectContaining({ interviewProfile: applies ? fakes.profile : '' }),
      )
      expect(currentState().noResume).toBeUndefined()
      const terms = () => vi.mocked(sttProvider.start).mock.calls.at(-1)![0].keyterms
      expect(terms()?.includes('Camunda')).toBe(applies)
      fakes.profile = 'LaterEmployer'
      await pauseMeeting()
      await resumeMeeting(2)
      expect(terms()?.includes('Camunda')).toBe(applies)
      expect(terms()).not.toContain('LaterEmployer')
    } finally {
      await stopMeeting()
      fakes.profile = ''
      fakes.jobResumes.clear()
    }
  },
)
