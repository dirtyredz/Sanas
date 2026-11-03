import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MeetingView } from './MeetingView'
import type { Meeting } from '@shared/types'

it.each([true, false, undefined])(
  'shows the immutable profile-use indicator = %s',
  (interviewProfileUsed) => {
    const meeting: Meeting = {
      id: 7,
      jobId: 3,
      title: 'Interview',
      startedAt: '2026-11-03T12:00:00Z',
      endedAt: '2026-11-03T13:00:00Z',
      audioPath: null,
      summary: null,
      actionItems: null,
      interviewProfileUsed,
    }
    const html = renderToStaticMarkup(<MeetingView meeting={meeting} onBack={() => {}} />)
    expect(html.includes('Interview profile used (saved at Start)')).toBe(!!interviewProfileUsed)
  },
)
