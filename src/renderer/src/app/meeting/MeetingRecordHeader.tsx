import { useState } from 'react'
import type { Meeting } from '@shared/types'
import { errorText } from '../../lib/ipc-error'

/** Title plus the record actions: summarize, email, export, delete. Outcomes go to `flash`. */
export function MeetingRecordHeader({
  meeting,
  current,
  onBack,
  onSummarized,
  flash,
}: {
  meeting: Meeting
  /** The record as last loaded; its summary decides which actions apply. */
  current: Meeting
  onBack: () => void
  onSummarized: (updated: Meeting) => void
  flash: (kind: 'ok' | 'warn', text: string) => void
}): React.JSX.Element {
  const [title, setTitle] = useState(meeting.title)
  const [busy, setBusy] = useState<'summarize' | 'email' | null>(null)

  const summarize = async (): Promise<void> => {
    setBusy('summarize')
    try {
      onSummarized(await window.sanas.meetings.summarize(meeting.id))
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

  return (
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
  )
}
