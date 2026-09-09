import { useEffect, useState } from 'react'
import type { RetentionPreview, SettingsView } from '@shared/types'
import { SettingsSection } from './SettingsSection'

const CHOICES: { days: number; label: string }[] = [
  { days: 0, label: 'Keep forever' },
  { days: 7, label: 'After 7 days' },
  { days: 30, label: 'After 30 days' },
  { days: 90, label: 'After 90 days' },
  { days: 365, label: 'After a year' },
]

function size(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

/** Two age limits plus an on-demand clean-up. The preview reflects the SAVED limits
 *  (main reads settings), hence `savedAt`. */
export function RetentionSection({
  view,
  savedAt,
  onChange,
}: {
  view: SettingsView
  savedAt: number
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  const [preview, setPreview] = useState<RetentionPreview | null>(null)
  const [result, setResult] = useState('')

  useEffect(() => {
    window.sanas.retention.preview().then(setPreview)
  }, [savedAt])

  const cleanUp = async (): Promise<void> => {
    const removed = await window.sanas.retention.run()
    setResult(
      `Removed ${removed.audioFiles} recording(s) and ${removed.meetings} meeting(s)` +
        (removed.audioBytes > 0 ? `, freeing ${size(removed.audioBytes)}` : ''),
    )
    setPreview(await window.sanas.retention.preview())
  }

  const nothingDue = !preview || (preview.meetings === 0 && preview.audioFiles === 0)

  return (
    <SettingsSection
      title="Retention"
      description="Recordings are the bulky part (about 115 MB per hour); transcripts and summaries are small. A meeting that is still running is never touched."
    >
      <label className="field">
        <span className="label">Delete audio recordings</span>
        <select
          value={view.audioRetentionDays}
          onChange={(e) => onChange({ audioRetentionDays: Number(e.target.value) })}
        >
          {CHOICES.map((c) => (
            <option key={c.days} value={c.days}>
              {c.label}
            </option>
          ))}
        </select>
        <small>The transcript, summary and suggestions stay; only the WAV goes.</small>
      </label>

      <label className="field">
        <span className="label">Delete whole meetings</span>
        <select
          value={view.meetingRetentionDays}
          onChange={(e) => onChange({ meetingRetentionDays: Number(e.target.value) })}
        >
          {CHOICES.map((c) => (
            <option key={c.days} value={c.days}>
              {c.label}
            </option>
          ))}
        </select>
        <small>Transcript, summary, suggestions and recording — gone for good.</small>
      </label>

      <p className="muted retention-status">
        {preview === null
          ? 'Checking…'
          : nothingDue
            ? 'Nothing is past its limit. Clean-up runs on its own every few hours.'
            : `Past the limit right now: ${preview.audioFiles} recording(s) (${size(preview.audioBytes)}) and ${preview.meetings} whole meeting(s).`}
      </p>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={cleanUp} disabled={nothingDue}>
          Clean up now
        </button>
        {result && <span className="ok">{result}</span>}
      </div>
    </SettingsSection>
  )
}
