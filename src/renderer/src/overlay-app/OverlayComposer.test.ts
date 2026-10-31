import { expect, it } from 'vitest'
import { attachmentAfterSend, composerAction, composerReducer } from './OverlayComposer'
it('clears the attached screen only when it was sent or has expired in main', () => {
  expect(attachmentAfterSend({ accepted: true })).toBe('clear')
  expect(
    attachmentAfterSend({ accepted: false, reason: 'attachment-expired', message: 'gone' }),
  ).toBe('clear')
  expect(attachmentAfterSend({ accepted: false, reason: 'busy', message: 'busy' })).toBe('keep')
  expect(attachmentAfterSend({ accepted: false, reason: 'unavailable', message: 'no key' })).toBe(
    'keep',
  )
})
it('submits Enter, preserves Shift+Enter and IME, and closes on Escape', () => {
  expect(composerAction('Enter', false, false)).toBe('submit')
  expect(composerAction('Enter', true, false)).toBeNull()
  expect(composerAction('Enter', false, true)).toBeNull()
  expect(composerAction('Escape', false, false)).toBe('close')
})

it('retains the draft on rejection, failure and Escape, clearing only accepted admission', () => {
  const draft = { open: true, draft: 'Question', pending: true, error: '' }
  const rejected = composerReducer(draft, {
    type: 'result',
    result: { accepted: false, reason: 'busy', message: 'Busy' },
  })
  expect(rejected).toMatchObject({ draft: 'Question', pending: false, error: 'Busy' })
  expect(composerReducer(rejected, { type: 'close' })).toMatchObject({
    open: false,
    draft: 'Question',
  })
  expect(composerReducer(draft, { type: 'failure', message: 'offline' }).draft).toBe('Question')
  expect(composerReducer(draft, { type: 'result', result: { accepted: true } })).toMatchObject({
    draft: '',
    pending: false,
  })
})
