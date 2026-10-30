import type { ManualRequest } from '@shared/live-controls/types'
import type { Suggestion } from '@shared/types'
import { COMPACT_CONTRACT } from '../../assistant/compact-contract'
import {
  AUDIENCE_INSTRUCTION,
  DETAIL_INSTRUCTION,
  TYPED_INSTRUCTION,
  meetingContextBlock,
} from '../../assistant/live-controls/prompts'
import { renderTranscriptWindow } from '../../transcript-format'
import { presentationHint } from '../../assistant/presentation/prompts'
import { answerRequest, type AssistSettings, type AssistSnapshot } from './suggestion-requests'
import type { SuggestionRequest } from './suggestion-runner'

export interface DetailSource extends Suggestion {
  system: string
  cacheableContext: string
  promptWindow: string
}
export function manualRequest(
  snap: AssistSnapshot,
  settings: AssistSettings,
  input: ManualRequest,
  source?: DetailSource,
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
      (source.manualKind && source.manualKind !== 'typed') ||
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
        '\n</source-answer>',
      maxTokens: 2400,
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
