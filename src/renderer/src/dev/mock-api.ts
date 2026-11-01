import { MATCH_CLOSE, MATCH_OPEN } from '@shared/search-markers'
import type {
  HistoryEvent,
  HistoryHit,
  Job,
  MeetingState,
  RetentionPreview,
  SearchMatch,
  Settings,
  SettingsView,
  SuggestionEvent,
  TranscriptEvent,
} from '@shared/types'
import {
  glossary,
  jobs,
  meetings,
  sampleSettings,
  segments,
  speakerNames,
  suggestions,
} from './mock-fixtures'
import { mockLiveControls } from './mock-live-controls'
import {
  emit,
  getMeetingState,
  haltScript,
  on,
  pauseScript,
  pinSpeaker,
  resumeScript,
  setState,
  startScript,
  stateListeners,
  stopScript,
  streamSuggestion,
  suggestionListeners,
  transcriptListeners,
  type Listener,
} from './mock-live-meeting'
import { beginMockPresentation, endMockPresentation, mockPresentation } from './mock-presentation'
import { mockScreenCapture } from './mock-screen-capture'
import { mockUpdates } from './mock-updates'

// Browser preview of the renderer WITHOUT Electron: `npm run dev:web` (plain Vite) serves
// index.html / overlay.html, and this stands in for the preload bridge with
// sample data (mock-fixtures.ts) and a scripted live meeting (mock-live-meeting.ts). Only the
// web-preview build defines __SANAS_WEB_PREVIEW__ as true (vite.renderer.config.ts); the
// Electron build defines it false, so a broken preload in Electron dev still fails loudly
// instead of being masked. Typed against SanasApi (via the global Window augmentation) so it
// cannot drift.

type SanasApi = Window['sanas']

let settings: SettingsView = sampleSettings
const ghostListeners = new Set<Listener<boolean>>()
const settingsListeners = new Set<Listener<SettingsView>>()
const historyListeners = new Set<Listener<HistoryEvent>>()
let askSeq = 0
let dueRecordings = 2 // retention preview: cleaned up by run()

const controls = mockLiveControls(
  () => getMeetingState().meetingId,
  (event) => suggestionListeners.forEach((cb) => cb(event)),
)
const api: SanasApi = {
  updates: mockUpdates,
  meetingContext: controls.meetingContext,
  presentation: mockPresentation,
  screenCapture: mockScreenCapture(
    () => getMeetingState().meetingId,
    (event) => suggestionListeners.forEach((cb) => cb(event)),
  ),
  hotkeys: { getStatus: async () => [] },
  settings: {
    get: async () => settings,
    set: async (patch: Partial<Settings>) => {
      const { deepgramApiKey, anthropicApiKey, smtpPass, ...rest } = patch
      settings = {
        ...settings,
        ...rest,
        deepgramKeySet: settings.deepgramKeySet || !!deepgramApiKey,
        anthropicKeySet: settings.anthropicKeySet || !!anthropicApiKey,
        smtpPassSet: settings.smtpPassSet || !!smtpPass,
      }
      settingsListeners.forEach((listener) => listener(settings))
      return settings
    },
    onChanged: on(settingsListeners),
  },
  app: {
    showMain: async () => console.info('[sanas] preview: Open Sanas reveals the main window'),
  },
  overlay: {
    ...controls.overlay,
    toggle: async () => {
      window.open('/overlay.html', 'sanas-overlay', 'width=380,height=460')
    },
    resize: async () => {},
    setClickThrough: async (on) => ghostListeners.forEach((l) => l(on)),
    onGhostState: on(ghostListeners),
  },
  meeting: {
    getState: async () => getMeetingState(),
    start: async (_jobId, channels) => {
      beginMockPresentation(99, _jobId ?? jobs[0].id)
      controls.reset(99, settings.answerEveryQuestion)
      return startScript(99, channels ?? 1)
    },
    pause: async () => pauseScript(),
    resume: async (_channels) => resumeScript(),
    stop: async () => {
      endMockPresentation()
      return stopScript()
    },
    pinSpeaker: async (speaker, isUser) => pinSpeaker(speaker, isUser),
    sendAudio: () => {},
    onTranscript: on(transcriptListeners),
    onState: on(stateListeners),
  },
  assist: {
    ...controls.assist,
    now: async () => streamSuggestion('hotkey'),
    onSuggestion: on(suggestionListeners),
  },
  jobs: {
    list: async () => jobs.filter((j) => !j.archived),
    create: async (name) => {
      const job: Job = { ...jobs[2], id: Date.now(), name, createdAt: new Date().toISOString() }
      jobs.push(job)
      return job
    },
    update: async (job) => {
      const i = jobs.findIndex((j) => j.id === job.id)
      jobs[i] = { ...jobs[i], ...job }
      return jobs[i]
    },
    archive: async (id, archived) => {
      const j = jobs.find((x) => x.id === id)
      if (j) j.archived = archived
    },
  },
  glossary: {
    list: async (jobId) => glossary.filter((g) => g.jobId === jobId),
    add: async (jobId, term, note) => {
      const t = { id: Date.now(), jobId, term, note }
      glossary.push(t)
      return t
    },
    remove: async (id) => {
      const i = glossary.findIndex((g) => g.id === id)
      if (i >= 0) glossary.splice(i, 1)
    },
  },
  history: {
    ask: async (question, jobId) => {
      const askId = ++askSeq
      const hit = segments.find((s) => s.text.toLowerCase().includes('november')) ?? segments[0]
      const meeting = meetings.find((m) => m.id === hit.meetingId)!
      const sources: HistoryHit[] =
        jobId === 2
          ? []
          : [
              {
                meetingId: meeting.id,
                title: meeting.title,
                jobName: jobs.find((j) => j.id === meeting.jobId)?.name ?? 'Unsorted',
                startedAt: meeting.startedAt,
                tStartMs: hit.tStartMs,
                snippet: hit.text,
              },
            ]
      const answer =
        sources.length === 0
          ? 'Nothing in your meetings mentions that.'
          : 'Dana confirmed the November deadline for the real-time map and asked for a phase 2 estimate covering the driver app [Northwind weekly sync, 2026-09-08]. Marcus flagged ETA drift on the east routes; the geofence prototype is the planned fix. Finance needs the Azure credits review booked before the credits expire at the end of November. Your question was: ' +
            question
      const words = answer.split(' ')
      let i = 0
      const tick = (): void => {
        const done = i >= words.length
        historyListeners.forEach((l) =>
          l({
            askId,
            kind: done ? 'done' : 'delta',
            text: done ? answer : (i === 0 ? '' : ' ') + words[i],
          }),
        )
        if (!done) {
          i++
          setTimeout(tick, 40)
        }
      }
      setTimeout(tick, 300)
      return { askId, sources }
    },
    onEvent: on(historyListeners),
  },
  retention: {
    preview: async (): Promise<RetentionPreview> => ({
      meetings: 0,
      audioFiles: dueRecordings,
      orphanFiles: 0,
      audioBytes: dueRecordings * 115_700_000,
    }),
    run: async () => {
      const removed = {
        meetings: 0,
        audioFiles: dueRecordings,
        orphanFiles: 0,
        audioBytes: dueRecordings * 115_700_000,
        failed: 0,
      }
      dueRecordings = 0
      return removed
    },
  },
  meetings: {
    list: async (jobId) => meetings.filter((m) => m.jobId === jobId),
    delete: async (id) => {
      const i = meetings.findIndex((m) => m.id === id)
      if (i >= 0) meetings.splice(i, 1)
    },
    segments: async (meetingId) => segments.filter((s) => s.meetingId === meetingId),
    suggestions: async (meetingId) => suggestions.filter((s) => s.meetingId === meetingId),
    rename: async (meetingId, title) => {
      const m = meetings.find((x) => x.id === meetingId)
      if (m) m.title = title
    },
    move: async (meetingId, jobId) => {
      const m = meetings.find((x) => x.id === meetingId)
      if (m) m.jobId = jobId
    },
    export: async () => 'C:\\Users\\you\\Documents\\Northwind weekly sync.md',
    get: async (meetingId) => meetings.find((m) => m.id === meetingId) ?? null,
    merge: async (ids) => {
      const parts = meetings
        .filter((m) => ids.includes(m.id))
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      if (parts.length < 2) throw new Error('Pick at least two meetings to merge.')
      if (new Set(parts.map((m) => m.jobId)).size > 1) {
        throw new Error('Those meetings belong to different jobs — move them together first.')
      }
      const [keep, ...rest] = parts
      keep.endedAt = parts[parts.length - 1].endedAt
      const summaries = parts.map((m) => m.summary).filter(Boolean)
      keep.summary = summaries.length > 0 ? summaries.join('\n\n') : null
      for (const r of rest) {
        for (const seg of segments) if (seg.meetingId === r.id) seg.meetingId = keep.id
        meetings.splice(meetings.indexOf(r), 1)
      }
      return { meeting: keep, recordingsLeftBehind: 0 }
    },
    summarize: async (meetingId) => {
      const m = meetings.find((x) => x.id === meetingId)
      if (!m) throw new Error('Meeting not found.')
      if (!m.summary) {
        m.summary =
          'Walkthrough of the dispatch board replacement with the ops team; the live map drew questions about ETA drift on the east routes.'
        m.actionItems = '- Collect the east-route drift examples from ops'
      }
      return m
    },
    emailSummary: async (meetingId) => {
      const m = meetings.find((x) => x.id === meetingId)
      const job = jobs.find((j) => j.id === m?.jobId)
      if (!job?.summaryEmail)
        throw new Error(`No summary email set for job "${job?.name}" — add one on the job.`)
      return job.summaryEmail
    },
    search: async (query): Promise<SearchMatch[]> => {
      const q = query.trim()
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i')
      return segments
        .filter((s) => re.test(s.text))
        .map((s) => {
          const meeting = meetings.find((m) => m.id === s.meetingId)!
          return {
            meeting,
            jobName: jobs.find((j) => j.id === meeting.jobId)?.name ?? 'Unsorted',
            segmentId: s.id,
            tStartMs: s.tStartMs,
            snippet: s.text.replace(re, MATCH_OPEN + '$1' + MATCH_CLOSE),
          }
        })
    },
    speakerNames: async (meetingId) =>
      [...(speakerNames.get(meetingId) ?? new Map<number, string>())].map(([speaker, name]) => ({
        speaker,
        name,
      })),
    renameSpeaker: async (meetingId, speaker, name) => {
      const map = speakerNames.get(meetingId) ?? new Map<number, string>()
      if (name.trim()) map.set(speaker, name.trim())
      else map.delete(speaker)
      speakerNames.set(meetingId, map)
    },
    mergeSpeakers: async (meetingId, from, to) => {
      for (const s of segments) if (s.meetingId === meetingId && s.speaker === from) s.speaker = to
      speakerNames.get(meetingId)?.delete(from)
    },
    onUpdated: () => () => {},
  },
}

/** Puts the preview into a fixed state for dev/overlay-scenarios.ts: no scripted meeting runs,
 *  so every scenario renders the same way each time. */
export const mockDriver = {
  api,
  meeting(next: MeetingState): void {
    haltScript()
    setState(next)
  },
  transcript: (event: TranscriptEvent): void => emit(event),
  suggestion: (event: SuggestionEvent): void => suggestionListeners.forEach((cb) => cb(event)),
  reset: (meetingId: number): void => controls.reset(meetingId, false),
}

/** Installs the mock as window.sanas, plus a silent microphone so "Start listening"
 *  works in a browser tab: getUserMedia yields an empty stream and getDisplayMedia
 *  fails (no loopback), so This PC falls back to mono with its notice. Dev only. */
export function installMockApi(): void {
  ;(window as unknown as { sanas: SanasApi }).sanas = api
  const md = navigator.mediaDevices
  md.getUserMedia = async () => new AudioContext().createMediaStreamDestination().stream
  md.getDisplayMedia = async () => {
    throw new Error('no loopback in the browser preview')
  }
  md.enumerateDevices = async () => []
  // overlay.html has no Start button: ?demo=live runs the scripted meeting on load
  if (new URLSearchParams(location.search).get('demo') === 'live') {
    setTimeout(() => void api.meeting.start(undefined, 1), 600)
  }
  // overlay.html?scenario=<name>: a fixed preview state (see overlay-scenarios.ts)
  const scenario = new URLSearchParams(location.search).get('scenario')
  if (scenario)
    setTimeout(
      () => void import('./overlay-scenarios').then(({ applyScenario }) => applyScenario(scenario)),
      400,
    )
  console.info('[sanas] browser preview: mock API installed (no Electron)')
}
