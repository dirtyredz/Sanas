import { meetingContextBlock } from '../../assistant/live-controls/prompts'
import type { Settings } from '@shared/types'
import type { PresentationState } from '@shared/presentation/types'
import { presentationCoachContent, presentationHint } from '../../assistant/presentation/prompts'
import { COMPACT_CONTRACT, recentSuggestionsBlock } from '../../assistant/compact-contract'
import { speakerLabel, type SpeakerNames } from '../../turns/transcript-format'
import type { CompletedTurn } from '../../turns/types'
import type { Addressee, ResponseKind } from '../../assistant/classifier'
import {
  assistProfile,
  buildUserContent,
  type LatestQuestion,
  type TranscriptLine,
  type TriggeringTurn,
} from '../../assistant/prompts'
import type { ToldStory } from '../../assistant/answer-context/told-stories'
import type { QuestionTurn } from '../../turns/latest-question'
import {
  COACH_PROFILE,
  buildCoachUserContent,
  type CoachPromptInput,
} from '../../assistant/coach/coach-prompts'
import { suggestionTimeoutMs, type SuggestionTrigger } from './suggestion-in-flight'
import type { SuggestionRequest } from './suggestion-runner'

// Turns "what the meeting looks like right now" plus the saved settings into a complete,
// self-contained SuggestionRequest. Pure; the snapshot is taken synchronously by the
// caller, so nothing here can observe state that changes while a request runs.

/** The live meeting at the moment a request is built. */
export interface AssistSnapshot {
  cacheableContext?: string
  meetingText?: string
  contextRevision?: number
  groundingContextId?: number
  presentation?: PresentationState
  coachSystem?: string
  coachEvidence?: { text: string; incomplete: boolean }
  coachRecent?: readonly string[]
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
 *  Both name the question they answer when there is one, and see the stories already told;
 *  only an automatic answer may decline with the no-op. */
export function answerRequest(
  snap: AssistSnapshot,
  s: AssistSettings,
  trigger: SuggestionTrigger,
  turn?: TriggeringTurn,
  latest?: LatestQuestion,
): SuggestionRequest {
  const profile = assistProfile(trigger, s.whisperMode)
  const automatic = trigger === 'ambient'
  return {
    meetingId: snap.meetingId,
    trigger,
    purpose: 'answer',
    atMs: snap.atMs,
    apiKey: s.anthropicApiKey,
    workspaceId: s.anthropicWorkspaceId || undefined,
    model: profile.useAnswerModel ? s.answerModel : s.nudgeModel,
    system: snap.system,
    cacheableContext: snap.cacheableContext,
    groundingContextId: snap.groundingContextId,
    contextRevision: snap.contextRevision,
    userContent:
      buildUserContent(snap.window, trigger, s.whisperMode, {
        names: snap.names,
        turn,
        latest,
        told: snap.told,
      }) +
      (snap.presentation ? presentationHint(snap.presentation) : '') +
      meetingContextBlock(snap.meetingText ?? ''),
    // points/smart ambient output stays terse; full mode and hotkey answers get code room
    maxTokens: profile.maxTokens,
    effort: profile.effort,
    timeoutMs: suggestionTimeoutMs(trigger, profile.kind === 'full'),
    delivery: 'stream',
    allowNoop: automatic,
  }
}

/** The automatic answer to a classified turn, carrying the still-unanswered questions
 *  `asked` (oldest first; may include `turn` itself, which is always the focus). */
export function automaticAnswerRequest(
  snap: AssistSnapshot,
  s: AssistSettings,
  turn: CompletedTurn,
  verdict: { kind: ResponseKind; addressee: Addressee },
  asked: CompletedTurn[],
): SuggestionRequest {
  const label = (t: CompletedTurn): string =>
    speakerLabel({ speaker: t.speaker, isUser: false }, snap.names)
  const earlier = asked.filter((t) => t !== turn)
  return {
    ...answerRequest(snap, s, 'ambient', {
      speaker: label(turn),
      text: turn.text,
      kind: verdict.kind,
      addressee: verdict.addressee,
      earlier: earlier.length
        ? earlier.map((t) => ({ speaker: label(t), text: t.text }))
        : undefined,
      startMs: Math.min(turn.startMs, ...earlier.map((t) => t.startMs)),
    }),
    diagnosticTurns: asked,
  }
}

function questionLabel(snap: AssistSnapshot, q: QuestionTurn): string {
  return speakerLabel({ speaker: q.speaker, isUser: false }, snap.names)
}

/** "Answer now": anchored on the most recent question when there is one (F1, DECISIONS
 *  2026-11-04); without one it answers from the rolling window as before. */
export function answerNowRequest(
  snap: AssistSnapshot,
  s: AssistSettings,
  question: QuestionTurn | null,
): SuggestionRequest {
  return answerRequest(
    snap,
    s,
    'hotkey',
    undefined,
    question
      ? {
          speaker: questionLabel(snap, question),
          text: question.text,
          startMs: question.startMs,
          open: question.open,
        }
      : undefined,
  )
}

/** Request fields that do NOT make two requests a different prompt. `atMs` only stamps the
 *  stored suggestion's audio time; `accept` is a per-request closure (buffered requests only,
 *  never a speculation) that could never compare equal. Everything else, including
 *  `presentationRevision` (stamped on the published events, so a moved slide must not reuse
 *  an older stamp) and `delivery`/`maxRetries` (provider behaviour), counts: a NEW field is
 *  compared by default, so a speculation can never be published for a request that differs
 *  in something nobody remembered to list. */
const NOT_PROMPT = new Set<keyof SuggestionRequest>(['atMs', 'accept'])

/** True when `a` and `b` would send the same prompt with the same provenance, so a
 *  speculation started for `a` may be published as the answer to `b`. Screenshots never
 *  match (a held image is single-use), and the diagnostic turn spans match by identity. */
export function samePrompt(a: SuggestionRequest, b: SuggestionRequest): boolean {
  if (a.image || b.image) return false
  const turnsA = a.diagnosticTurns ?? []
  const turnsB = b.diagnosticTurns ?? []
  if (turnsA.length !== turnsB.length || !turnsA.every((t, i) => t === turnsB[i])) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof SuggestionRequest)[])
  for (const k of keys) {
    if (k === 'diagnosticTurns' || k === 'image' || NOT_PROMPT.has(k)) continue
    if (a[k] !== b[k]) return false
  }
  return true
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
    presentationRevision: snap.presentation?.current ? snap.presentation.revision : undefined,
    atMs: snap.atMs,
    apiKey: s.anthropicApiKey,
    workspaceId: s.anthropicWorkspaceId || undefined,
    model: s.nudgeModel,
    system: snap.coachSystem ?? snap.system,
    contextRevision: snap.contextRevision,
    userContent:
      meetingContextBlock(snap.meetingText ?? '', true) +
      (snap.presentation?.current
        ? presentationCoachContent(
            snap.presentation,
            snap.coachEvidence?.text ?? '',
            snap.coachEvidence?.incomplete ?? true,
          ) +
          '\n' +
          recentSuggestionsBlock(snap.coachRecent ?? []) +
          '\n' +
          COMPACT_CONTRACT
        : buildCoachUserContent({
            excerpt: input.excerpt,
            reason: input.reason,
            window: snap.window,
            names: snap.names,
            recent: snap.recent,
            question: input.question
              ? {
                  speaker: questionLabel(snap, input.question),
                  text: input.question.text,
                  startMs: input.question.startMs,
                }
              : undefined,
          })),
    maxTokens: COACH_PROFILE.maxTokens,
    effort: COACH_PROFILE.effort,
    timeoutMs: suggestionTimeoutMs('ambient', false, 'next-point'),
    maxRetries: COACH_PROFILE.maxRetries,
    delivery: 'buffered',
    allowNoop: true,
    accept,
  }
}
