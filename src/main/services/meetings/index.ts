import { IPC } from '@shared/ipc'
import type { ChannelCount, MeetingState, Settings, TranscriptEvent } from '@shared/types'
import { loadSettings } from '../../config/settings'
import { sttProvider } from '../stt'
import type { SttSession, SttSignal, SttTranscript } from '../stt/types'
import { ensureDefaultJob, getGlossaryTerms } from '../../db/repos/jobs'
import {
  clearMeetingAudioPath,
  createMeeting,
  endMeeting,
  updateMeetingAudioPath,
} from '../../db/repos/meetings'
import { discardRecording, startRecording, stopRecording, writeAudio } from '../audio-store'
import { rediarizeMeeting } from './rediarize/rediarize'
import { summarizeLines } from './summary/summarize'
import { autoEmailSummary } from './summary/summary-email'
import { clearPostProcessing, markPostProcessing } from './status/post-processing'
import { isLiveMeeting, liveMeetingId, setLiveMeeting } from './status/live-meeting'
import { resolveSpeakerIdentity } from './capture/channel-identity'
import { CAPTURE_WARNING, CaptureHealth } from './capture/capture-health'
import { LiveSession } from './assist/live-session'
import { insertSegment, setSpeakerIsUser } from '../../db/repos/segments'
import { broadcast } from '../../windows/broadcast'

// Orchestrates one live meeting at a time: STT session, persistence, event fan-out, and
// lifecycle. Live assistance — the prompt window, shown headlines, system prompt and the
// runner/coordinator pair — is assembled in ./assist/live-session.ts; this module feeds it
// identity-resolved finals and lifecycle calls, and keeps the "Answer now" facade.
//
// A meeting can be PAUSED: the STT connection closes and audio stops flowing, but the
// meeting row, the transcript window and the pinned speakers all stay. Resuming opens a
// new connection whose clock continues where the last one stopped, so one interruption
// leaves one meeting rather than two. A connection that cannot be recovered pauses the
// meeting instead of erroring, so the user resumes rather than starting over.
//
// The meeting's clock is AUDIO time, counted from the PCM actually received
// (`audioMsReceived`), and no PCM is accepted before the session exists. That is the same
// audio the WAV holds, so the clock, the recording and everything this module timestamps
// agree — and a pause simply does not advance it. Provider transcript times are never used
// as the cursor: they only advance on a final result, so pausing during silence would
// rewind the clock. (Segment times come from the provider and can drift earlier across its
// own internal reconnect — see docs/GOTCHAS.md.)
//
// Every lifecycle call is serialized and each session carries a generation, because
// start/pause/resume/stop all mutate this module's state across awaits: without that, two
// resumes open two sessions, and a dead session's late callbacks land on its successor.

const SAMPLE_RATE = 16_000 // the AudioWorklet's contract with the STT seam
const BYTES_PER_SAMPLE = 2 // linear16

let session: SttSession | null = null
let sessionGen = 0 // bumped whenever a session is opened or discarded
let meetingJobId = 0 // remembered so a resume can re-send the job's keyterms
let meetingChannels: ChannelCount = 1
let paused = false
let audioMsReceived = 0 // the meeting's clock: audio actually captured, in ms
const userSpeakers = new Set<number>() // diarized indices pinned as "me"
const lostRecordings = new Set<number>() // meetings whose WAV died while they were running
let persistFailed = false // one warning per meeting, not one per line
const captureHealth = new CaptureHealth()
let lastError: string | undefined // the error shown now, kept when only capture health changes

const live = new LiveSession(() => audioMsReceived)
const assistance = live.assistance

/** One at a time: lifecycle calls mutate module state across awaits. */
let lifecycle: Promise<unknown> = Promise.resolve()
function serialized(fn: () => Promise<MeetingState>): Promise<MeetingState> {
  const run = lifecycle.then(fn, fn)
  lifecycle = run.catch(() => undefined)
  return run
}

export function currentState(): MeetingState {
  const meetingId = liveMeetingId()
  if (meetingId === null) return { meetingId: null, status: 'idle' }
  if (paused) return { meetingId, status: 'paused' }
  return captureHealth.warned
    ? { meetingId, status: 'live', captureWarning: CAPTURE_WARNING }
    : { meetingId, status: 'live' }
}

function setState(state: MeetingState): MeetingState {
  lastError = state.error
  broadcast(IPC.MeetingState, state)
  return state
}

function recordingFailure(e: unknown): string {
  return `Recording could not start (${e instanceof Error ? e.message : String(e)})`
}

/** The recording died mid-meeting (disk full, drive unplugged). The meeting carries on —
 *  but the pointer goes, because a half-written WAV must not be taken for the meeting's
 *  audio by re-diarization or export. Retention sweeps the file as an orphan. */
function onRecordingLost(id: number, e: Error): void {
  console.warn('[sanas] recording stopped mid-meeting:', e)
  // in memory first: the disk that broke the recording can just as easily fail the write
  // below, and re-diarization must not read a truncated WAV either way
  lostRecordings.add(id)
  try {
    clearMeetingAudioPath(id)
  } catch (dbError) {
    console.warn('[sanas] could not clear the audio path for meeting', id, dbError)
  }
  if (!isLiveMeeting(id)) return
  setState({
    ...currentState(),
    error: `Recording stopped (${e.message}) — the meeting is still running, but the rest of it is not being saved.`,
  })
}

/** A transcript line that could not be stored. Raised once per meeting: the realistic
 *  cause is a full disk, which will not fix itself, and one banner is enough. */
function reportPersistFailure(e: unknown): void {
  console.warn('[sanas] could not save a transcript line:', e)
  if (persistFailed) return
  persistFailed = true
  setState({
    ...currentState(),
    error:
      'Some lines could not be saved — the transcript on screen is ahead of what is stored. Check free disk space.',
  })
}

/** Closes the current session and invalidates its callbacks. */
async function discardSession(): Promise<void> {
  const dying = session
  session = null
  sessionGen++ // anything still in flight from it is now stale
  if (dying) await dying.stop()
}

/** One transcript event: persist finals, feed the prompt window and live assistance, fan
 *  out to the windows. */
function handleTranscript(t: SttTranscript): void {
  const id = liveMeetingId()
  if (id === null) return
  // stereo: channel IS identity; mono: manual "that's me" pinning
  const stereo = meetingChannels === 2
  const who = resolveSpeakerIdentity(t.channel, t.speaker, stereo, userSpeakers)
  const ev: TranscriptEvent = {
    meetingId: id,
    isFinal: t.isFinal,
    speaker: who.speaker,
    isUser: who.isUser,
    tStartMs: t.tStartMs,
    tEndMs: t.tEndMs,
    text: t.text,
  }
  // only persist finals — interims mutate (GOTCHAS.md)
  if (t.isFinal) {
    // a throw here escapes the provider's socket listener and ends the process, so the
    // line is kept on screen and in the prompt window even when it cannot be stored
    try {
      insertSegment({
        meetingId: id,
        tStartMs: t.tStartMs,
        tEndMs: t.tEndMs,
        speaker: ev.speaker,
        isUser: ev.isUser,
        text: t.text,
      })
    } catch (e) {
      reportPersistFailure(e)
    }
    live.final(
      { speaker: ev.speaker, isUser: ev.isUser, text: t.text },
      {
        channel: t.channel,
        speaker: who.speaker,
        role: who.role,
        tStartMs: t.tStartMs,
        tEndMs: t.tEndMs,
        text: t.text,
      },
    )
  } else {
    // an interim is activity only; in mono its first-word speaker is no evidence of who
    assistance.activity(t.channel, t.tEndMs, stereo ? who.role : 'unknown')
  }
  broadcast(IPC.TranscriptEvent, ev)
}

/** Streaming turn evidence from the provider. */
function handleSignal(s: SttSignal): void {
  if (liveMeetingId() === null) return
  if (s.kind === 'reset') assistance.connectionReset()
  else if (s.kind === 'boundary') assistance.boundary(s.channel, s.atMs, s.source)
  else {
    const stereo = meetingChannels === 2
    const role = stereo ? resolveSpeakerIdentity(s.channel, -1, true).role : 'unknown'
    assistance.activity(s.channel, s.atMs, role)
  }
}

/** Opens an STT connection for the current meeting, continuing the meeting's clock.
 *  Its callbacks are ignored once a newer session exists. */
async function openSession(apiKey: string, startOffsetMs: number): Promise<SttSession> {
  const gen = ++sessionGen
  const mine =
    <T>(fn: (arg: T) => void) =>
    (arg: T) => {
      if (gen === sessionGen) fn(arg)
    }
  return sttProvider.start({
    apiKey,
    channels: meetingChannels,
    keyterms: getGlossaryTerms(meetingJobId),
    startOffsetMs,
    onTranscript: mine(handleTranscript),
    onSignal: mine(handleSignal),
    // the provider only reports here once its own reconnect attempts are exhausted:
    // hold the meeting open so the user can resume instead of losing the record
    onError: mine((message: string) => void pauseMeeting(message)),
  })
}

export function startMeeting(jobId?: number, channels: ChannelCount = 1): Promise<MeetingState> {
  return serialized(async () => {
    if (liveMeetingId() !== null) return currentState() // one meeting at a time

    const settings = loadSettings()
    if (!settings.deepgramApiKey) {
      return setState({
        meetingId: null,
        status: 'error',
        error: 'No Deepgram API key set — add it in Settings.',
      })
    }

    const job = jobId ?? ensureDefaultJob()
    const id = createMeeting(job, `Meeting ${new Date().toLocaleString()}`)
    setLiveMeeting(id)
    meetingJobId = job
    meetingChannels = channels
    paused = false
    audioMsReceived = 0
    persistFailed = false
    userSpeakers.clear()
    captureHealth.reset()
    live.begin(job) // window, headlines and prompt are per meeting; a resume keeps them

    // held back until the recording is open too: sendAudioChunk accepts nothing until the
    // session is published, so the provider, the WAV and the clock all begin on the same
    // chunk rather than the file starting after the transcript
    let opened: SttSession
    try {
      opened = await openSession(settings.deepgramApiKey, 0)
    } catch (e) {
      // never leave a meeting row open with no way back to it
      assistance.halt()
      endMeeting(id)
      setLiveMeeting(null)
      return setState({
        meetingId: null,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
    }

    // recording is opt-in and is not what the meeting is for, so a file that will not
    // open leaves the meeting running — but the user is told, because otherwise they
    // believe there is a WAV to re-diarize and export from
    let recordingError = ''
    if (settings.recordAudio) {
      try {
        const path = await startRecording(id, channels, (e) => onRecordingLost(id, e))
        try {
          updateMeetingAudioPath(id, path)
        } catch (e) {
          // nothing points at the file now, so stop writing it rather than leave a
          // recording running that no meeting claims
          discardRecording()
          throw e
        }
      } catch (e) {
        recordingError = `${recordingFailure(e)} — the meeting is live, but nothing is being saved to disk.`
        console.warn('[sanas] could not start recording:', e)
      }
    }
    session = opened // from here, audio is accepted
    return setState({
      meetingId: id,
      status: 'live',
      ...(recordingError ? { error: recordingError } : {}),
    })
  })
}

/** Stops listening without ending the meeting. `reason` is set when the pause was forced
 *  by a lost connection rather than asked for. */
export function pauseMeeting(reason?: string): Promise<MeetingState> {
  return serialized(async () => {
    const meetingId = liveMeetingId()
    if (meetingId === null || paused) return currentState()
    assistance.halt() // before the shutdown is awaited: nothing generates from what is left
    await discardSession()
    paused = true
    captureHealth.reset() // nothing is captured while paused; resume starts fresh
    if (reason) console.warn('[sanas] meeting paused:', reason)
    return setState({ meetingId, status: 'paused', error: reason })
  })
}

/** Reopens the connection on the same meeting, continuing its clock. The capture
 *  topology must match the one the meeting started with: the WAV header and the
 *  provider's channel mapping were both fixed when it began. */
export function resumeMeeting(channels: ChannelCount): Promise<MeetingState> {
  return serialized(async () => {
    const meetingId = liveMeetingId()
    if (meetingId === null || !paused) return currentState()
    if (channels !== meetingChannels) {
      return setState({
        meetingId,
        status: 'paused',
        error: `This meeting is recording ${
          meetingChannels === 2 ? 'mic + system audio' : 'mic only'
        } — resume with the same source.`,
      })
    }
    const { deepgramApiKey } = loadSettings()
    if (!deepgramApiKey) {
      return setState({
        meetingId,
        status: 'paused',
        error: 'No Deepgram API key set — add it in Settings.',
      })
    }
    try {
      session = await openSession(deepgramApiKey, Math.round(audioMsReceived))
    } catch (e) {
      session = null
      return setState({
        meetingId,
        status: 'paused',
        error: e instanceof Error ? e.message : String(e),
      })
    }
    paused = false
    captureHealth.reset()
    // pins persist across the pause; transient turn state and cooldowns start over, so a
    // debounce from before the pause cannot swallow the first answer
    assistance.start()
    return setState({ meetingId, status: 'live' })
  })
}

export function stopMeeting(): Promise<MeetingState> {
  return serialized(async () => {
    assistance.halt() // an answer already streaming still finishes and persists
    await discardSession()
    paused = false
    audioMsReceived = 0
    captureHealth.reset()
    await stopRecording() // no-op when recording wasn't on
    const endedId = liveMeetingId()
    if (endedId !== null) {
      setLiveMeeting(null) // released first: a failure below must not strand the lifecycle
      try {
        endMeeting(endedId)
      } catch (e) {
        console.warn('[sanas] could not close the meeting row:', e)
      }
      const { window, prompt } = live.closing()
      const channels = meetingChannels
      // a WAV that died mid-meeting is truncated: re-diarizing from it would replace the
      // whole transcript with the part that made it to disk
      const recordingLost = lostRecordings.delete(endedId)
      // fire-and-forget: summarize (+ optional auto-email) and re-diarize; open views
      // reload. Both rewrite the meeting, so it is off-limits to merge until they finish.
      markPostProcessing(endedId)
      void Promise.allSettled([
        summarizeLines(endedId, window, prompt)
          .then((written) => {
            if (!written) return
            broadcast(IPC.MeetingUpdated, endedId)
            return autoEmailSummary(endedId)
          })
          .catch((e) => console.warn('[sanas] meeting summary failed:', e)),
        recordingLost
          ? Promise.resolve()
          : rediarizeMeeting(endedId, channels).then((changed) => {
              if (changed) broadcast(IPC.MeetingUpdated, endedId) // open views reload
            }),
      ]).then(() => clearPostProcessing(endedId))
    }
    return setState({ meetingId: null, status: 'idle' })
  })
}

/** "Answer now" (hotkey or overlay button): a full answer, regardless of whisper mode and
 *  of turn detection. A no-op outside a meeting or while a requested answer is running. */
export function answerNow(): void {
  if (liveMeetingId() === null) return
  assistance.answerNow()
}

/** Settings were saved. Only assistance keys concern live assistance — an overlay resize
 *  also saves settings and must not reset anything. */
export function assistanceSettingsChanged(patch: Partial<Settings>): void {
  if ('coachWhileTalking' in patch) assistance.settingsChanged()
}

export function sendAudioChunk(chunk: Buffer): void {
  // no session means paused, ended, or still connecting: dropping the chunk keeps the
  // recording, the clock and the provider's timeline describing the same audio
  if (session === null) return
  audioMsReceived += (chunk.length / (BYTES_PER_SAMPLE * meetingChannels) / SAMPLE_RATE) * 1000
  // the same buffer the provider and the WAV receive, inspected before either
  const health = captureHealth.push(chunk, meetingChannels)
  session.sendAudio(chunk)
  writeAudio(chunk) // no-op when recording wasn't started
  if (health !== null) {
    // advisory only: keep the banner in sync without changing identity or assistance
    setState({ ...currentState(), ...(lastError ? { error: lastError } : {}) })
  }
}

/** "That's me" for a diarized voice. Mic-only meetings only: in a mic + system audio
 *  meeting identity is structural (channel 0 is the user), and a direct IPC call must not
 *  be able to relabel it. */
export function pinSpeaker(speaker: number, isUser: boolean): void {
  const meetingId = liveMeetingId()
  if (meetingId !== null && meetingChannels === 2) {
    throw new Error('This meeting uses mic + system audio — voices are identified by channel.')
  }
  if (isUser) userSpeakers.add(speaker)
  else userSpeakers.delete(speaker)
  live.relabel(speaker, isUser) // the prompt window and pending work follow the new identity
  if (meetingId !== null) setSpeakerIsUser(meetingId, speaker, isUser)
}
