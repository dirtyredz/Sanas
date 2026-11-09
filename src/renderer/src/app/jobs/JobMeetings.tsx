import { useState } from 'react'
import type { Meeting } from '@shared/types'
import { formatWhen } from '../../lib/format/format-time'
import { errorText } from '../../lib/ipc-error'
export function JobMeetings({
  meetings,
  onMerged,
  setOpenMeeting,
}: {
  meetings: Meeting[]
  /** Called after a merge so the owner of the list reloads it. */
  onMerged: () => Promise<void>
  setOpenMeeting: (meeting: Meeting) => void
}): React.JSX.Element {
  // merging folds split recordings back into one meeting; it cannot be undone, so the
  // button asks once before it runs
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [confirmMerge, setConfirmMerge] = useState(false)
  const [mergeError, setMergeError] = useState('')
  const [mergeNotice, setMergeNotice] = useState('')

  const togglePick = (id: number): void => {
    setConfirmMerge(false)
    setMergeError('')
    setMergeNotice('')
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  const merge = async (): Promise<void> => {
    setMergeError('')
    setMergeNotice('')
    try {
      const { meeting, recordingsLeftBehind } = await window.sanas.meetings.merge([...picked])
      setPicked(new Set())
      setConfirmMerge(false)
      await onMerged()
      if (recordingsLeftBehind > 0) {
        // stay on the list so the warning is actually read; the merged meeting is one click away
        setMergeNotice(
          `Merged into "${meeting.title}". ${recordingsLeftBehind} recording(s) are still in use ` +
            'by another program — clean-up will remove them later.',
        )
      } else {
        setOpenMeeting(meeting) // show the result straight away
      }
    } catch (e) {
      setConfirmMerge(false)
      setMergeError(errorText(e))
    }
  }

  return (
    <div className="side">
      <section>
        <span className="eyebrow">Meetings</span>
        {meetings.length === 0 && <p className="hint">None yet.</p>}
        {meetings.length > 1 && (
          <p className="hint">Tick two or more to fold a split recording back into one.</p>
        )}
        <div className="meeting-list">
          {meetings.map((m) => (
            <div key={m.id} className="meeting-pick">
              {meetings.length > 1 && (
                <input
                  type="checkbox"
                  checked={picked.has(m.id)}
                  aria-label={`Select ${m.title} for merging`}
                  onChange={() => togglePick(m.id)}
                />
              )}
              <button className="meeting-row" onClick={() => setOpenMeeting(m)}>
                <span>{m.title}</span>
                <span className="when">{formatWhen(m.startedAt)}</span>
              </button>
            </div>
          ))}
        </div>
        {picked.size >= 2 && (
          <div className="row merge-bar">
            {confirmMerge ? (
              <>
                <span className="warn">
                  Fold {picked.size} into the earliest? This cannot be undone.
                </span>
                <button className="btn btn-sm btn-stop" onClick={merge}>
                  Merge
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setConfirmMerge(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-sm" onClick={() => setConfirmMerge(true)}>
                  Merge {picked.size} meetings
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setPicked(new Set())}
                  title="Clear the selection"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        )}
        {mergeError && <p className="notice warn">{mergeError}</p>}
        {mergeNotice && <p className="notice warn">{mergeNotice}</p>}
      </section>
    </div>
  )
}
