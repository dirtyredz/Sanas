import { useEffect, useState } from 'react'
import type { Meeting } from '@shared/types'
import { MeetingView } from './MeetingView'
import { formatClock } from '../../lib/format-time'

interface Match {
  meeting: Meeting
  jobName: string
  tStartMs: number
  snippet: string
}

export function SearchPage(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [openMeeting, setOpenMeeting] = useState<Meeting | null>(null)

  // debounce keystrokes → search
  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length >= 2) window.sanas.meetings.search(query).then(setMatches)
      else setMatches([])
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  if (openMeeting) {
    return (
      <MeetingView
        meeting={openMeeting}
        onBack={() => {
          setOpenMeeting(null)
          // Same reason JobDetail refetches here: the meeting may have been renamed, moved to
          // another job, or deleted while open, and these results carry its old job name.
          if (query.trim().length >= 2) window.sanas.meetings.search(query).then(setMatches)
        }}
      />
    )
  }

  const highlight = (text: string): React.JSX.Element => {
    const i = text.toLowerCase().indexOf(query.trim().toLowerCase())
    if (i < 0) return <>{text}</>
    const q = query.trim()
    return (
      <>
        {text.slice(0, i)}
        <mark>{text.slice(i, i + q.length)}</mark>
        {text.slice(i + q.length)}
      </>
    )
  }

  const searching = query.trim().length >= 2

  return (
    <div className="search-page">
      <div className="page-head">
        <h2>Search</h2>
        <p>Anything said in any meeting, across all jobs.</p>
      </div>
      <div className="search-box">
        <input
          autoFocus
          placeholder="Search transcripts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="search-results">
        {searching && matches.length === 0 && <p className="empty">No matches.</p>}
        {matches.map((m, i) => (
          <button key={i} className="search-hit" onClick={() => setOpenMeeting(m.meeting)}>
            <span className="hit-meta">
              {m.jobName} · {m.meeting.title} ·{' '}
              <span className="when">{formatClock(m.tStartMs)}</span>
            </span>
            <span className="hit-snippet">{highlight(m.snippet)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
