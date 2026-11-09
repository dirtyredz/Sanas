import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OverlayStatus } from './OverlayStatus'

it.each([true, false])(
  'keeps the re-pin cue and Open Sanas action until main confirms (%s)',
  (required) => {
    const html = renderToStaticMarkup(
      <OverlayStatus
        meeting={{
          meetingId: 7,
          status: 'live',
          speakerIdentity: {
            identityNeedsConfirmation: required,
            currentSpeakerIds: [],
            selectedSpeakerIds: [0],
          },
        }}
        capture={{ notice: null, capturing: false }}
      />,
    )
    expect(html.includes('Identify your voice again')).toBe(required)
    expect(html.includes('Open Sanas')).toBe(required)
  },
)

it.each([true, undefined])('renders the main-owned resume cue = %s', (noResume) => {
  const html = renderToStaticMarkup(
    <OverlayStatus
      meeting={{ meetingId: 7, status: 'live', noResume }}
      capture={{ notice: null, capturing: false }}
    />,
  )
  expect(html.includes('No resume or profile')).toBe(!!noResume)
})
