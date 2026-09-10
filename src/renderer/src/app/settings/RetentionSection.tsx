import { useEffect, useState } from 'react'
import type { RetentionPreview, RetentionResult, SettingsView } from '@shared/types'
import { SettingsSection } from './SettingsSection'
import { errorText } from '../../lib/ipc-error'

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
  const [result, setResult] = useState<RetentionResult | null>(null)
  const [cleanUpError, setCleanUpError] = useState('')

  useEffect(() => {
    window.sanas.retention.preview().then(setPreview)
  }, [savedAt])

  const cleanUp = async (): Promise<void> => {
    setCleanUpError('')
    try {
      setResult(await window.sanas.retention.run())
    } catch (e) {
      setCleanUpError(errorText(e))
    }
    setPreview(await window.sanas.retention.preview())
  }

  const nothingDue =
    !preview || (preview.meetings === 0 && preview.audioFiles === 0 && preview.orphanFiles === 0)

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
            : [
                preview.audioFiles > 0 || preview.meetings > 0
                  ? `Past the limit right now: ${preview.audioFiles} recording(s) and ${preview.meetings} whole meeting(s).`
                  : '',
                preview.orphanFiles > 0
                  ? `${preview.orphanFiles} recording(s) that no meeting is using.`
                  : '',
                preview.audioBytes > 0 ? `${size(preview.audioBytes)} to free.` : '',
              ]
                .filter(Boolean)
                .join(' ')}
      </p>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={cleanUp} disabled={nothingDue}>
          Clean up now
        </button>
        {cleanUpError && <span className="warn">{cleanUpError}</span>}
        {!cleanUpError && result && (
          <span className={result.failed > 0 ? 'warn' : 'ok'}>
            {`Removed ${result.audioFiles} recording(s) and ${result.meetings} meeting(s)` +
              (result.orphanFiles > 0
                ? `, plus ${result.orphanFiles} recording(s) no meeting was using`
                : '') +
              (result.audioBytes > 0 ? `, freeing ${size(result.audioBytes)}` : '') +
              (result.failed > 0
                ? `. ${result.failed} could not be removed yet — in use, or still being written to. Will retry later.`
                : '')}
          </span>
        )}
      </div>
    </SettingsSection>
  )
}
