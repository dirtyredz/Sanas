import type { GlossaryTerm, Job, Meeting, Segment, SettingsView, Suggestion } from '@shared/types'

// Static sample data for the browser preview. The arrays are shared mutable state: the mock
// bridge in mock-api.ts edits them in place (create job, rename meeting, merge, ...).

export const jobs: Job[] = [
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

export const glossary: GlossaryTerm[] = [
  { id: 1, jobId: 1, term: 'dispatch board', note: '' },
  { id: 2, jobId: 1, term: 'ETA drift', note: 'gap between promised and actual arrival' },
  { id: 3, jobId: 1, term: 'geofence', note: '' },
  { id: 4, jobId: 1, term: 'Azure Maps', note: '' },
  { id: 5, jobId: 2, term: 'intake form', note: '' },
]

export const meetings: Meeting[] = [
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

export const segments: Segment[] = [
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

export const speakerNames = new Map<number, Map<number, string>>([
  [
    11,
    new Map([
      [0, 'Dana'],
      [1, 'Marcus'],
    ]),
  ],
])

export const suggestions: Suggestion[] = [
  {
    id: 1,
    meetingId: 11,
    tMs: 46_900,
    trigger: 'ambient',
    purpose: 'answer',
    text: 'Mention the Azure credits expire at the end of November — finance needs the review booked first.',
  },
  {
    id: 2,
    meetingId: 11,
    tMs: 27_600,
    trigger: 'hotkey',
    purpose: 'answer',
    text: 'Yes — the real-time map ships in November. The driver app is phase 2; you can send a scoped estimate this week so finance has a number for the quarterly review. If they push for both in November, offer the geofence fix in the November release and the driver app beta in January.',
  },
  {
    id: 3,
    meetingId: 11,
    tMs: 38_200,
    trigger: 'ambient',
    purpose: 'next-point',
    text: "**202 means accepted for processing; completion still needs confirmation.**\nNext, explain how we check the job's status.",
  },
]

export const sampleSettings: SettingsView = {
  deepgramKeySet: true,
  anthropicKeySet: true,
  anthropicWorkspaceId: '',
  nudgeModel: 'claude-sonnet-5-5',
  answerModel: 'claude-opus-5-5',
  classifierModel: 'claude-haiku-5-5',
  answerEveryQuestion: false,
  composeHotkey: 'Control+Shift+K',
  coachWhileTalking: false,
  nudgeCooldownSec: 5,
  whisperMode: 'smart',
  overlayHotkey: 'CommandOrControl+Shift+Space',
  assistHotkey: 'CommandOrControl+Shift+Enter',
  captureHotkey: 'Control+Shift+S',
  presentationPrevHotkey: 'CommandOrControl+Alt+PageUp',
  presentationNextHotkey: 'CommandOrControl+Alt+PageDown',
  audioDeviceId: '',
  recordAudio: true,
  meetingSource: 'elsewhere',
  overlayOpacity: 0.95,
  overlayBounds: null,
  overlayWhisperRatio: 0.27,
  summaryEmailAuto: false,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpUser: 'you@gmail.com',
  smtpPassSet: true,
  audioRetentionDays: 90,
  meetingRetentionDays: 0,
}
