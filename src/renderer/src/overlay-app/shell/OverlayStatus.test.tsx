import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OverlayStatus } from './OverlayStatus'

it.each([true, undefined])('renders the main-owned resume cue = %s', (noResume) => {
  const html = renderToStaticMarkup(
    <OverlayStatus
      meeting={{ meetingId: 7, status: 'live', noResume }}
      capture={{ notice: null, capturing: false }}
    />,
  )
  expect(html.includes('No resume')).toBe(!!noResume)
})
