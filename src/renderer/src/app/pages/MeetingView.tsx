import { useEffect, useState } from 'react'
import type { Meeting, Segment } from '@shared/types'

export function MeetingView({
  meeting,
  onBack
}: {
  meeting: Meeting
  onBack: () => void
}): React.JSX.Element {
  const [segments, setSegments] = useState<Segment[]>([])

  useEffect(() => {
    window.sanas.meetings.segments(meeting.id).then(setSegments)
  }, [meeting.id])

  const fmt = (ms: number): string => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="meeting-view">
      <div className="detail-header">
        <button className="back" onClick={onBack}>
          ← Back
        </button>
        <h2>{meeting.title}</h2>
        <button
          className="danger"
          onClick={async () => {
            await window.sanas.meetings.delete(meeting.id)
            onBack()
          }}
        >
          Delete
        </button>
      </div>
      <p className="muted">
        {meeting.startedAt}
        {meeting.endedAt ? ` → ${meeting.endedAt}` : ' (never ended)'}
      </p>

      <div className="transcript">
        {segments.length === 0 && <p className="muted">No transcript captured.</p>}
        {segments.map((s) => (
          <p key={s.id} className="line">
            <span className="ts">{fmt(s.tStartMs)}</span>
            {s.speaker >= 0 && (
              <span className={`who ${s.isUser ? 'me' : ''}`}>
                {s.isUser ? 'Me' : `S${s.speaker + 1}`}
              </span>
            )}
            {s.text}
          </p>
        ))}
      </div>
    </div>
  )
}
