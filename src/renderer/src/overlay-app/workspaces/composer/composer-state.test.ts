import { expect, it } from 'vitest'
import type { Admission } from '@shared/live-controls/types'
import {
  attachmentAfterSend,
  composerAction,
  composerReducer,
  submitTypedQuestion,
} from './composer-state'

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

it('submits Enter, preserves Shift+Enter and IME, and leaves Escape to the shell', () => {
  expect(composerAction('Enter', false, false)).toBe('submit')
  expect(composerAction('Enter', true, false)).toBeNull()
  expect(composerAction('Enter', false, true)).toBeNull()
  expect(composerAction('Escape', false, false)).toBeNull()
})

it('retains the draft on rejection and failure, clearing only accepted admission', () => {
  const draft = { draft: 'Question', pending: true, error: '' }
  const rejected = composerReducer(draft, {
    type: 'result',
    result: { accepted: false, reason: 'busy', message: 'Busy' },
  })
  expect(rejected).toMatchObject({ draft: 'Question', pending: false, error: 'Busy' })
  expect(composerReducer(draft, { type: 'failure', message: 'offline' }).draft).toBe('Question')
  expect(composerReducer(draft, { type: 'result', result: { accepted: true } })).toMatchObject({
    draft: '',
    pending: false,
  })
  expect(composerReducer(rejected, { type: 'reset' })).toEqual({
    draft: '',
    pending: false,
    error: '',
  })
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

it('reports a reply that lands after the meeting changed as stale', async () => {
  let current = 1
  const reply = deferred<Admission>()
  const outcome = submitTypedQuestion(
    { meetingId: 1, text: 'Why?', captureToken: 't' },
    { request: () => reply.promise, isCurrent: (id) => id === current },
  )
  current = 2
  reply.resolve({ accepted: true })
  expect(await outcome).toEqual({ type: 'stale' })

  const failing = deferred<Admission>()
  const failed = submitTypedQuestion(
    { meetingId: 2, text: 'Why?' },
    { request: () => failing.promise, isCurrent: (id) => id === 3 },
  )
  failing.reject(new Error('offline'))
  expect(await failed).toEqual({ type: 'stale' })
})

it('sends the attachment token and clears it only when consumed', async () => {
  const sent: unknown[] = []
  const accepted = await submitTypedQuestion(
    { meetingId: 1, text: 'Why?', captureToken: 't' },
    {
      request: async (r) => {
        sent.push(r)
        return { accepted: true }
      },
      isCurrent: () => true,
    },
  )
  expect(sent[0]).toEqual({ meetingId: 1, kind: 'typed', text: 'Why?', captureToken: 't' })
  expect(accepted).toMatchObject({ type: 'result', clearAttachment: true })
  const busy = await submitTypedQuestion(
    { meetingId: 1, text: 'Why?', captureToken: 't' },
    {
      request: async () => ({ accepted: false, reason: 'busy', message: 'Busy' }),
      isCurrent: () => true,
    },
  )
  expect(busy).toMatchObject({ type: 'result', clearAttachment: false })
  const noAttachment = await submitTypedQuestion(
    { meetingId: 1, text: 'Why?' },
    { request: async () => ({ accepted: true }), isCurrent: () => true },
  )
  expect(noAttachment).toMatchObject({ clearAttachment: false })
})
