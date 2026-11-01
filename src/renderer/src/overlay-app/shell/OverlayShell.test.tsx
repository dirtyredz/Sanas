import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SuggestionView } from '../../lib/suggestions/whisper-history'
import type { Workspace } from './navigation/overlay-navigation'
import type { OverlaySessionModel } from './OverlaySession'
import { OverlayShell } from './OverlayShell'

// Vitest has no @shared alias: load the real module by path.
vi.mock('@shared/suggestion-label', () => import('../../../../shared/suggestion-label'))

const noop = (): void => {}
const answer: SuggestionView = {
  suggestionId: 1,
  meetingId: 7,
  trigger: 'ambient',
  purpose: 'answer',
  text: '**Ship the pilot after the audit-log check passes.**\nThen confirm the date.',
  streaming: false,
  error: null,
  finishedAt: 1,
}

function session(
  workspace: Workspace,
  over: Partial<OverlaySessionModel> = {},
): OverlaySessionModel {
  return {
    meeting: {
      meetingId: 7,
      status: 'live',
      captureWarning: 'No system audio detected — voices heard by the mic will be labeled Me.',
    },
    meetingId: 7,
    active: true,
    lines: [
      { speaker: 0, isUser: false, text: 'What blocks the pilot?', tStartMs: 0, interim: false },
    ],
    presentation: { meetingId: 7, revision: 0, ordinal: 0, count: 0, current: null },
    settings: {
      overlayOpacity: 0.9,
      changeOpacity: noop,
      answerRatio: 0.27,
      setAnswerRatio: noop,
      persistAnswerRatio: noop,
    },
    windowState: {
      ghost: false,
      shortcuts: { overlay: 'Ctrl+Shift+Space', capture: '', compose: '' },
    },
    navigation: {
      workspace,
      preferencesOpen: false,
      select: noop,
      openAsk: noop,
      setPreferencesOpen: noop,
      preferencesTriggerRef: { current: null },
    },
    suggestions: {
      items: [answer],
      selected: answer,
      selectedIndex: 0,
      latest: answer,
      hasNewAnswer: false,
      requestedInFlight: false,
      earlierContext: false,
      select: noop,
      scrollRef: { current: null },
      onScroll: noop,
    },
    manual: { pending: false, notice: '', request: async () => {} },
    composer: {
      meetingId: 7,
      state: { draft: 'What should we verify?', pending: false, error: '' },
      screen: {
        state: { meetingId: 7, draft: null, attaching: false, error: '' },
        attach: async () => {},
        remove: async () => {},
        cleared: noop,
      },
      busy: false,
      canSend: true,
      edit: noop,
      submit: async () => {},
      inputRef: { current: null },
    },
    capture: { notice: null, capturing: false },
    answerEveryQuestion: { meetingId: 7, enabled: false, error: '', set: noop },
    ...over,
  } as OverlaySessionModel
}

const render = (workspace: Workspace, over?: Partial<OverlaySessionModel>): string =>
  renderToStaticMarkup(<OverlayShell session={session(workspace, over)} />)

function panel(html: string, id: string): string {
  const start = html.indexOf(`id="ov-panel-${id}"`)
  const open = html.lastIndexOf('<', start)
  return html.slice(open, html.indexOf('>', start) + 1)
}

describe('overlay shell', () => {
  it('puts the answer headline before any secondary tool, with status outside workspaces', () => {
    const html = render('answer')
    const headline = html.indexOf('Ship the pilot')
    expect(headline).toBeGreaterThan(0)
    expect(html.indexOf('What should we verify?')).toBeGreaterThan(headline)
    expect(html.indexOf('No system audio detected')).toBeLessThan(headline)
    expect(html).toContain('Answer now')
  })

  it('names every workspace in the rail and marks the selected one', () => {
    const html = render('slide')
    for (const name of ['Answer', 'Ask', 'Screen', 'Slide', 'Transcript', 'Context'])
      expect(html).toMatch(new RegExp(`role="tab"[^>]*>.*?${name}</span>`))
    expect(html).toMatch(/id="ov-tab-slide"[^>]*aria-selected="true"/)
    expect(html).toMatch(/id="ov-tab-answer"[^>]*aria-selected="false"/)
  })

  it('keeps every workspace mounted but makes the hidden ones inert', () => {
    const html = render('ask')
    expect(panel(html, 'ask')).not.toContain('inert')
    for (const id of ['screen', 'slide', 'transcript', 'context'])
      expect(panel(html, id)).toContain('inert=""')
    // the Ask draft and the transcript are both present: switching never unmounts them
    expect(html).toContain('What should we verify?')
    expect(html).toContain('What blocks the pilot?')
  })

  it('shows the divider and a preview in a secondary workspace, and hides both in Answer', () => {
    const ask = render('ask')
    expect(ask).toContain('role="separator"')
    expect(ask).toContain('is-preview')
    expect(ask).toMatch(/class="workspace-region"(?![^>]*inert)/)
    const full = render('answer')
    expect(full).toMatch(/role="separator"[^>]*hidden=""/)
    expect(full).toMatch(/class="workspace-region"[^>]*inert=""/)
    expect(full).not.toContain('is-preview')
  })

  it('Slide without a deck shows an empty state, never the transcript', () => {
    expect(panel(render('slide'), 'slide')).toBeTruthy()
    const html = render('slide')
    const slide = html.slice(
      html.indexOf('id="ov-panel-slide"'),
      html.indexOf('id="ov-panel-transcript"'),
    )
    expect(slide).toContain('no slides')
    expect(slide).not.toContain('What blocks the pilot?')
  })

  it('shows capture progress outside the workspaces', () => {
    const html = render('transcript', {
      capture: {
        notice: { text: 'Screen captured: Display 2 — analyzing…', failed: false },
        capturing: false,
      },
    })
    expect(html.indexOf('Display 2')).toBeLessThan(html.indexOf('overlay-frame'))
  })
})

describe('overlay shell, focused workspaces', () => {
  it('never carries the full deck editor; Context hands deck editing to Sanas', () => {
    const html = render('context')
    expect(html).not.toContain('Meeting slides')
    expect(html).not.toContain('Restore meeting-start')
    expect(html).not.toContain('Continue from slide')
  })

  it('offers Ask the audience in Slide as well as Ask', () => {
    const slide = {
      meetingId: 7,
      revision: 2,
      ordinal: 2,
      count: 8,
      current: {
        title: 'Rollout checkpoints',
        talkingPoint: 'Main point',
        script: 'Say it',
        keyFacts: '',
      },
    }
    const html = render('slide', { presentation: slide } as Partial<OverlaySessionModel>)
    const panel = html.slice(
      html.indexOf('id="ov-panel-slide"'),
      html.indexOf('id="ov-panel-transcript"'),
    )
    expect(panel).toContain('Slide 3 of 8')
    expect(panel).toContain('Rollout checkpoints')
    expect(panel).toContain('Ask the audience')
  })

  it('idle offers Open Sanas instead of meeting actions', () => {
    const html = render('answer', {
      meeting: { meetingId: null, status: 'idle' },
      meetingId: null,
      active: false,
      suggestions: { ...session('answer').suggestions, items: [], selected: null, latest: null },
    })
    expect(html).toContain('Start a meeting in Sanas.')
    expect(html).toContain('Open Sanas')
    expect(html).toMatch(/class="[^"]*answer-now[^"]*"[^>]*disabled=""/)
  })

  it('a meeting error keeps an Open Sanas action outside the workspaces', () => {
    const html = render('transcript', {
      meeting: {
        meetingId: 7,
        status: 'error',
        error: 'Deepgram rejected the key. Check Settings.',
      },
    })
    const status = html.slice(0, html.indexOf('overlay-frame'))
    expect(status).toContain('Deepgram rejected the key')
    expect(status).toContain('Open Sanas')
  })
})
