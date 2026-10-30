import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_WARNING } from './capture/capture-health'

const fakes = vi.hoisted(() => ({
  currentMeetingId: null as number | null,
  onTranscript: null as null | ((transcript: Record<string, unknown>) => void),
  liveFinal: vi.fn(),
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
vi.mock('../audio-store', () => ({
  discardRecording: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  writeAudio: vi.fn(),
}))
vi.mock('./rediarize/rediarize', () => ({ rediarizeMeeting: vi.fn() }))
vi.mock('./summary/summarize', () => ({ summarizeLines: vi.fn() }))
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
  },
}))
vi.mock('../../db/repos/segments', () => ({
  insertSegment: vi.fn(),
  setSpeakerIsUser: vi.fn(),
}))
vi.mock('../../windows/broadcast', () => ({ broadcast: vi.fn() }))

import { currentState, sendAudioChunk, startMeeting } from './index'

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
