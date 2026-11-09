import { useEffect, useRef, useState } from 'react'
import type { Job, Meeting, Segment, Suggestion } from '@shared/types'
import type { MeetingResume } from '@shared/meeting/meeting-resume'
import { formatWhen } from '../../lib/format/format-time'
import { MeetingRecordHeader } from '../meeting/MeetingRecordHeader'
import { TranscriptPanel } from '../meeting/TranscriptPanel'
import { MeetingSuggestionsTab } from '../meeting/MeetingSuggestionsTab'
import { usePresentationHistory } from '../meeting/usePresentationHistory'
import { useMeetingContext } from '../../lib/meeting/context/useMeetingContext'
import { SummaryMarkdown } from '../../lib/SummaryMarkdown'

export function MeetingView({
  meeting,
  onBack,
}: {
  meeting: Meeting
  onBack: () => void
}): React.JSX.Element {
  const { context } = useMeetingContext(meeting.id)
  const [segments, setSegments] = useState<Segment[]>([])
  const presentation = usePresentationHistory(meeting.id, (text) =>
    setNotice({ kind: 'warn', text }),
  )
  const [resume, setResume] = useState<MeetingResume | null>(null)
  useEffect(() => {
    let active = true
    setResume(null)
    window.sanas.meetings
      .getResume(meeting.id)
      .then((saved) => active && setResume(saved))
      .catch(() => undefined) // the resume is supplementary; the record still opens without it
    return () => {
      active = false
    }
  }, [meeting.id])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [names, setNames] = useState<Map<number, string>>(new Map())
  const [tab, setTab] = useState<'transcript' | 'suggestions'>('transcript')
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState(meeting.jobId)
  // summary/action items can change after open (post-stop pass, regenerate)
  const [current, setCurrent] = useState<Meeting>(meeting)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // One toast at a time: a newer message replaces the old one and restarts the clock,
  // so an earlier timer can never clear a later notice early.
  const flash = (kind: 'ok' | 'warn', text: string): void => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ kind, text })
    noticeTimer.current = setTimeout(() => setNotice(null), 5000)
  }

  const reload = (): void => {
    window.sanas.meetings.segments(meeting.id).then(setSegments)
    window.sanas.meetings
      .speakerNames(meeting.id)
      .then((rows) => setNames(new Map(rows.map((r) => [r.speaker, r.name]))))
    window.sanas.meetings.get(meeting.id).then((m) => m && setCurrent(m))
  }

  useEffect(() => {
    reload()
    window.sanas.meetings.suggestions(meeting.id).then(setSuggestions)
    window.sanas.jobs.list().then(setJobs)
    // re-diarization rewrote this meeting's record — refresh so edits target real indices
    return window.sanas.meetings.onUpdated((id) => {
      if (id === meeting.id) reload()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id])

  return (
    <div className="meeting-view">
      {meeting.interviewProfileUsed && (
        <p className="notice">Interview profile used (saved at Start)</p>
      )}
      {resume && (
        <details className="card">
          <summary>
            Resume for this meeting ? {resume.name} ({resume.text.length.toLocaleString()}{' '}
            characters)
          </summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{resume.text}</pre>
        </details>
      )}
      <MeetingRecordHeader
        meeting={meeting}
        current={current}
        onBack={onBack}
        onSummarized={setCurrent}
        flash={flash}
      />
      {notice && <p className={`notice ${notice.kind}`}>{notice.text}</p>}
      {meeting.practice && <p className="notice">Practice meeting</p>}
      <p className="meeting-meta">
        <span className="when">
          {formatWhen(meeting.startedAt)}
          {meeting.endedAt ? ` → ${formatWhen(meeting.endedAt)}` : ' (never ended)'}
        </span>
        <span className="job-move">
          Job
          <select
            value={jobId}
            aria-label="File under job"
            title="Filing changes history organization. Saved answers preserve their original context. Moving to a different job removes the meeting's resume and interview profile."
            onChange={(e) => {
              const target = Number(e.target.value)
              setJobId(target)
              window.sanas.meetings.move(meeting.id, target)
            }}
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </span>
      </p>

      {current.summary && (
        <section className="card summary-card">
          <div>
            <span className="eyebrow">Summary</span>
            <SummaryMarkdown text={current.summary} />
          </div>
          {current.actionItems && (
            <div>
              <span className="eyebrow">Action items</span>
              <SummaryMarkdown text={current.actionItems} />
            </div>
          )}
        </section>
      )}

      <div className="tab-bar">
        <button
          className={tab === 'transcript' ? 'active' : ''}
          onClick={() => setTab('transcript')}
        >
          Transcript
        </button>
        <button
          className={tab === 'suggestions' ? 'active' : ''}
          onClick={() => setTab('suggestions')}
        >
          Suggestions ({suggestions.length})
        </button>
      </div>

      {tab === 'transcript' && (
        <TranscriptPanel
          meetingId={meeting.id}
          segments={segments}
          names={names}
          presentation={presentation}
          onChanged={reload}
        />
      )}

      {context?.text && (
        <section className="card">
          <h2>Meeting context (owner background)</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{context.text}</p>
        </section>
      )}
      {tab === 'suggestions' && <MeetingSuggestionsTab suggestions={suggestions} />}
    </div>
  )
}
