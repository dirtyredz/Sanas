import { expect, it, vi } from 'vitest'
vi.mock('../../windows/main-window', () => ({ isMainWindowSender: (id: number) => id === 1 }))
vi.mock('../../config/settings', () => ({ loadSettings: () => ({}) }))
import {
  requireApplicationId,
  requireApplyRequest,
  requireLibrarySender,
  requireListOptions,
  requireToken,
} from './validate'

const token = '123e4567-e89b-42d3-a456-426614174000'

it('accepts only the library window', () => {
  expect(requireLibrarySender({ sender: { id: 1 } })).toBe(1)
  expect(() => requireLibrarySender({ sender: { id: 2 } })).toThrow('Not allowed')
})

it('accepts safe application IDs and opaque tokens only', () => {
  expect(requireApplicationId('acme-2026_1.v2')).toBe('acme-2026_1.v2')
  for (const bad of ['../acme', 'a/b', 'C:\\x', '', 'CON', 42, { id: 'a' }])
    expect(() => requireApplicationId(bad)).toThrow('Invalid application ID')
  expect(requireToken(token)).toBe(token)
  for (const bad of ['', 'not-a-token', 7, null]) expect(() => requireToken(bad)).toThrow()
})

it('validates list options strictly', () => {
  expect(requireListOptions(undefined)).toEqual({ includeArchived: false })
  expect(requireListOptions({ includeArchived: true })).toEqual({ includeArchived: true })
  expect(() => requireListOptions({ includeArchived: 'yes' })).toThrow()
  expect(() => requireListOptions({ path: 'C:\\' })).toThrow('Unsupported')
})

it('projects a well-formed apply request and refuses injection attempts', () => {
  expect(
    requireApplyRequest({
      token,
      name: 'Acme',
      edits: { persona: 'Calm', glossary: 'A\nB' },
      choices: { notes: 'incoming', resume: 'keep' },
      archive: true,
    }),
  ).toEqual({
    token,
    name: 'Acme',
    edits: { persona: 'Calm', glossary: 'A\nB' },
    choices: { notes: 'incoming', resume: 'keep' },
    archive: true,
  })
  expect(() => requireApplyRequest({ token, pack: { notes: 'x' } })).toThrow('Unsupported')
  expect(() => requireApplyRequest({ token, path: 'C:\\x.json' })).toThrow('Unsupported')
  expect(() => requireApplyRequest({ token, edits: { notes: 'x' } })).toThrow('cannot be edited')
  expect(() => requireApplyRequest({ token, edits: { persona: 'x'.repeat(20_001) } })).toThrow()
  expect(() => requireApplyRequest({ token, choices: { notes: 'merge' } })).toThrow('choice')
  expect(() => requireApplyRequest({ token, choices: { name: 'incoming' } })).toThrow('choice')
  expect(() => requireApplyRequest({ token, name: '' })).toThrow('name')
  expect(() => requireApplyRequest({ token, name: 'x'.repeat(121) })).toThrow('name')
  expect(() => requireApplyRequest({ token, archive: 'yes' })).toThrow('archive')
  expect(() => requireApplyRequest({ token: 'x' })).toThrow('confirmation')
  expect(() => requireApplyRequest([token])).toThrow()
})
