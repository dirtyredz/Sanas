import { expect, it } from 'vitest'
import { LOCAL_SHORTCUTS } from '../../../lib/overlay-workspaces'
import { overlayShortcut, type ShortcutKey } from './overlay-shortcuts'

const key = (over: Partial<ShortcutKey>): ShortcutKey => ({
  key: '',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...over,
})

it('maps Ctrl+1, 2, 3, 5 and 6 to the five workspaces; Ctrl+4 is unbound', () => {
  const order: [string, string][] = [
    ['1', 'answer'],
    ['2', 'ask'],
    ['3', 'screen'],
    ['5', 'transcript'],
    ['6', 'context'],
  ]
  order.forEach(([digit, workspace]) => {
    expect(overlayShortcut(key({ key: digit, code: `Digit${digit}`, ctrlKey: true }))).toEqual({
      type: 'workspace',
      workspace,
    })
  })
  expect(overlayShortcut(key({ key: '4', code: 'Digit4', ctrlKey: true }))).toBeNull()
  expect(overlayShortcut(key({ key: 'End', code: 'Numpad1', ctrlKey: true }))).toEqual({
    type: 'workspace',
    workspace: 'answer',
  })
  expect(overlayShortcut(key({ key: '7', code: 'Digit7', ctrlKey: true }))).toBeNull()
})

it('opens preferences with Ctrl+, and handles a bare Escape', () => {
  expect(overlayShortcut(key({ key: ',', ctrlKey: true }))).toEqual({ type: 'preferences' })
  expect(overlayShortcut(key({ key: 'Escape' }))).toEqual({ type: 'escape' })
  expect(overlayShortcut(key({ key: 'Escape', shiftKey: true }))).toBeNull()
})

it('suppresses every chord during IME composition', () => {
  expect(overlayShortcut(key({ key: '2', ctrlKey: true, isComposing: true }))).toBeNull()
  expect(overlayShortcut(key({ key: 'Escape', isComposing: true }))).toBeNull()
  expect(overlayShortcut(key({ key: 'Process', ctrlKey: true }))).toBeNull()
})

it('never claims typing, clipboard keys, arrows or other modifier combinations', () => {
  for (const k of ['a', '1', 'ArrowDown', 'Enter', ','])
    expect(overlayShortcut(key({ key: k }))).toBeNull()
  for (const k of ['c', 'v', 'x', 'a', 'z', 'ArrowLeft', 'Home'])
    expect(overlayShortcut(key({ key: k, ctrlKey: true }))).toBeNull()
  // the global defaults use Ctrl+Shift / Ctrl+Alt: never local
  expect(
    overlayShortcut(key({ key: '1', code: 'Digit1', ctrlKey: true, shiftKey: true })),
  ).toBeNull()
  expect(overlayShortcut(key({ key: '1', code: 'Digit1', ctrlKey: true, altKey: true }))).toBeNull()
  expect(overlayShortcut(key({ key: '1', code: 'Digit1', metaKey: true }))).toBeNull()
})

it('documents every local shortcut', () => {
  expect(LOCAL_SHORTCUTS.map((s) => s.keys)).toEqual([
    'Ctrl+1',
    'Ctrl+2',
    'Ctrl+3',
    'Ctrl+5',
    'Ctrl+6',
    'Ctrl+,',
    'Esc',
  ])
})
