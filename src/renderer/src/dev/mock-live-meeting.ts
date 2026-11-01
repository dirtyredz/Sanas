import type { MeetingState, SuggestionEvent, TranscriptEvent } from '@shared/types'

// The browser preview's scripted live meeting: meeting state, event listeners, the scripted
// transcript and the streamed suggestions. mock-api.ts wires these into the SanasApi.

export type Listener<T> = (ev: T) => void
export const transcriptListeners = new Set<Listener<TranscriptEvent>>()
export const stateListeners = new Set<Listener<MeetingState>>()
export const suggestionListeners = new Set<Listener<SuggestionEvent>>()
let state: MeetingState = { meetingId: null, status: 'idle' }
let liveTimer: ReturnType<typeof setTimeout> | null = null
let liveChannels = 1
const pinned = new Set<number>()
let suggestionSeq = 0
let scriptAt = 0 // where the scripted meeting got to, so resume continues it
let scriptTimeMs = 0

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

export const getMeetingState = (): MeetingState => state

export function setState(next: MeetingState): void {
  state = next
  stateListeners.forEach((l) => l(state))
}

export function emit(ev: TranscriptEvent): void {
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
    // coach demo: the user is explaining, so one buffered next point arrives (start, then done)
    if (i === 3) streamSuggestion('ambient', 'next-point')
    liveTimer = setTimeout(() => runScript(meetingId, i + 1, t + 4500), 1800)
  }, 1200)
}

export function streamSuggestion(
  trigger: 'ambient' | 'hotkey',
  purpose: 'answer' | 'next-point' = 'answer',
): void {
  const id = ++suggestionSeq
  const meetingId = state.meetingId ?? 0
  if (purpose === 'next-point') {
    // coach output is buffered: no deltas, just start immediately followed by done
    const text =
      "**202 means accepted for processing; completion still needs confirmation.**\nNext, explain how we check the job's status."
    const ev = { suggestionId: id, meetingId, trigger, purpose }
    suggestionListeners.forEach((l) => l({ ...ev, kind: 'start', text: '' }))
    suggestionListeners.forEach((l) => l({ ...ev, kind: 'done', text }))
    return
  }
  const text =
    trigger === 'hotkey'
      ? 'Say that paper stays available: the form prints to a PDF the front desk can sign by hand, and the scan is attached to the same record. Then ask whether Beaverton wants that in the pilot.'
      : 'Offer the printed fallback — a signed scan attaches to the same record.'
  const words = text.split(' ')
  let i = 0
  suggestionListeners.forEach((l) =>
    l({ suggestionId: id, meetingId, trigger, purpose, kind: 'start', text: '' }),
  )
  const tick = (): void => {
    if (i >= words.length) {
      suggestionListeners.forEach((l) =>
        l({ suggestionId: id, meetingId, trigger, purpose, kind: 'done', text }),
      )
      return
    }
    suggestionListeners.forEach((l) =>
      l({
        suggestionId: id,
        meetingId,
        trigger,
        purpose,
        kind: 'delta',
        text: (i === 0 ? '' : ' ') + words[i],
      }),
    )
    i++
    setTimeout(tick, 60)
  }
  tick()
}

/** Subscribes to one listener set and returns the unsubscribe. */
export const on =
  <T>(set: Set<Listener<T>>) =>
  (cb: Listener<T>): (() => void) => {
    set.add(cb)
    return () => set.delete(cb)
  }

/** Starts the scripted meeting from the top. */
export function startScript(meetingId: number, channels: number): MeetingState {
  liveChannels = channels
  pinned.clear()
  setState({ meetingId, status: 'live' })
  scriptAt = 0
  scriptTimeMs = 0
  setTimeout(() => runScript(meetingId, 0, 0), 800)
  return state
}

/** Stops the script's pending line, leaving the state as it is. */
export function haltScript(): void {
  if (liveTimer) clearTimeout(liveTimer)
}

export function pauseScript(): MeetingState {
  haltScript()
  setState({ meetingId: state.meetingId, status: 'paused' })
  return state
}

/** Continues the script where it stopped. */
export function resumeScript(): MeetingState {
  const id = state.meetingId ?? 99
  setState({ meetingId: id, status: 'live' })
  setTimeout(() => runScript(id, scriptAt, scriptTimeMs), 600)
  return state
}

export function stopScript(): MeetingState {
  haltScript()
  setState({ meetingId: null, status: 'idle' })
  return state
}

export function pinSpeaker(speaker: number, isUser: boolean): void {
  if (isUser) pinned.add(speaker)
  else pinned.delete(speaker)
}
