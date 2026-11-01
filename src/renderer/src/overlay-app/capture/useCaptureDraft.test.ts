import { expect, it } from 'vitest'
import type { CaptureDraftView } from '@shared/live-controls/capture'
import { EMPTY_CAPTURE_DRAFT, captureDraftReducer, type CaptureDraftState } from './useCaptureDraft'

const view = (token: string): CaptureDraftView => ({
  meetingId: 1,
  token,
  thumbnail: 'data:image/png;base64,AA==',
  display: 'Laptop (2560×1440)',
  width: 1568,
  height: 882,
})
const meeting1: CaptureDraftState = { ...EMPTY_CAPTURE_DRAFT, meetingId: 1 }

it('attaches, replaces, and keeps the previous attachment when a replacement fails', () => {
  const attaching = captureDraftReducer(meeting1, { type: 'attaching', meetingId: 1 })
  expect(attaching.attaching).toBe(true)
  const first = captureDraftReducer(attaching, {
    type: 'attached',
    meetingId: 1,
    result: { ok: true, draft: view('a') },
  })
  expect(first).toEqual({ meetingId: 1, draft: view('a'), attaching: false, error: '' })
  const failed = captureDraftReducer(
    captureDraftReducer(first, { type: 'attaching', meetingId: 1 }),
    {
      type: 'attached',
      meetingId: 1,
      result: { ok: false, message: 'That screen is no longer connected' },
    },
  )
  expect(failed.draft?.token).toBe('a')
  expect(failed.error).toContain('no longer connected')
  const replaced = captureDraftReducer(failed, {
    type: 'attached',
    meetingId: 1,
    result: { ok: true, draft: view('b') },
  })
  expect(replaced.draft?.token).toBe('b')
  expect(replaced.error).toBe('')
})

it('clears on remove, send or expiry', () => {
  const attached = { meetingId: 1, draft: view('a'), attaching: false, error: '' }
  expect(captureDraftReducer(attached, { type: 'cleared' })).toEqual(meeting1)
  expect(
    captureDraftReducer(attached, { type: 'failed', meetingId: 1, message: 'x' }).draft?.token,
  ).toBe('a')
})

it('resets for a new meeting and ignores an acquisition that finishes afterwards', () => {
  const pending = captureDraftReducer(meeting1, { type: 'attaching', meetingId: 1 })
  const next = captureDraftReducer(pending, { type: 'meeting', meetingId: 2 })
  expect(next).toEqual({ ...EMPTY_CAPTURE_DRAFT, meetingId: 2 })
  const late = captureDraftReducer(next, {
    type: 'attached',
    meetingId: 1,
    result: { ok: true, draft: view('old') },
  })
  expect(late).toBe(next)
  expect(captureDraftReducer(next, { type: 'failed', meetingId: 1, message: 'x' })).toBe(next)
  // the same meeting id again (a re-render) keeps the attachment
  const attached = { meetingId: 2, draft: view('a'), attaching: false, error: '' }
  expect(captureDraftReducer(attached, { type: 'meeting', meetingId: 2 })).toBe(attached)
})
