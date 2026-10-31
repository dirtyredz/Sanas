import { expect, it } from 'vitest'
import type { CaptureDraftView } from '@shared/live-controls/capture'
import { EMPTY_CAPTURE_DRAFT, captureDraftReducer } from './useCaptureDraft'

const view = (token: string): CaptureDraftView => ({
  meetingId: 1,
  token,
  thumbnail: 'data:image/png;base64,AA==',
  display: 'Laptop (2560×1440)',
  width: 1568,
  height: 882,
})

it('attaches, replaces, and keeps the previous attachment when a replacement fails', () => {
  const attaching = captureDraftReducer(EMPTY_CAPTURE_DRAFT, { type: 'attaching' })
  expect(attaching.attaching).toBe(true)
  const first = captureDraftReducer(attaching, {
    type: 'attached',
    result: { ok: true, draft: view('a') },
  })
  expect(first).toEqual({ draft: view('a'), attaching: false, error: '' })
  const failed = captureDraftReducer(captureDraftReducer(first, { type: 'attaching' }), {
    type: 'attached',
    result: { ok: false, message: 'That screen is no longer connected' },
  })
  expect(failed.draft?.token).toBe('a')
  expect(failed.error).toContain('no longer connected')
  const replaced = captureDraftReducer(failed, {
    type: 'attached',
    result: { ok: true, draft: view('b') },
  })
  expect(replaced.draft?.token).toBe('b')
  expect(replaced.error).toBe('')
})

it('clears on remove, send or expiry', () => {
  const attached = { draft: view('a'), attaching: false, error: '' }
  expect(captureDraftReducer(attached, { type: 'cleared' })).toEqual(EMPTY_CAPTURE_DRAFT)
  expect(captureDraftReducer(attached, { type: 'failed', message: 'x' }).draft?.token).toBe('a')
})
