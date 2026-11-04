import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_WARNING } from './capture/capture-health'
import { sttProvider } from '../stt'

const created = vi.hoisted(() => ({
  input: {} as {
    practice?: boolean
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
  slides: [] as { title: string; talkingPoint: string; script: string; keyFacts: string }[],
  slideEvents: vi.fn(),
  hideOverlay: vi.fn(),
  jobResumes: new Map<number, { name: string; text: string }>(),
}))

vi.mock('@shared/ipc', () => ({
  IPC: {
    MeetingState: 'meeting:state',
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
vi.mock('../../db/repos/jobs', () => ({
  ensureDefaultJob: () => 3,
  getGlossaryTerms: () => [],
}))
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
vi.mock('../../db/repos/meeting/meeting-presentation', () => ({
  getPresentationHistory: () => ({ slides: fakes.slides, events: [] }),
  insertSlideEvent: fakes.slideEvents,
}))
vi.mock('../audio-store', () => ({
  discardRecording: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  writeAudio: vi.fn(),
}))
vi.mock('./rediarize/rediarize', () => ({ rediarizeMeeting: vi.fn(async () => false) }))
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
      answerNow: vi.fn(),
      activity: vi.fn(),
      boundary: vi.fn(),
      connectionReset: vi.fn(),
      halt: vi.fn(),
      identityChanged: vi.fn(),
      settingsChanged: vi.fn(),
      start: vi.fn(),
    }
    begin = vi.fn()
    closing = vi.fn(() => ({ window: [], prompt: '' }))
    final = fakes.liveFinal
    relabel = vi.fn()
    presentationChanged = vi.fn()
  },
}))
vi.mock('../../db/repos/segments', () => ({
  insertSegment: vi.fn(),
  setSpeakerIsUser: vi.fn(),
}))
vi.mock('../../windows/broadcast', () => ({ broadcast: vi.fn() }))
vi.mock('../screen-capture', () => ({
  createScreenCapture: () => ({ target: vi.fn(), acquire: vi.fn() }),
}))
vi.mock('../../windows/overlay-window', () => ({
  overlayBounds: vi.fn(() => null),
  hideOverlay: fakes.hideOverlay,
}))

import {
  currentState,
  sendAudioChunk,
  startMeeting,
  pauseMeeting,
  resumeMeeting,
  moveSlide,
  presentationState,
  stopMeeting,
} from './index'

function silentLoopbackWithMicSpeech(ms: number): Buffer {
  const frames = Math.round((ms / 1_000) * 16_000)
  const chunk = Buffer.alloc(frames * 4)
  for (let frame = 0; frame < frames; frame++) chunk.writeInt16LE(1_000, frame * 4)
  return chunk
}

describe('meeting capture health', () => {
  beforeEach(() => {
    fakes.currentMeetingId = null
    fakes.onTranscript = null
    fakes.liveFinal.mockClear()
    fakes.slides = []
    fakes.slideEvents.mockClear()
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

  it('hides the overlay when the meeting stops, never on pause or resume', async () => {
    fakes.hideOverlay.mockClear()
    await startMeeting()
    await pauseMeeting()
    await resumeMeeting(1)
    expect(fakes.hideOverlay).not.toHaveBeenCalled()
    await stopMeeting()
    expect(fakes.hideOverlay).toHaveBeenCalledOnce()
  })

  it('records moves against accepted audio and preserves the cursor across pause/resume', async () => {
    fakes.slides = ['one', 'two'].map((title) => ({
      title,
      talkingPoint: title,
      script: '',
      keyFacts: '',
    }))
    await startMeeting(undefined, 2)
    sendAudioChunk(silentLoopbackWithMicSpeech(1000))
    await pauseMeeting()
    await moveSlide(7, 'next')
    sendAudioChunk(silentLoopbackWithMicSpeech(1000)) // paused: ignored
    await moveSlide(7, 'prev')
    expect(fakes.slideEvents.mock.calls.map((call) => call[1])).toEqual([
      { deckVersion: 0, ordinal: 1, revision: 2, tMs: 1000 },
      { deckVersion: 0, ordinal: 0, revision: 3, tMs: 1000 },
    ])
    await resumeMeeting(2)
    expect(presentationState().revision).toBe(3)
    await expect(moveSlide(99, 'next')).rejects.toThrow('no longer active')
    await stopMeeting()
    expect(presentationState().current).toBeNull()
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
      text: 'Here is the next part of the presentation.',
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
