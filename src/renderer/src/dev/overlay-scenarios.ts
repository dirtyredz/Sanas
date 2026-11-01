import type { SuggestionEvent } from '@shared/types'
import type { Slide } from '@shared/presentation/types'
import { mockDriver } from './mock-api'
import { beginMockPresentation, mockPresentation } from './mock-presentation'
import { setMockCaptureStatus } from './mock-screen-capture'

// Deterministic overlay preview states: open overlay.html?scenario=<name> under
// `npm run dev:web`. Each scenario sets the meeting, transcript, answers, deck and capture
// status directly — no timers — so screenshots and reviews see the same overlay every time.

const MEETING = 99
const DECK_JOB = 990

const LINES = [
  { speaker: 0, isUser: false, text: 'What blocks the pilot at Beaverton?' },
  { speaker: -1, isUser: true, text: 'The audit-log check. It runs tonight.' },
  { speaker: 1, isUser: false, text: 'Can we finish the rollout today if it passes?' },
  {
    speaker: 0,
    isUser: false,
    text: 'And who signs off on the clinic admin accounts',
    interim: true,
  },
]

const ANSWER =
  '**Ship the pilot after the audit-log check passes.**\nThen confirm the date with Dana.'
const CODE_ANSWER =
  '**Guard `user` before `load()` reads it.**\n```ts\n' +
  Array.from(
    { length: 24 },
    (_, i) => `const step${i} = await check(user?.id, ${i}) // verify`,
  ).join('\n') +
  '\n```\nRe-run the failing test after the guard.'
const DETAIL =
  '**`user` is undefined when `load()` runs before login**\n\nThe visible error is `TypeError` at `app.ts:42`.\n\n' +
  'Likely cause (inferred): `load()` runs before the session resolves.\n\n```ts\nconst id = user?.id\nif (!id) return\n```\n\n' +
  'Verify: reload and confirm the console is clean.'
const WARNING =
  'No system audio detected — voices heard by the mic will be labeled Me. Check which speaker your call app plays to.'

const DECK: Slide[] = [
  {
    title: 'Why now',
    talkingPoint: 'Clinics lose a day a week to paper.',
    script: '',
    keyFacts: '',
  },
  {
    title: 'Rollout checkpoints',
    talkingPoint: 'Explain how rollout is checked.',
    script: Array.from(
      { length: 12 },
      (_, i) => `Checkpoint ${i + 1}: the audit log is reviewed before the next clinic goes live.`,
    ).join('\n\n'),
    keyFacts: '3 clinics in October. 2 weeks of staff training each.',
  },
  { title: 'Questions', talkingPoint: 'Invite questions.', script: '', keyFacts: '' },
]

let seq = 500

function answer(text: string, over: Partial<SuggestionEvent> = {}, streaming = false): void {
  const id = ++seq
  const base = {
    suggestionId: id,
    meetingId: MEETING,
    trigger: 'ambient' as const,
    purpose: 'answer' as const,
    groundingContextId: 1,
    ...over,
  }
  mockDriver.suggestion({ ...base, kind: 'start', text: '' })
  mockDriver.suggestion(
    streaming
      ? { ...base, kind: 'delta', text: text.slice(0, 40) }
      : { ...base, kind: 'done', text, storedSuggestionId: id },
  )
}

/** Starts the fixed meeting; resolves once the overlay has rendered it, so answers that follow
 *  are not dropped as belonging to no meeting. */
async function live(status: 'live' | 'paused' | 'error' = 'live', extra = {}): Promise<void> {
  mockDriver.reset(MEETING)
  mockDriver.meeting({ meetingId: MEETING, status, ...extra })
  // the overlay clears its transcript and history for a new meeting once it renders it
  await new Promise((resolve) => setTimeout(resolve, 150))
  LINES.forEach((line, i) =>
    mockDriver.transcript({
      meetingId: MEETING,
      speaker: line.speaker,
      isUser: line.isUser,
      text: line.text,
      isFinal: !line.interim,
      tStartMs: i * 4000,
      tEndMs: i * 4000 + 3000,
    }),
  )
  await new Promise((resolve) => setTimeout(resolve, 50))
}

const SCENARIOS: Record<string, () => void | Promise<void>> = {
  idle: () => {},
  listening: () => live(),
  answer: async () => {
    await live()
    answer(ANSWER)
  },
  history: async () => {
    await live()
    answer('**Offer the printed fallback.**')
    answer('**Two weeks of training per clinic.**')
    answer(ANSWER)
  },
  code: async () => {
    await live()
    answer(CODE_ANSWER, { trigger: 'hotkey' })
  },
  streaming: async () => {
    await live()
    answer(ANSWER, { trigger: 'hotkey' }, true)
  },
  detail: async () => {
    await live()
    answer(DETAIL, { trigger: 'hotkey', manualKind: 'capture' })
  },
  warning: async () => {
    await live('live', { captureWarning: WARNING })
    answer(ANSWER)
  },
  paused: async () => {
    await live('paused')
  },
  error: () =>
    live('error', {
      error: 'Deepgram rejected the API key. Check Settings → API keys, then resume the meeting.',
    }),
  deck: async () => {
    await mockPresentation.replaceJobSlides(DECK_JOB, DECK)
    beginMockPresentation(MEETING, DECK_JOB)
    await live()
    await mockPresentation.move({ meetingId: MEETING, direction: 'next' })
    answer('**Explain how rollout is checked.**', { purpose: 'next-point' })
  },
  capturing: async () => {
    await live()
    setMockCaptureStatus({ meetingId: MEETING, phase: 'capturing', message: 'Capturing…' })
  },
  'capture-failed': async () => {
    await live()
    setMockCaptureStatus({
      meetingId: MEETING,
      phase: 'failed',
      message: 'The capture came back empty (a locked or protected screen). Try again.',
    })
  },
  rejected: async () => {
    await live()
    answer(ANSWER)
    mockDriver.api.assist.request = async () => ({
      accepted: false,
      reason: 'busy',
      message: 'Another requested answer is still streaming. Your question is kept.',
    })
  },
}

export const SCENARIO_NAMES = Object.keys(SCENARIOS)

export async function applyScenario(name: string): Promise<void> {
  const scenario = SCENARIOS[name]
  if (!scenario) {
    console.warn(`[sanas] unknown overlay scenario "${name}"; try: ${SCENARIO_NAMES.join(', ')}`)
    return
  }
  await scenario()
  console.info(`[sanas] overlay scenario: ${name}`)
}
