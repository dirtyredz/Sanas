import { describe, expect, it } from 'vitest'
import type { HotkeyAction } from '@shared/hotkeys/types'
import { describeHotkey } from './hotkey-status'

const keys = (overlay: string): Record<HotkeyAction, string> => ({
  overlayHotkey: overlay,
  assistHotkey: 'Control+Shift+Enter',
  captureHotkey: 'Control+Shift+S',
  composeHotkey: 'Control+Shift+K',
  presentationPrevHotkey: 'Alt+PageUp',
  presentationNextHotkey: 'Alt+PageDown',
})

describe('describeHotkey', () => {
  it('is active and quiet when the running shortcut is the saved one', () => {
    const state = describeHotkey('overlayHotkey', keys('Control+Space'), keys('Control+Space'), {
      action: 'overlayHotkey',
      accelerator: 'Control+Space',
      registered: true,
    })
    expect(state).toEqual({ badge: { tone: 'ok', text: 'Active' }, notes: [] })
  })

  it('explains a shortcut another app owns', () => {
    const state = describeHotkey('overlayHotkey', keys('Control+Space'), keys('Control+Space'), {
      action: 'overlayHotkey',
      accelerator: 'Control+Space',
      registered: false,
      error: 'already in use.',
    })
    expect(state.badge).toEqual({ tone: 'warn', text: 'Not registered' })
    expect(state.notes).toEqual([{ tone: 'warn', text: 'Ctrl+Space: already in use.' }])
  })

  it('says a saved change waits for a restart, and flags an unsaved one', () => {
    const state = describeHotkey('overlayHotkey', keys('Alt+O'), keys('Alt+Space'), {
      action: 'overlayHotkey',
      accelerator: 'Control+Space',
      registered: true,
    })
    expect(state.badge).toEqual({ tone: 'accent', text: 'Restart to apply' })
    expect(state.notes.map((n) => n.text)).toEqual([
      'Running Ctrl+Space until Sanas restarts.',
      'Unsaved change.',
    ])
  })

  it('still flags an unsaved change before the status has loaded', () => {
    expect(describeHotkey('assistHotkey', keys('A'), keys('A'), undefined)).toEqual({
      badge: null,
      notes: [],
    })
    const draft = { ...keys('A'), assistHotkey: 'Alt+Enter' }
    expect(describeHotkey('assistHotkey', draft, keys('A'), undefined).notes).toEqual([
      { tone: 'muted', text: 'Unsaved change.' },
    ])
  })
})
