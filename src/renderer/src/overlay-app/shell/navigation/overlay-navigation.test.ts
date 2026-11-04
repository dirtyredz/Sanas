import { describe, expect, it } from 'vitest'
import {
  escapeEffect,
  initialNavigation,
  navigationReducer,
  type NavigationEvent,
  type NavigationState,
} from './overlay-navigation'

const run = (state: NavigationState, ...events: NavigationEvent[]): NavigationState =>
  events.reduce(navigationReducer, state)

describe('overlay navigation', () => {
  it('opens on Answer with preferences closed', () => {
    expect(initialNavigation(4)).toEqual({
      meetingId: 4,
      workspace: 'answer',
      preferencesOpen: false,
    })
  })

  it('selects workspaces and closes preferences when one is chosen', () => {
    const state = run(
      initialNavigation(1),
      { type: 'preferences', open: true },
      { type: 'select', workspace: 'transcript' },
    )
    expect(state).toMatchObject({ workspace: 'transcript', preferencesOpen: false })
  })

  it('a new meeting always returns to Answer', () => {
    const onTranscript = run(initialNavigation(1), { type: 'select', workspace: 'transcript' })
    expect(run(onTranscript, { type: 'meeting', meetingId: 2 }).workspace).toBe('answer')
    expect(run(onTranscript, { type: 'meeting', meetingId: null }).workspace).toBe('answer')
  })

  it('a re-broadcast of the same meeting keeps the chosen workspace', () => {
    const onContext = run(initialNavigation(1), { type: 'select', workspace: 'context' })
    expect(run(onContext, { type: 'meeting', meetingId: 1 })).toBe(onContext)
  })

  it('the Ask intent opens Ask', () => {
    const state = run(
      initialNavigation(1),
      { type: 'preferences', open: true },
      { type: 'compose' },
    )
    expect(state).toMatchObject({ workspace: 'ask', preferencesOpen: false })
  })

  it('Escape closes preferences first, then returns to Answer', () => {
    const open = run(
      initialNavigation(1),
      { type: 'select', workspace: 'ask' },
      { type: 'preferences', open: true },
    )
    expect(escapeEffect(open)).toBe('restore-trigger')
    const closed = run(open, { type: 'escape' })
    expect(closed).toMatchObject({ workspace: 'ask', preferencesOpen: false })
    expect(escapeEffect(closed)).toBe('release-focus')
    expect(run(closed, { type: 'escape' }).workspace).toBe('answer')
  })
})
