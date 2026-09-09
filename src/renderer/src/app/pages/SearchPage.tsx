import { useEffect, useState } from 'react'
import type { Meeting, SearchMatch } from '@shared/types'
import { MeetingView } from './MeetingView'
import { formatClock } from '../../lib/format-time'
import { splitMatchMarkers } from '@shared/search-markers'

/** Matched terms come wrapped in the shared markers; render those as <mark>. */
function highlighted(snippet: string): React.JSX.Element {
  return (
    <>
      {splitMatchMarkers(snippet).map((p, i) =>
        p.marked ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>,
      )}
    </>
  )
}

export function SearchPage(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
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

  const searching = query.trim().length >= 2

  return (
    <div className="search-page">
      <div className="page-head">
        <h2>Search</h2>
        <p>Anything said in any meeting, across all jobs. Word forms match too.</p>
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
        {matches.map((m) => (
          <button
            key={m.segmentId}
            className="search-hit"
            onClick={() => setOpenMeeting(m.meeting)}
          >
            <span className="hit-meta">
              {m.jobName} · {m.meeting.title} ·{' '}
              <span className="when">{formatClock(m.tStartMs)}</span>
            </span>
            <span className="hit-snippet">{highlighted(m.snippet)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
