import type { Admission, ManualRequest } from '@shared/live-controls/types'

// The typed composer's pure state: draft text, admission pending/error, and the rules for what
// a send, a refusal or a key press does to them. The hook in useOverlayComposer.ts owns lifetime.

export interface ComposerState {
  draft: string
  pending: boolean
  error: string
}

export type ComposerEvent =
  | { type: 'begin' | 'reset' }
  | { type: 'edit'; text: string }
  | { type: 'result'; result: Admission }
  | { type: 'failure'; message: string }

export const EMPTY_COMPOSER: ComposerState = { draft: '', pending: false, error: '' }

export function composerReducer(state: ComposerState, event: ComposerEvent): ComposerState {
  switch (event.type) {
    case 'reset':
      return EMPTY_COMPOSER
    case 'edit':
      return { ...state, draft: event.text }
    case 'begin':
      return { ...state, pending: true, error: '' }
    case 'failure':
      return { ...state, pending: false, error: event.message }
    case 'result':
      return {
        ...state,
        pending: false,
        draft: event.result.accepted ? '' : state.draft,
        error: event.result.accepted ? '' : event.result.message,
      }
  }
}

/** Enter sends; Shift+Enter is a newline; nothing fires mid-IME. Escape is the shell's. */
export function composerAction(key: string, shift: boolean, composing: boolean): 'submit' | null {
  if (composing) return null
  return key === 'Enter' && !shift ? 'submit' : null
}

/** After a send: an accepted request consumed the attachment; an expired one is gone in main.
 *  Any other refusal keeps both the text and the attachment for another try. */
export function attachmentAfterSend(result: Admission): 'keep' | 'clear' {
  return result.accepted || result.reason === 'attachment-expired' ? 'clear' : 'keep'
}

export type TypedSubmitOutcome =
  | { type: 'stale' }
  | { type: 'result'; result: Admission; clearAttachment: boolean }
  | { type: 'failure'; message: string }

/** Sends one typed question. A reply that lands after the meeting changed is `stale`: it must
 *  not clear or refill the next meeting's draft. */
export async function submitTypedQuestion(
  input: { meetingId: number; text: string; captureToken?: string },
  deps: {
    request: (request: ManualRequest) => Promise<Admission>
    isCurrent: (meetingId: number) => boolean
  },
): Promise<TypedSubmitOutcome> {
  try {
    const result = await deps.request({
      meetingId: input.meetingId,
      kind: 'typed',
      text: input.text,
      ...(input.captureToken ? { captureToken: input.captureToken } : {}),
    })
    if (!deps.isCurrent(input.meetingId)) return { type: 'stale' }
    return {
      type: 'result',
      result,
      clearAttachment: !!input.captureToken && attachmentAfterSend(result) === 'clear',
    }
  } catch (e) {
    if (!deps.isCurrent(input.meetingId)) return { type: 'stale' }
    return { type: 'failure', message: String(e) }
  }
}
