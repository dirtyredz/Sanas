import type { ContextUpdate, ManualRequest } from '@shared/live-controls/types'
import { validateSlides } from '../../shared/presentation/types'
import { requireId } from './validate'
import { requireCaptureToken } from './screen-capture-validation'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object.')
  return value as Record<string, unknown>
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error('Invalid revision or ordinal.')
  return value as number
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error(`Text must be at most ${max} characters.`)
  return value
}
export function requireContextUpdate(raw: unknown): ContextUpdate {
  const r = object(raw)
  const result: ContextUpdate = {
    meetingId: requireId(r.meetingId, 'meetingId'),
    expectedRevision: revision(r.expectedRevision),
    text: text(r.text, 20000),
  }
  if (r.deck !== undefined) {
    const d = object(r.deck),
      slides = validateSlides(d.slides),
      ordinal = revision(d.ordinal)
    if (ordinal >= Math.max(1, slides.length))
      throw new Error('Selected slide is outside the deck.')
    result.deck = {
      slides,
      ordinal,
      expectedPresentationRevision: revision(d.expectedPresentationRevision),
    }
  }
  return result
}
export function requireManualRequest(raw: unknown): ManualRequest {
  const r = object(raw),
    meetingId = requireId(r.meetingId, 'meetingId')
  if (r.kind === 'audience') return { meetingId, kind: r.kind }
  if (r.kind === 'detail')
    return {
      meetingId,
      kind: r.kind,
      sourceSuggestionId: requireId(r.sourceSuggestionId, 'sourceSuggestionId'),
    }
  if (r.kind === 'typed') {
    const value = text(r.text, 4000)
    if (!value.trim()) throw new Error('Enter a question or instruction.')
    return r.captureToken === undefined
      ? { meetingId, kind: r.kind, text: value }
      : { meetingId, kind: r.kind, text: value, captureToken: requireCaptureToken(r.captureToken) }
  }
  throw new Error('Invalid manual request kind.')
}
