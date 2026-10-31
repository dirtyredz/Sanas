import type { Admission, ManualRequest } from '@shared/live-controls/types'
import type { SuggestionGroundingRow } from '../../../db/repos/suggestion-grounding'
import { COMPACT_CONTRACT } from '../../assistant/compact-contract'
import {
  AUDIENCE_INSTRUCTION,
  DETAIL_INSTRUCTION,
  TYPED_INSTRUCTION,
  meetingContextBlock,
} from '../../assistant/live-controls/prompts'
import {
  CAPTURE_DETAIL_NOTE,
  CAPTURE_INSTRUCTION,
  CAPTURE_MAX_TOKENS,
  TYPED_CAPTURE_INSTRUCTION,
} from '../../assistant/live-controls/capture-prompts'
import type { AssistImage } from '../../assistant/types'
import { renderTranscriptWindow } from '../../transcript-format'
import { presentationHint } from '../../assistant/presentation/prompts'
import { answerRequest, type AssistSettings, type AssistSnapshot } from './suggestion-requests'
import type { SuggestionHandle, SuggestionRequest } from './suggestion-runner'

/** A request that carries a screenshot. Built only in main, from a fresh capture or a
 *  main-owned composer draft — never from renderer input directly. */
export interface CaptureInput {
  meetingId: number
  kind: 'capture'
  /** The typed question when the screen was attached in the composer. */
  text?: string
  image: AssistImage
}
export type AssistInput = ManualRequest | CaptureInput

export interface ManualAdmissionDeps {
  canStart(): boolean
  settings(): AssistSettings
  detailSource(meetingId: number, sourceSuggestionId: number): SuggestionGroundingRow
  existingDetail(meetingId: number, sourceSuggestionId: number): number | undefined
  admitted(): void
  start(request: SuggestionRequest): SuggestionHandle | null
}

export function manualRequest(
  snap: AssistSnapshot,
  settings: AssistSettings,
  input: AssistInput,
  source?: SuggestionGroundingRow,
): SuggestionRequest {
  const base = answerRequest(snap, settings, 'hotkey')
  base.manualKind = input.kind
  const context =
    renderTranscriptWindow(snap.window, 12000, snap.names) +
    meetingContextBlock(snap.meetingText ?? '') +
    (snap.presentation ? presentationHint(snap.presentation) : '')
  if (input.kind === 'detail') {
    if (
      !source ||
      source.meetingId !== input.meetingId ||
      source.purpose !== 'answer' ||
      (source.manualKind && source.manualKind !== 'typed' && source.manualKind !== 'capture') ||
      !source.groundingContextId
    )
      throw new Error('This answer cannot be expanded.')
    return {
      ...base,
      system: source.system,
      cacheableContext: source.cacheableContext,
      groundingContextId: source.groundingContextId,
      contextRevision: source.contextRevision,
      sourceSuggestionId: source.id,
      requestText: source.requestText,
      userContent:
        DETAIL_INSTRUCTION +
        '\n<original-request>\n' +
        source.promptWindow +
        '\n</original-request>\n<source-answer>\n' +
        source.text +
        '\n</source-answer>' +
        (source.manualKind === 'capture' ? '\n' + CAPTURE_DETAIL_NOTE : ''),
      maxTokens: 2400,
    }
  }
  if (input.kind === 'capture') {
    const question = input.text?.trim()
    return {
      ...base,
      image: input.image,
      requestText: question || undefined,
      maxTokens: CAPTURE_MAX_TOKENS,
      maxRetries: 0, // one explicit action, one provider call
      userContent:
        (question ? TYPED_CAPTURE_INSTRUCTION : CAPTURE_INSTRUCTION) +
        '\n' +
        context +
        (question ? '\n<typed-request>\n' + question + '\n</typed-request>' : ''),
    }
  }
  if (input.kind === 'audience')
    return {
      ...base,
      effort: 'low',
      maxTokens: 200,
      timeoutMs: 25000,
      userContent:
        AUDIENCE_INSTRUCTION +
        '\n' +
        context +
        (snap.presentation?.current
          ? '\nCurrent-visit finalized speech:\n' + (snap.coachEvidence?.text ?? '')
          : ''),
    }
  return {
    ...base,
    requestText: input.text,
    userContent:
      TYPED_INSTRUCTION +
      '\n' +
      context +
      '\n<typed-request>\n' +
      input.text +
      '\n</typed-request>\n' +
      COMPACT_CONTRACT,
  }
}

export function admitManual(
  deps: ManualAdmissionDeps,
  snap: AssistSnapshot | null,
  input: AssistInput,
): Admission {
  if (!deps.canStart())
    return { accepted: false, reason: 'busy', message: 'A requested answer is already running.' }
  if (!snap || snap.meetingId !== input.meetingId)
    throw new Error('This meeting is no longer active.')
  if (input.kind === 'audience' && !snap.window.some((line) => line.text.trim()))
    return {
      accepted: false,
      reason: 'no-evidence',
      message: 'No recent discussion to base a question on yet.',
    }
  const source =
    input.kind === 'detail'
      ? deps.detailSource(input.meetingId, input.sourceSuggestionId)
      : undefined
  const request = manualRequest(snap, deps.settings(), input, source)
  if (input.kind === 'detail') {
    const existing = deps.existingDetail(input.meetingId, input.sourceSuggestionId)
    if (existing) return { accepted: true, storedSuggestionId: existing }
  }
  if (!request.apiKey)
    return {
      accepted: false,
      reason: 'unavailable',
      message: 'No Anthropic API key set — add it in Settings.',
    }
  deps.admitted()
  return deps.start(request)
    ? { accepted: true }
    : { accepted: false, reason: 'busy', message: 'A requested answer is already running.' }
}
