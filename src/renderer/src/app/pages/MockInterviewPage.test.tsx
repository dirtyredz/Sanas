import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../audio/mic', () => ({ startCapture: vi.fn() }))
import { MockResults } from './MockInterviewPage'
import { AppHeader } from '../shell/AppHeader'
it('shows the tab and honest per-question results with outcome reasons', () => {
  const nav = renderToStaticMarkup(
    <AppHeader
      page="mock"
      onNavigate={() => {}}
      meeting={{ status: 'idle' }}
      overlayHotkey=""
      onToggleOverlay={() => {}}
    />,
  )
  expect(nav).toContain('Mock interview')
  expect(nav).toContain('aria-current="page"')
  const html = renderToStaticMarkup(
    <MockResults
      result={{
        meetingId: 7,
        plan: 'Job interview',
        reason: 'owner',
        questions: [
          {
            id: 'one',
            text: 'Why Friday?',
            followUp: true,
            fallback: false,
            producedSuggestion: false,
            firstVisibleLatencyMs: null,
            completionLatencyMs: null,
            words: 0,
            reason: 'classifier-rejected · none',
          },
        ],
      }}
    />,
  )
  expect(html).toContain('Why Friday?')
  expect(html).toContain('classifier-rejected')
  expect(html).toContain('Practice results')
  expect(html).toContain('not screen paint')
})

it('offers the shared resume input in mock setup', async () => {
  const { MockInterviewPage } = await import('./MockInterviewPage')
  const html = renderToStaticMarkup(<MockInterviewPage visible onSettings={() => {}} />)
  expect(html).toContain('Paste resume text')
  expect(html).toContain('Choose PDF or DOCX')
})
