import { describe, expect, it } from 'vitest'
import type { UpdateState } from '@shared/updates/types'
import { describeUpdate } from './update-status'

const state = (over: Partial<UpdateState>): UpdateState => ({
  revision: 1,
  currentVersion: '0.1.5',
  phase: 'idle',
  availableVersion: null,
  progress: null,
  error: null,
  canRestart: false,
  blockReason: null,
  ...over,
})

describe('describeUpdate', () => {
  it('waits for the first state before offering a check', () => {
    expect(describeUpdate(null)).toMatchObject({ text: 'Loading…', canCheck: false })
  })

  it('offers a check only when the updater is not already busy', () => {
    // matches the phases the old Check button was disabled for
    for (const phase of [
      'disabled',
      'checking',
      'available',
      'downloading',
      'installing',
    ] as const) {
      expect(describeUpdate(state({ phase })).canCheck).toBe(false)
    }
    for (const phase of ['idle', 'downloaded', 'error'] as const) {
      expect(describeUpdate(state({ phase })).canCheck).toBe(true)
    }
  })

  it('names the version and reports download progress', () => {
    expect(
      describeUpdate(state({ phase: 'downloading', availableVersion: '0.1.6', progress: 41.6 })),
    ).toMatchObject({ text: 'Downloading update 0.1.6', progress: 42 })
    expect(describeUpdate(state({ phase: 'downloaded', availableVersion: '0.1.6' }))).toMatchObject(
      { text: 'Update 0.1.6 is ready to install', tone: 'ok', progress: null },
    )
  })

  it('marks a failed check as a warning', () => {
    expect(describeUpdate(state({ phase: 'error', error: 'offline' })).tone).toBe('warn')
  })
})
