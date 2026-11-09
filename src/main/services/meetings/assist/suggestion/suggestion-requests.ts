import { meetingContextBlock } from '../../../assistant/live-controls/prompts'
import type { Settings } from '@shared/types'
import { speakerLabel, type SpeakerNames } from '../../../turns/transcript-format'
import type { CompletedTurn } from '../../../turns/types'
import {
  assistProfile,
  buildUserContent,
  type AnswerFocus,
  type TranscriptLine,
} from '../../../assistant/prompts'
import type { LatestQuestion } from '../../../assistant/answer-context/anchor'
import type { ToldStory } from '../../../assistant/answer-context/told-stories'
import type { QuestionTurn } from '../../../turns/latest-question'
import {
  COACH_PROFILE,
  buildCoachUserContent,
  type CoachPromptInput,
} from '../../../assistant/coach/coach-prompts'
import { suggestionTimeoutMs, type SuggestionTrigger } from './suggestion-in-flight'
import type { SuggestionRequest } from './suggestion-runner'

// Turns "what the meeting looks like right now" plus the saved settings into a complete,
// self-contained SuggestionRequest. Pure; the snapshot is taken synchronously by the
// caller, so nothing here can observe state that changes while a request runs.

/** Frozen same-job evidence for one answer request; the history session implements it. */
export type EvidenceHandle = { ready: Promise<string>; cancel(): void }

/** The live meeting at the moment a request is built. */
export interface AssistSnapshot {
  /** The meeting's current context text (owner-supplied, per meeting). */
  meetingText?: string
  contextRevision?: number
  groundingContextId?: number
  meetingId: number
  /** The meeting clock (audio received), which stored suggestion times use. */
  atMs: number
  /** The meeting's cached system prompt: persona + job context pack + glossary. */
  system: string
  window: TranscriptLine[]
  names?: SpeakerNames
  /** Headlines of suggestions already shown this meeting, oldest first (next points). */
  recent: readonly string[]
  /** Answers already told this meeting, oldest first (automatic and Answer now prompts). */
  told: readonly ToldStory[]
}

export type AssistSettings = Pick<
  Settings,
  | 'anthropicApiKey'
  | 'anthropicWorkspaceId'
  | 'nudgeModel'
  | 'answerModel'
  | 'classifierModel'
  | 'whisperMode'
  | 'nudgeCooldownSec'
  | 'coachWhileTalking'
>

/** An answer: automatic (to a classified turn) or requested ("Answer now"). Streams.
 *  Both name the question they answer when there is one (`focus`), and see the stories
 *  already told; only an automatic answer may decline with the no-op. */
export function answerRequest(
  snap: AssistSnapshot,
  s: AssistSettings,
  trigger: SuggestionTrigger,
  focus?: AnswerFocus,
  evidence = '',
): SuggestionRequest {
  const profile = assistProfile(trigger, s.whisperMode)
  const automatic = trigger === 'ambient'
  return {
    meetingId: snap.meetingId,
    trigger,
    purpose: 'answer',
    profile: profile.kind,
    atMs: snap.atMs,
    apiKey: s.anthropicApiKey,
    workspaceId: s.anthropicWorkspaceId || undefined,
    model: profile.useAnswerModel ? s.answerModel : s.nudgeModel,
    system: snap.system,
    groundingContextId: snap.groundingContextId,
    contextRevision: snap.contextRevision,
    userContent:
      buildUserContent(snap.window, trigger, s.whisperMode, {
        names: snap.names,
        focus,
        told: snap.told,
      }) +
      meetingContextBlock(snap.meetingText ?? '') +
      evidence,
    // points/smart ambient output stays terse; full mode and hotkey answers get code room
    maxTokens: profile.maxTokens,
    effort: profile.effort,
    timeoutMs: suggestionTimeoutMs(trigger, profile.kind === 'full'),
    delivery: 'stream',
    allowNoop: automatic,
  }
}

/** The automatic answer to a completed turn, carrying the still-unanswered questions
 *  `asked` (oldest first; may include `turn` itself, which is always the focus). One neutral
 *  prompt serves every accepted verdict, so the request built before the classifier speaks
 *  (the speculation) and the one rebuilt after it are the same prompt when nothing else
 *  moved. 'reference': a turn put to another participant, answered for the owner's reference
 *  under Answer every question (a different prompt, never a published speculation). */
export function automaticAnswerRequest(
  snap: AssistSnapshot,
  s: AssistSettings,
  turn: CompletedTurn,
  asked: CompletedTurn[],
  audience: 'automatic' | 'reference' = 'automatic',
  evidence = '',
): SuggestionRequest {
  const label = (t: CompletedTurn): string =>
    speakerLabel({ speaker: t.speaker, isUser: false }, snap.names)
  const earlier = asked.filter((t) => t !== turn)
  return {
    ...answerRequest(
      snap,
      s,
      'ambient',
      {
        kind: 'turn',
        turn: {
          speaker: label(turn),
          text: turn.text,
          ...(audience === 'reference' ? { reference: true } : {}),
          earlier: earlier.length
            ? earlier.map((t) => ({ speaker: label(t), text: t.text }))
            : undefined,
          startMs: Math.min(turn.startMs, ...earlier.map((t) => t.startMs)),
        },
      },
      evidence,
    ),
    diagnosticTurns: asked,
  }
}

/** The one place a turns-side `QuestionTurn` becomes the prompt's `LatestQuestion` (speaker
 *  label resolved from the meeting's names). Answer now uses all of it; a next point reads
 *  the speaker, text and start. */
function promptQuestion(snap: AssistSnapshot, q: QuestionTurn): LatestQuestion {
  return {
    speaker: speakerLabel({ speaker: q.speaker, isUser: false }, snap.names),
    text: q.text,
    startMs: q.startMs,
    open: q.open,
  }
}

/** "Answer now": anchored on the most recent question when there is one (F1, DECISIONS
 *  2026-11-04); without one it answers from the rolling window as before. */
export function answerNowRequest(
  snap: AssistSnapshot,
  s: AssistSettings,
  question: QuestionTurn | null,
  evidence = '',
): SuggestionRequest {
  return answerRequest(
    snap,
    s,
    'hotkey',
    question ? { kind: 'latest', question: promptQuestion(snap, question) } : undefined,
    evidence,
  )
}

/** Request fields that do NOT make two requests a different prompt. `atMs` only stamps the
 *  stored suggestion's audio time; `accept` is a per-request closure (buffered requests only,
 *  never a speculation) that could never compare equal. Everything else, including
 *  `contextRevision` and `delivery`/`maxRetries` (provider behaviour), counts: a NEW field is
 *  compared by default, so a speculation can never be published for a request that differs
 *  in something nobody remembered to list. */
const NOT_PROMPT = new Set<keyof SuggestionRequest>(['atMs', 'accept'])

export type PromptMismatchCategory =
  'image' | 'carried-turns' | 'user-content' | 'grounding-context' | 'model-profile' | 'other'

/** What differs between `a` and `b` as prompts; empty means they would send the same prompt
 *  with the same provenance, so a speculation started for `a` may be published as the answer
 *  to `b`. Screenshots never match (a held image is single-use), and the diagnostic turn
 *  spans match by identity. Names only: user content combines transcript, ledger and meeting
 *  context; do not infer which sub-block changed from a flattened prompt. New fields still
 *  compare by default. */
export function promptMismatchCategories(
  a: SuggestionRequest,
  b: SuggestionRequest,
): PromptMismatchCategory[] {
  const changed = new Set<PromptMismatchCategory>()
  if (a.image || b.image) changed.add('image')
  const turnsA = a.diagnosticTurns ?? []
  const turnsB = b.diagnosticTurns ?? []
  if (turnsA.length !== turnsB.length || !turnsA.every((t, i) => t === turnsB[i]))
    changed.add('carried-turns')
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof SuggestionRequest)[])
  for (const k of keys) {
    if (k === 'diagnosticTurns' || k === 'image' || NOT_PROMPT.has(k)) continue
    if (a[k] !== b[k])
      changed.add(
        k === 'userContent'
          ? 'user-content'
          : ['system', 'cacheableContext', 'groundingContextId', 'contextRevision'].includes(k)
            ? 'grounding-context'
            : ['model', 'profile', 'maxTokens', 'effort'].includes(k)
              ? 'model-profile'
              : 'other',
      )
  }
  return [...changed].sort()
}

/** A next point while the user talks: ambient lane, nudge model, its own short profile,
 *  buffered so nothing is shown unless the complete result is accepted. */
export function coachRequest(
  snap: AssistSnapshot,
  s: AssistSettings,
  input: Omit<CoachPromptInput, 'window' | 'names' | 'recent' | 'question'> & {
    question?: QuestionTurn | null
  },
  accept: (text: string) => boolean,
): SuggestionRequest {
  return {
    meetingId: snap.meetingId,
    trigger: 'ambient',
    purpose: 'next-point',
    atMs: snap.atMs,
    apiKey: s.anthropicApiKey,
    workspaceId: s.anthropicWorkspaceId || undefined,
    model: s.nudgeModel,
    system: snap.system,
    contextRevision: snap.contextRevision,
    userContent:
      meetingContextBlock(snap.meetingText ?? '', true) +
      buildCoachUserContent({
        excerpt: input.excerpt,
        reason: input.reason,
        window: snap.window,
        names: snap.names,
        recent: snap.recent,
        question: input.question ? promptQuestion(snap, input.question) : undefined,
      }),
    maxTokens: COACH_PROFILE.maxTokens,
    effort: COACH_PROFILE.effort,
    timeoutMs: suggestionTimeoutMs('ambient', false, 'next-point'),
    maxRetries: COACH_PROFILE.maxRetries,
    delivery: 'buffered',
    allowNoop: true,
    accept,
  }
}
