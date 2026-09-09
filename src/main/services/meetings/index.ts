import { IPC } from '@shared/ipc'
import type { ChannelCount, MeetingState, SuggestionEvent, TranscriptEvent } from '@shared/types'
import { loadSettings } from '../../config/settings'
import { sttProvider } from '../stt'
import type { SttSession, SttTranscript } from '../stt/types'
import { ensureDefaultJob, getGlossaryTerms, getJob, listGlossary } from '../../db/repos/jobs'
import {
  clearMeetingAudioPath,
  createMeeting,
  endMeeting,
  updateMeetingAudioPath,
} from '../../db/repos/meetings'
import { discardRecording, startRecording, stopRecording, writeAudio } from '../audio-store'
import { rediarizeMeeting } from './rediarize'
import { summarizeLines } from './summarize'
import { autoEmailSummary } from './summary-email'
import { clearPostProcessing, markPostProcessing } from './post-processing'
import { resolveSpeakerIdentity } from './channel-identity'
import { insertSegment, setSpeakerIsUser } from '../../db/repos/segments'
import { insertSuggestion } from '../../db/repos/suggestions'
import { speakerNameMap } from '../../db/repos/speakers'
import { claudeProvider } from '../assistant/claude'
import { buildSystemPrompt, buildUserContent, type TranscriptLine } from '../assistant/prompts'
import { resetTriggers, shouldTrigger } from '../assistant/triggers'
import { broadcast } from '../../windows/broadcast'

// Orchestrates one live meeting at a time: STT session, persistence, event fan-out,
// and the assist loop (ambient triggers + on-demand suggestions).
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
let meetingId: number | null = null
let meetingJobId = 0 // remembered so a resume can re-send the job's keyterms
let meetingChannels: ChannelCount = 1
let paused = false
let audioMsReceived = 0 // the meeting's clock: audio actually captured, in ms
const userSpeakers = new Set<number>() // diarized indices pinned as "me"
const lostRecordings = new Set<number>() // meetings whose WAV died while they were running
const transcriptWindow: TranscriptLine[] = [] // rolling finals for prompt assembly
let systemPrompt = '' // stable per meeting (cached by the provider)
let suggestionBusy = false
let suggestionSeq = 0

/** One at a time: lifecycle calls mutate module state across awaits. */
let lifecycle: Promise<unknown> = Promise.resolve()
function serialized(fn: () => Promise<MeetingState>): Promise<MeetingState> {
  const run = lifecycle.then(fn, fn)
  lifecycle = run.catch(() => undefined)
  return run
}

function currentState(): MeetingState {
  if (meetingId === null) return { meetingId: null, status: 'idle' }
  return { meetingId, status: paused ? 'paused' : 'live' }
}

function setState(state: MeetingState): MeetingState {
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
  if (meetingId !== id) return
  setState({
    ...currentState(),
    error: `Recording stopped (${e.message}) — the meeting is still running, but the rest of it is not being saved.`,
  })
}

/** Closes the current session and invalidates its callbacks. */
async function discardSession(): Promise<void> {
  const dying = session
  session = null
  sessionGen++ // anything still in flight from it is now stale
  if (dying) await dying.stop()
}

/** One transcript event: persist finals, feed the prompt window, fan out to the windows. */
function handleTranscript(t: SttTranscript): void {
  if (meetingId === null) return
  const id = meetingId
  // stereo: channel IS identity; mono: manual "that's me" pinning
  const who = resolveSpeakerIdentity(t.channel, t.speaker, meetingChannels === 2, userSpeakers)
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
    insertSegment({
      meetingId: id,
      tStartMs: t.tStartMs,
      tEndMs: t.tEndMs,
      speaker: ev.speaker,
      isUser: ev.isUser,
      text: t.text,
    })
    transcriptWindow.push({ speaker: ev.speaker, isUser: ev.isUser, text: t.text })
    if (transcriptWindow.length > 200) transcriptWindow.shift()
    if (shouldTrigger({ isUser: ev.isUser, text: t.text })) {
      void runSuggestion('ambient')
    }
  }
  broadcast(IPC.TranscriptEvent, ev)
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
    // the provider only reports here once its own reconnect attempts are exhausted:
    // hold the meeting open so the user can resume instead of losing the record
    onError: mine((message: string) => void pauseMeeting(message)),
  })
}

export function startMeeting(jobId?: number, channels: ChannelCount = 1): Promise<MeetingState> {
  return serialized(async () => {
    if (meetingId !== null) return currentState() // one meeting at a time

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
    meetingId = id
    meetingJobId = job
    meetingChannels = channels
    paused = false
    audioMsReceived = 0
    userSpeakers.clear()
    transcriptWindow.length = 0
    resetTriggers()
    systemPrompt = buildSystemPrompt(getJob(job), listGlossary(job))

    // held back until the recording is open too: sendAudioChunk accepts nothing until the
    // session is published, so the provider, the WAV and the clock all begin on the same
    // chunk rather than the file starting after the transcript
    let opened: SttSession
    try {
      opened = await openSession(settings.deepgramApiKey, 0)
    } catch (e) {
      // never leave a meeting row open with no way back to it
      endMeeting(id)
      meetingId = null
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
    if (meetingId === null || paused) return currentState()
    await discardSession()
    paused = true
    if (reason) console.warn('[sanas] meeting paused:', reason)
    return setState({ meetingId, status: 'paused', error: reason })
  })
}

/** Reopens the connection on the same meeting, continuing its clock. The capture
 *  topology must match the one the meeting started with: the WAV header and the
 *  provider's channel mapping were both fixed when it began. */
export function resumeMeeting(channels: ChannelCount): Promise<MeetingState> {
  return serialized(async () => {
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
    resetTriggers() // a debounce from before the pause should not swallow the first nudge
    return setState({ meetingId, status: 'live' })
  })
}

export function stopMeeting(): Promise<MeetingState> {
  return serialized(async () => {
    await discardSession()
    paused = false
    audioMsReceived = 0
    await stopRecording() // no-op when recording wasn't on
    if (meetingId !== null) {
      endMeeting(meetingId)
      const endedId = meetingId
      const window = [...transcriptWindow]
      const prompt = systemPrompt
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
      meetingId = null
    }
    return setState({ meetingId: null, status: 'idle' })
  })
}

/** Generate one suggestion (ambient nudge or hotkey full answer) and stream it out. */
export async function runSuggestion(trigger: 'ambient' | 'hotkey'): Promise<void> {
  if (meetingId === null) return // no meeting — hotkey outside one is a no-op
  if (suggestionBusy) return // one at a time; drop overlapping triggers
  if (transcriptWindow.length === 0) return

  const { anthropicApiKey, anthropicWorkspaceId } = loadSettings()
  const id = meetingId
  const atMs = Math.round(audioMsReceived) // audio time, so it lines up with the transcript
  const sid = ++suggestionSeq
  const emit = (kind: SuggestionEvent['kind'], text: string): void =>
    broadcast(IPC.SuggestionEvent, {
      suggestionId: sid,
      meetingId: id,
      trigger,
      kind,
      text,
    } satisfies SuggestionEvent)

  if (!anthropicApiKey) {
    emit('error', 'No Anthropic API key set — add it in Settings.')
    return
  }

  suggestionBusy = true
  // the answer outlives the meeting — Claude is still streaming when Stop returns — and it
  // ends in an insert against this meeting, so it must hold the meeting like any other
  // background write. Everything after this line is inside the try: a hold that leaked
  // would make the meeting permanently un-mergeable and un-deletable.
  markPostProcessing(id)
  try {
    const userContent = buildUserContent(transcriptWindow, trigger, speakerNameMap(id))
    const text = await claudeProvider.complete({
      apiKey: anthropicApiKey,
      workspaceId: anthropicWorkspaceId || undefined,
      system: systemPrompt,
      userContent,
      // nudges stay terse and fast; hotkey answers get more room and depth
      maxTokens: trigger === 'ambient' ? 300 : 1000,
      effort: trigger === 'ambient' ? 'low' : 'medium',
      onDelta: (delta) => emit('delta', delta),
    })
    insertSuggestion({ meetingId: id, tMs: atMs, trigger, promptWindow: userContent, text })
    emit('done', text)
  } catch (e) {
    emit('error', e instanceof Error ? e.message : String(e))
  } finally {
    clearPostProcessing(id)
    suggestionBusy = false
  }
}

export function sendAudioChunk(chunk: Buffer): void {
  // no session means paused, ended, or still connecting: dropping the chunk keeps the
  // recording, the clock and the provider's timeline describing the same audio
  if (session === null) return
  audioMsReceived += (chunk.length / (BYTES_PER_SAMPLE * meetingChannels) / SAMPLE_RATE) * 1000
  session.sendAudio(chunk)
  writeAudio(chunk) // no-op when recording wasn't started
}

export function pinSpeaker(speaker: number, isUser: boolean): void {
  if (isUser) userSpeakers.add(speaker)
  else userSpeakers.delete(speaker)
  if (meetingId !== null) setSpeakerIsUser(meetingId, speaker, isUser)
}
