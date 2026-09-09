import { MATCH_CLOSE, MATCH_OPEN } from '@shared/search-markers'
import type {
  GlossaryTerm,
  HistoryEvent,
  HistoryHit,
  Job,
  Meeting,
  MeetingState,
  RetentionPreview,
  SearchMatch,
  Segment,
  Settings,
  SettingsView,
  Suggestion,
  SuggestionEvent,
  TranscriptEvent,
} from '@shared/types'

// Browser preview of the renderer WITHOUT Electron: `npm run dev:web` (plain Vite) serves
// index.html / overlay.html, and this stands in for the preload bridge with
// sample data and a scripted live meeting. Only the web-preview build defines
// __SANAS_WEB_PREVIEW__ as true (vite.renderer.config.ts); the Electron build defines it
// false, so a broken preload in Electron dev still fails loudly instead of being masked.
// Typed against SanasApi (via the global Window augmentation) so it cannot drift.

type SanasApi = Window['sanas']

const jobs: Job[] = [
  {
    id: 1,
    name: 'Northwind Traders',
    companyInfo: 'Regional logistics firm in Portland. CTO Dana Whitfield sponsors the project.',
    projectScope: 'Replace the dispatch board with a real-time map; phase 2 is the driver app.',
    notes: 'They dislike jargon. Budget review every quarter.',
    talkingPoints: 'Phase 2 timeline. The Azure credits expire in November.',
    persona: 'Calm, concrete, numbers first.',
    summaryEmail: 'dana@northwind.example',
    createdAt: '2026-08-12 09:14:00',
    archived: false,
  },
  {
    id: 2,
    name: 'Lumen Health',
    companyInfo: 'Three-clinic group. Compliance officer joins most calls.',
    projectScope: 'HIPAA-safe patient intake forms with e-signature.',
    notes: '',
    talkingPoints: 'Pilot at the Beaverton clinic first.',
    persona: 'Warm, careful with promises.',
    summaryEmail: '',
    createdAt: '2026-08-20 13:40:00',
    archived: false,
  },
  {
    id: 3,
    name: 'Unsorted',
    companyInfo: '',
    projectScope: '',
    notes: '',
    talkingPoints: '',
    persona: '',
    summaryEmail: '',
    createdAt: '2026-08-12 09:00:00',
    archived: false,
  },
]

const glossary: GlossaryTerm[] = [
  { id: 1, jobId: 1, term: 'dispatch board', note: '' },
  { id: 2, jobId: 1, term: 'ETA drift', note: 'gap between promised and actual arrival' },
  { id: 3, jobId: 1, term: 'geofence', note: '' },
  { id: 4, jobId: 1, term: 'Azure Maps', note: '' },
  { id: 5, jobId: 2, term: 'intake form', note: '' },
]

const meetings: Meeting[] = [
  {
    id: 11,
    jobId: 1,
    title: 'Northwind weekly sync',
    startedAt: '2026-09-08 15:02:11',
    endedAt: '2026-09-08 15:47:30',
    audioPath: 'C:\\Users\\you\\AppData\\Roaming\\sanas\\audio\\meeting-11.wav',
    summary:
      'Dana confirmed the November deadline for the real-time map and asked for a phase 2 estimate covering the driver app. Marcus raised ETA drift on the east routes; the geofence prototype should answer it. Finance needs the Azure credits review booked before the end of the month.',
    actionItems:
      '- Send the phase 2 estimate by Friday\n- Book the Azure credits review with finance\n- Share the geofence prototype link with Marcus',
  },
  {
    id: 12,
    jobId: 1,
    title: 'Dispatch board demo',
    startedAt: '2026-09-02 10:30:04',
    endedAt: '2026-09-02 11:12:50',
    audioPath: 'C:\\Users\\you\\AppData\\Roaming\\sanas\\audio\\meeting-12.wav',
    summary: null,
    actionItems: null,
  },
  {
    id: 13,
    jobId: 2,
    title: 'Lumen intake kickoff',
    startedAt: '2026-09-05 14:00:22',
    endedAt: '2026-09-05 14:41:09',
    audioPath: null,
    summary:
      'Kickoff for the intake forms pilot. The compliance officer wants audit logging on every edit; the Beaverton clinic goes first in October.',
    actionItems: '- Draft the audit-log spec\n- Confirm the Beaverton pilot date',
  },
]

const segments: Segment[] = [
  [0, 0, 4200, 0, false, "Morning everyone. Let's start with where the map is at."],
  [
    1,
    4600,
    12900,
    -1,
    true,
    'The live map is on staging with real GPS from six trucks. Latency is under two seconds.',
  ],
  [
    2,
    13400,
    19800,
    1,
    false,
    'Nice. The east routes still show ETA drift though, sometimes fifteen minutes.',
  ],
  [
    3,
    20300,
    27100,
    -1,
    true,
    "That's the geofence work. The prototype snaps arrival to the yard boundary instead of the pin.",
  ],
  [
    4,
    27600,
    33000,
    0,
    false,
    'Can we have that in the November release? Finance is asking about the timeline.',
  ],
  [
    5,
    33500,
    40200,
    -1,
    true,
    'Yes. The map ships in November; the driver app is phase 2 and I will send an estimate this week.',
  ],
  [
    6,
    40700,
    46900,
    0,
    false,
    'Good. And the Azure credits — do those expire before or after we go live?',
  ],
  [
    7,
    47300,
    53800,
    -1,
    true,
    'End of November. We should book the review with finance before then.',
  ],
  [8, 54200, 58100, 1, false, 'I can set that up. Send me the geofence link when it is ready?'],
  [9, 58500, 61000, -1, true, 'Will do, right after this.'],
].map(([id, tStartMs, tEndMs, speaker, isUser, text]) => ({
  id: id as number,
  meetingId: 11,
  tStartMs: tStartMs as number,
  tEndMs: tEndMs as number,
  speaker: speaker as number,
  isUser: isUser as boolean,
  text: text as string,
}))

const speakerNames = new Map<number, Map<number, string>>([
  [
    11,
    new Map([
      [0, 'Dana'],
      [1, 'Marcus'],
    ]),
  ],
])

const suggestions: Suggestion[] = [
  {
    id: 1,
    meetingId: 11,
    tMs: 46_900,
    trigger: 'ambient',
    text: 'Mention the Azure credits expire at the end of November — finance needs the review booked first.',
  },
  {
    id: 2,
    meetingId: 11,
    tMs: 27_600,
    trigger: 'hotkey',
    text: 'Yes — the real-time map ships in November. The driver app is phase 2; you can send a scoped estimate this week so finance has a number for the quarterly review. If they push for both in November, offer the geofence fix in the November release and the driver app beta in January.',
  },
]

let settings: SettingsView = {
  deepgramKeySet: true,
  anthropicKeySet: true,
  anthropicWorkspaceId: '',
  overlayHotkey: 'CommandOrControl+Shift+Space',
  assistHotkey: 'CommandOrControl+Shift+Enter',
  audioDeviceId: '',
  recordAudio: true,
  meetingSource: 'elsewhere',
  overlayOpacity: 0.95,
  overlayBounds: null,
  summaryEmailAuto: false,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpUser: 'you@gmail.com',
  smtpPassSet: true,
  audioRetentionDays: 90,
  meetingRetentionDays: 0,
}

// --- a scripted live meeting so Live + overlay can be previewed with motion ---

type Listener<T> = (ev: T) => void
const transcriptListeners = new Set<Listener<TranscriptEvent>>()
const stateListeners = new Set<Listener<MeetingState>>()
const suggestionListeners = new Set<Listener<SuggestionEvent>>()
const ghostListeners = new Set<Listener<boolean>>()
const historyListeners = new Set<Listener<HistoryEvent>>()
let askSeq = 0
let state: MeetingState = { meetingId: null, status: 'idle' }
let liveTimer: ReturnType<typeof setTimeout> | null = null
let liveChannels = 1
const pinned = new Set<number>()
let suggestionSeq = 0
let scriptAt = 0 // where the scripted meeting got to, so resume continues it
let scriptTimeMs = 0
let dueRecordings = 2 // retention preview: cleaned up by run()

const SCRIPT: { speaker: number; user: boolean; text: string }[] = [
  { speaker: 0, user: false, text: 'Thanks for joining. Where are we on the intake forms?' },
  {
    speaker: 1,
    user: true,
    text: 'The form builder is done and the e-signature flow is in review.',
  },
  { speaker: 2, user: false, text: 'Does every edit get logged? Compliance will ask.' },
  {
    speaker: 1,
    user: true,
    text: 'Every field change, with who and when. I can show the audit view.',
  },
  { speaker: 0, user: false, text: 'What would it take to pilot at Beaverton in October?' },
  {
    speaker: 1,
    user: true,
    text: 'Two weeks of staff training and the clinic admin account set up.',
  },
  {
    speaker: 2,
    user: false,
    text: 'And how do you handle a patient who refuses to sign electronically?',
  },
]

function setState(next: MeetingState): void {
  state = next
  stateListeners.forEach((l) => l(state))
}

function emit(ev: TranscriptEvent): void {
  transcriptListeners.forEach((l) => l(ev))
}

function runScript(meetingId: number, i: number, t: number): void {
  if (state.status !== 'live') return
  scriptAt = i
  scriptTimeMs = t
  const line = SCRIPT[i % SCRIPT.length]
  // stereo: the user is channel 0 → speaker -1, isUser; mono: a diarized index, pinned or not
  const speaker = liveChannels === 2 && line.user ? -1 : line.speaker
  const isUser = liveChannels === 2 ? line.user : pinned.has(line.speaker)
  const words = line.text.split(' ')
  const partial = words.slice(0, Math.ceil(words.length / 2)).join(' ')
  const base = { meetingId, speaker, isUser, tStartMs: t, tEndMs: t + 3000 }
  emit({ ...base, isFinal: false, text: partial })
  liveTimer = setTimeout(() => {
    if (state.status !== 'live') return
    emit({ ...base, isFinal: true, text: line.text })
    liveTimer = setTimeout(() => runScript(meetingId, i + 1, t + 4500), 1800)
  }, 1200)
}

function streamSuggestion(trigger: 'ambient' | 'hotkey'): void {
  const id = ++suggestionSeq
  const text =
    trigger === 'hotkey'
      ? 'Say that paper stays available: the form prints to a PDF the front desk can sign by hand, and the scan is attached to the same record. Then ask whether Beaverton wants that in the pilot.'
      : 'Offer the printed fallback — a signed scan attaches to the same record.'
  const words = text.split(' ')
  let i = 0
  const tick = (): void => {
    if (i >= words.length) {
      suggestionListeners.forEach((l) =>
        l({ suggestionId: id, meetingId: state.meetingId ?? 0, trigger, kind: 'done', text }),
      )
      return
    }
    suggestionListeners.forEach((l) =>
      l({
        suggestionId: id,
        meetingId: state.meetingId ?? 0,
        trigger,
        kind: 'delta',
        text: (i === 0 ? '' : ' ') + words[i],
      }),
    )
    i++
    setTimeout(tick, 60)
  }
  tick()
}

const on =
  <T>(set: Set<Listener<T>>) =>
  (cb: Listener<T>): (() => void) => {
    set.add(cb)
    return () => set.delete(cb)
  }

const api: SanasApi = {
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
      return settings
    },
  },
  overlay: {
    toggle: async () => {
      window.open('/overlay.html', 'sanas-overlay', 'width=380,height=460')
    },
    setClickThrough: async (on) => ghostListeners.forEach((l) => l(on)),
    onGhostState: on(ghostListeners),
  },
  meeting: {
    start: async (_jobId, channels) => {
      liveChannels = channels ?? 1
      pinned.clear()
      setState({ meetingId: 99, status: 'live' })
      scriptAt = 0
      scriptTimeMs = 0
      setTimeout(() => runScript(99, 0, 0), 800)
      return state
    },
    pause: async () => {
      if (liveTimer) clearTimeout(liveTimer)
      setState({ meetingId: state.meetingId, status: 'paused' })
      return state
    },
    resume: async (_channels) => {
      const id = state.meetingId ?? 99
      setState({ meetingId: id, status: 'live' })
      setTimeout(() => runScript(id, scriptAt, scriptTimeMs), 600)
      return state
    },
    stop: async () => {
      if (liveTimer) clearTimeout(liveTimer)
      setState({ meetingId: null, status: 'idle' })
      return state
    },
    pinSpeaker: async (speaker, isUser) => {
      if (isUser) pinned.add(speaker)
      else pinned.delete(speaker)
    },
    sendAudio: () => {},
    onTranscript: on(transcriptListeners),
    onState: on(stateListeners),
  },
  assist: {
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
      audioBytes: dueRecordings * 115_700_000,
    }),
    run: async () => {
      const removed = {
        meetings: 0,
        audioFiles: dueRecordings,
        audioBytes: dueRecordings * 115_700_000,
        failed: 0,
        orphanFiles: 0,
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
  console.info('[sanas] browser preview: mock API installed (no Electron)')
}
