import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_WARNING } from './capture/capture-health'

const fakes = vi.hoisted(() => ({
  currentMeetingId: null as number | null,
  onTranscript: null as null | ((transcript: Record<string, unknown>) => void),
  liveFinal: vi.fn(),
  slides: [] as { title: string; talkingPoint: string; script: string; keyFacts: string }[],
  slideEvents: vi.fn(),
}))

vi.mock('@shared/ipc', () => ({
  IPC: {
    MeetingState: 'meeting:state',
    MeetingUpdated: 'meeting:updated',
    TranscriptEvent: 'meeting:transcript',
  },
}))
vi.mock('../../config/settings', () => ({
  loadSettings: () => ({ deepgramApiKey: 'dg', recordAudio: false }),
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
vi.mock('../../db/repos/meetings', () => ({
  clearMeetingAudioPath: vi.fn(),
  createMeeting: () => 7,
  endMeeting: vi.fn(),
  updateMeetingAudioPath: vi.fn(),
}))
vi.mock('../../db/repos/meeting-context', () => ({
  getMeetingContext: vi.fn(),
  saveMeetingContext: vi.fn(),
}))
vi.mock('../../db/repos/meeting-presentation', () => ({
  createPresentationMeeting: () => 7,
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
vi.mock('../../windows/overlay-window', () => ({ overlayBounds: vi.fn(() => null) }))

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
