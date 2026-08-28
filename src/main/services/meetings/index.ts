import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { MeetingState, TranscriptEvent } from '@shared/types'
import { loadSettings } from '../../config/settings'
import { deepgramProvider } from '../stt/deepgram'
import type { SttSession } from '../stt/types'
import { ensureDefaultJob, getGlossaryTerms } from '../../db/repos/jobs'
import { createMeeting, endMeeting } from '../../db/repos/meetings'
import { insertSegment, setSpeakerIsUser } from '../../db/repos/segments'

// Orchestrates one live meeting at a time: STT session, persistence, event fan-out.

let session: SttSession | null = null
let meetingId: number | null = null
const userSpeakers = new Set<number>() // diarized indices pinned as "me"

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function setState(state: MeetingState): void {
  broadcast(IPC.MeetingState, state)
}

export async function startMeeting(jobId?: number): Promise<MeetingState> {
  if (session) return { meetingId, status: 'live' } // already running

  const settings = loadSettings()
  if (!settings.deepgramApiKey) {
    const state: MeetingState = {
      meetingId: null,
      status: 'error',
      error: 'No Deepgram API key set — add it in Settings.'
    }
    setState(state)
    return state
  }

  const job = jobId ?? ensureDefaultJob()
  const id = createMeeting(job, `Meeting ${new Date().toLocaleString()}`)
  meetingId = id
  userSpeakers.clear()

  try {
    session = await deepgramProvider.start({
      apiKey: settings.deepgramApiKey,
      keyterms: getGlossaryTerms(job),
      onTranscript: (t) => {
        const ev: TranscriptEvent = {
          meetingId: id,
          isFinal: t.isFinal,
          speaker: t.speaker,
          isUser: userSpeakers.has(t.speaker),
          tStartMs: t.tStartMs,
          tEndMs: t.tEndMs,
          text: t.text
        }
        // only persist finals — interims mutate (GOTCHAS.md)
        if (t.isFinal) {
          insertSegment({
            meetingId: id,
            tStartMs: t.tStartMs,
            tEndMs: t.tEndMs,
            speaker: t.speaker,
            isUser: ev.isUser,
            text: t.text
          })
        }
        broadcast(IPC.TranscriptEvent, ev)
      },
      onError: (message) => {
        setState({ meetingId: id, status: 'error', error: message })
      }
    })
  } catch (e) {
    session = null
    meetingId = null
    const state: MeetingState = {
      meetingId: null,
      status: 'error',
      error: e instanceof Error ? e.message : String(e)
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
  if (meetingId !== null) {
    endMeeting(meetingId)
    meetingId = null
  }
  const state: MeetingState = { meetingId: null, status: 'idle' }
  setState(state)
  return state
}

export function sendAudioChunk(chunk: Buffer): void {
  session?.sendAudio(chunk)
}

export function pinSpeaker(speaker: number, isUser: boolean): void {
  if (isUser) userSpeakers.add(speaker)
  else userSpeakers.delete(speaker)
  if (meetingId !== null) setSpeakerIsUser(meetingId, speaker, isUser)
}
