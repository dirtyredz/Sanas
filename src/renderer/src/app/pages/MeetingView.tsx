import { useEffect, useRef, useState } from 'react'
import type { Job, Meeting, Segment, Suggestion } from '@shared/types'
import { speakerDisplay } from '../../lib/speaker-label'
import { formatClock, formatWhen } from '../../lib/format-time'
import { errorText } from '../../lib/ipc-error'

/** The model writes action items as "- item" lines; render them as a list when it did. */
function actionItemList(text: string): string[] | null {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length === 0 || !lines.every((l) => /^\s*[-*•]\s+/.test(l))) return null
  return lines.map((l) => l.replace(/^\s*[-*•]\s+/, ''))
}

export function MeetingView({
  meeting,
  onBack,
}: {
  meeting: Meeting
  onBack: () => void
}): React.JSX.Element {
  const [segments, setSegments] = useState<Segment[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [names, setNames] = useState<Map<number, string>>(new Map())
  const [tab, setTab] = useState<'transcript' | 'suggestions'>('transcript')
  const [title, setTitle] = useState(meeting.title)
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState(meeting.jobId)
  // summary/action items can change after open (post-stop pass, regenerate)
  const [current, setCurrent] = useState<Meeting>(meeting)
  const [busy, setBusy] = useState<'summarize' | 'email' | null>(null)
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

  const summarize = async (): Promise<void> => {
    setBusy('summarize')
    try {
      setCurrent(await window.sanas.meetings.summarize(meeting.id))
      flash('ok', 'Summary updated')
    } catch (e) {
      flash('warn', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const emailSummary = async (): Promise<void> => {
    setBusy('email')
    try {
      flash('ok', `Summary emailed to ${await window.sanas.meetings.emailSummary(meeting.id)}`)
    } catch (e) {
      flash('warn', errorText(e))
    } finally {
      setBusy(null)
    }
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

  const speakers = [
    ...new Set(segments.filter((s) => !s.isUser && s.speaker >= 0).map((s) => s.speaker)),
  ].sort((a, b) => a - b)
  const label = (s: Pick<Segment, 'speaker' | 'isUser'>): string =>
    speakerDisplay(s.speaker, s.isUser, names)
  const actions = current.actionItems ? actionItemList(current.actionItems) : null

  return (
    <div className="meeting-view">
      <div className="detail-header">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <input
          className="title-input"
          value={title}
          aria-label="Meeting title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && window.sanas.meetings.rename(meeting.id, title.trim())}
        />
        <div className="actions">
          <button className="btn" onClick={summarize} disabled={busy !== null}>
            {busy === 'summarize' ? 'Summarizing…' : current.summary ? 'Regenerate' : 'Summarize'}
          </button>
          <button
            className="btn"
            onClick={emailSummary}
            disabled={busy !== null || !current.summary}
            title={current.summary ? "Email the summary to this job's address" : 'Summarize first'}
          >
            {busy === 'email' ? 'Sending…' : 'Email summary'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              const path = await window.sanas.meetings.export(meeting.id)
              if (path) flash('ok', `Saved to ${path}`)
            }}
          >
            Export
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              try {
                await window.sanas.meetings.delete(meeting.id)
                onBack()
              } catch (e) {
                flash('warn', errorText(e))
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {notice && <p className={`notice ${notice.kind}`}>{notice.text}</p>}
      <p className="meeting-meta">
        <span className="when">
          {formatWhen(meeting.startedAt)}
          {meeting.endedAt ? ` → ${formatWhen(meeting.endedAt)}` : ' (never ended)'}
        </span>
        <span className="job-move">
          Job
          <select
            value={jobId}
            aria-label="Move to job"
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
            <p>{current.summary}</p>
          </div>
          {current.actionItems && (
            <div>
              <span className="eyebrow">Action items</span>
              {actions ? (
                <ul className="action-list">
                  {actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : (
                <p className="action-items">{current.actionItems}</p>
              )}
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
        <>
          {speakers.length > 0 && (
            <div className="speaker-editor">
              {speakers.map((sp) => (
                <span key={sp} className="speaker-row">
                  <input
                    placeholder={`S${sp + 1}`}
                    aria-label={`Name for speaker ${sp + 1}`}
                    defaultValue={names.get(sp) ?? ''}
                    onBlur={(e) =>
                      window.sanas.meetings
                        .renameSpeaker(meeting.id, sp, e.target.value)
                        .then(reload)
                    }
                  />
                  {speakers.length > 1 && (
                    <select
                      value=""
                      aria-label={`Merge speaker ${sp + 1} into`}
                      title="Merge this speaker into another (fixes diarization drift)"
                      onChange={(e) => {
                        if (e.target.value === '') return
                        window.sanas.meetings
                          .mergeSpeakers(meeting.id, sp, Number(e.target.value))
                          .then(reload)
                      }}
                    >
                      <option value="">merge into…</option>
                      {speakers
                        .filter((o) => o !== sp)
                        .map((o) => (
                          <option key={o} value={o}>
                            {names.get(o) ?? `S${o + 1}`}
                          </option>
                        ))}
                    </select>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="transcript">
            {segments.length === 0 && <p className="empty">No transcript captured.</p>}
            {segments.map((s) => (
              <p key={s.id} className="line">
                <span className="ts">{formatClock(s.tStartMs)}</span>
                <span className={`who ${s.isUser ? 'me' : ''}`}>{label(s)}</span>
                <span className="text">{s.text}</span>
              </p>
            ))}
          </div>
        </>
      )}

      {tab === 'suggestions' && (
        <div className="transcript">
          {suggestions.length === 0 && <p className="empty">No suggestions were generated.</p>}
          {suggestions.map((s) => (
            <div key={s.id} className="suggestion-entry">
              <p className="line">
                <span className="ts">{formatClock(s.tMs)}</span>
                <span className="who">{s.trigger === 'hotkey' ? 'Answer' : 'Whisper'}</span>
                <span className="text muted">
                  {s.trigger === 'hotkey' ? 'you asked' : 'ambient'}
                </span>
              </p>
              <p className="suggestion-body">{s.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
