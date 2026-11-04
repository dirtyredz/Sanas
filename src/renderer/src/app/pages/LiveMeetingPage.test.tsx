import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../audio/mic', () => ({ startCapture: vi.fn() }))
import { LiveMeetingPage } from './LiveMeetingPage'

it('offers a Meeting context box beside the job picker before Start, and no deck option', () => {
  const html = renderToStaticMarkup(<LiveMeetingPage visible />)
  const setup = html.slice(html.indexOf('class="live-setup"'))
  expect(setup).toMatch(
    /aria-label="Job"[\s\S]*Meeting context[\s\S]*<textarea[^>]*maxLength="20000"/,
  )
  expect(html).toContain('Agenda, attendees, goals, talking points')
  expect(html).not.toMatch(/presentation|slide|deck/i)
  expect(html).toContain('Interview')
})
