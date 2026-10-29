import type { Settings } from '@shared/types'
import type { SpeakerNames } from '../../transcript-format'
import {
  assistProfile,
  buildUserContent,
  type TranscriptLine,
  type TriggeringTurn,
} from '../../assistant/prompts'
import {
  COACH_PROFILE,
  buildCoachUserContent,
  type CoachPromptInput,
} from '../../assistant/coach-prompts'
import { suggestionTimeoutMs, type SuggestionTrigger } from './suggestion-in-flight'
import type { SuggestionRequest } from './suggestion-runner'

// Turns "what the meeting looks like right now" plus the saved settings into a complete,
// self-contained SuggestionRequest. Pure; the snapshot is taken synchronously by the
// caller, so nothing here can observe state that changes while a request runs.

/** The live meeting at the moment a request is built. */
export interface AssistSnapshot {
  meetingId: number
  /** The meeting clock (audio received), which stored suggestion times use. */
  atMs: number
  /** The meeting's cached system prompt: persona + job context pack + glossary. */
  system: string
  window: TranscriptLine[]
  names?: SpeakerNames
  /** Headlines of suggestions already shown this meeting, oldest first. */
  recent: readonly string[]
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
 *  Automatic answers name the turn they answer, see what was already shown, and may
 *  decline with the no-op; a requested answer always answers. */
export function answerRequest(
  snap: AssistSnapshot,
  s: AssistSettings,
  trigger: SuggestionTrigger,
  turn?: TriggeringTurn,
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
    userContent: buildUserContent(snap.window, trigger, s.whisperMode, {
      names: snap.names,
      turn,
      recent: automatic ? snap.recent : undefined,
    }),
    // points/smart ambient output stays terse; full mode and hotkey answers get code room
    maxTokens: profile.maxTokens,
    effort: profile.effort,
    timeoutMs: suggestionTimeoutMs(trigger, profile.kind === 'full'),
    delivery: 'stream',
    allowNoop: automatic,
  }
}

/** A next point while the user talks: ambient lane, nudge model, its own short profile,
 *  buffered so nothing is shown unless the complete result is accepted. */
export function coachRequest(
  snap: AssistSnapshot,
  s: AssistSettings,
  input: Omit<CoachPromptInput, 'window' | 'names' | 'recent'>,
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
    userContent: buildCoachUserContent({
      ...input,
      window: snap.window,
      names: snap.names,
      recent: snap.recent,
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
