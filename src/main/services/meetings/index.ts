import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { ChannelCount, MeetingState, SuggestionEvent, TranscriptEvent } from '@shared/types'
import { loadSettings } from '../../config/settings'
import { sttProvider } from '../stt'
import type { SttSession } from '../stt/types'
import { ensureDefaultJob, getGlossaryTerms, getJob, listGlossary } from '../../db/repos/jobs'
import {
  createMeeting,
  endMeeting,
  updateMeetingAudioPath,
  updateMeetingSummary,
} from '../../db/repos/meetings'
import { startRecording, stopRecording, writeAudio } from '../audio-store'
import { rediarizeMeeting } from './rediarize'
import { resolveSpeakerIdentity } from './channel-identity'
import { insertSegment, setSpeakerIsUser } from '../../db/repos/segments'
import { insertSuggestion } from '../../db/repos/suggestions'
import { claudeProvider } from '../assistant/claude'
import {
  buildSummaryPrompt,
  buildSystemPrompt,
  buildUserContent,
  type TranscriptLine,
} from '../assistant/prompts'
import { resetTriggers, shouldTrigger } from '../assistant/triggers'

// Orchestrates one live meeting at a time: STT session, persistence, event fan-out,
// and the assist loop (ambient triggers + on-demand suggestions).

let session: SttSession | null = null
let meetingId: number | null = null
let meetingChannels: ChannelCount = 1
let meetingStartedAt = 0
const userSpeakers = new Set<number>() // diarized indices pinned as "me"
const transcriptWindow: TranscriptLine[] = [] // rolling finals for prompt assembly
let systemPrompt = '' // stable per meeting (cached by the provider)
let suggestionBusy = false
let suggestionSeq = 0

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function setState(state: MeetingState): void {
  broadcast(IPC.MeetingState, state)
}

export async function startMeeting(
  jobId?: number,
  channels: ChannelCount = 1,
): Promise<MeetingState> {
  if (session) return { meetingId, status: 'live' } // already running
  const stereo = channels === 2 // mic + loopback: channel tells us who's who

  const settings = loadSettings()
  if (!settings.deepgramApiKey) {
    const state: MeetingState = {
      meetingId: null,
      status: 'error',
      error: 'No Deepgram API key set — add it in Settings.',
    }
    setState(state)
    return state
  }

  const job = jobId ?? ensureDefaultJob()
  const id = createMeeting(job, `Meeting ${new Date().toLocaleString()}`)
  meetingId = id
  meetingChannels = channels
  meetingStartedAt = Date.now()
  userSpeakers.clear()
  transcriptWindow.length = 0
  resetTriggers()
  systemPrompt = buildSystemPrompt(getJob(job), listGlossary(job))
  if (settings.recordAudio) {
    updateMeetingAudioPath(id, startRecording(id, channels))
  }

  try {
    session = await sttProvider.start({
      apiKey: settings.deepgramApiKey,
      channels,
      keyterms: getGlossaryTerms(job),
      onTranscript: (t) => {
        // stereo: channel IS identity; mono: manual "that's me" pinning
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
      },
      onError: (message) => {
        setState({ meetingId: id, status: 'error', error: message })
      },
    })
  } catch (e) {
    session = null
    meetingId = null
    const state: MeetingState = {
      meetingId: null,
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    }
    setState(state)
    return state
  }

  const state: MeetingState = { meetingId: id, status: 'live' }
  setState(state)
  return state
}

export async function stopMeeting(): Promise<MeetingState> {
  if (session) {
    await session.stop()
    session = null
  }
  await stopRecording() // no-op when recording wasn't on
  if (meetingId !== null) {
    endMeeting(meetingId)
    // fire-and-forget: summarize + re-diarize; UI reads results from the DB later
    void summarizeMeeting(meetingId, [...transcriptWindow])
    const endedId = meetingId
    void rediarizeMeeting(endedId, meetingChannels).then((changed) => {
      if (changed) broadcast(IPC.MeetingUpdated, endedId) // open views reload
    })
    meetingId = null
  }
  const state: MeetingState = { meetingId: null, status: 'idle' }
  setState(state)
  return state
}

async function summarizeMeeting(id: number, window: TranscriptLine[]): Promise<void> {
  if (window.length < 5) return // nothing worth summarizing
  const { anthropicApiKey } = loadSettings()
  if (!anthropicApiKey) return

  try {
    const text = await claudeProvider.complete({
      apiKey: anthropicApiKey,
      system: systemPrompt,
      userContent: buildSummaryPrompt(window),
      maxTokens: 1500,
      effort: 'medium',
      // no onDelta — one-shot; persisted when done
    })
    const idx = text.indexOf('ACTION ITEMS')
    const summary = (idx >= 0 ? text.slice(0, idx) : text).replace(/^SUMMARY\s*/i, '').trim()
    const actions = idx >= 0 ? text.slice(idx + 'ACTION ITEMS'.length).trim() : ''
    updateMeetingSummary(id, summary, actions)
  } catch (e) {
    console.warn('[sanas] meeting summary failed:', e)
  }
}

/** Generate one suggestion (ambient nudge or hotkey full answer) and stream it out. */
export async function runSuggestion(trigger: 'ambient' | 'hotkey'): Promise<void> {
  if (meetingId === null) return // no live meeting — hotkey outside a meeting is a no-op
  if (suggestionBusy) return // one at a time; drop overlapping triggers
  if (transcriptWindow.length === 0) return

  const { anthropicApiKey } = loadSettings()
  const id = meetingId
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
  const userContent = buildUserContent(transcriptWindow, trigger)
  try {
    const text = await claudeProvider.complete({
      apiKey: anthropicApiKey,
      system: systemPrompt,
      userContent,
      // nudges stay terse and fast; hotkey answers get more room and depth
      maxTokens: trigger === 'ambient' ? 300 : 1000,
      effort: trigger === 'ambient' ? 'low' : 'medium',
      onDelta: (delta) => emit('delta', delta),
    })
    insertSuggestion({
      meetingId: id,
      tMs: Date.now() - meetingStartedAt,
      trigger,
      promptWindow: userContent,
      text,
    })
    emit('done', text)
  } catch (e) {
    emit('error', e instanceof Error ? e.message : String(e))
  } finally {
    suggestionBusy = false
  }
}

export function sendAudioChunk(chunk: Buffer): void {
  session?.sendAudio(chunk)
  writeAudio(chunk) // no-op when recording wasn't started
}

export function pinSpeaker(speaker: number, isUser: boolean): void {
  if (isUser) userSpeakers.add(speaker)
  else userSpeakers.delete(speaker)
  if (meetingId !== null) setSpeakerIsUser(meetingId, speaker, isUser)
}
