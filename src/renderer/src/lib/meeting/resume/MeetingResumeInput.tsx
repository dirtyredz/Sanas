import type { MeetingResume } from '@shared/meeting-resume'
import { RESUME_MAX_CHARS } from '@shared/meeting-resume'

/** A draft belongs to this Start only; it is never remembered in browser storage. */
export function MeetingResumeInput({
  value,
  onChange,
  disabled,
}: {
  value: MeetingResume | null
  onChange: (value: MeetingResume | null) => void
  disabled: boolean
}): React.JSX.Element {
  return (
    <details className="card">
      <summary>
        Resume for this meeting{' '}
        {value ? `(${value.text.length.toLocaleString()} characters)` : '(optional)'}
      </summary>
      <p className="muted">
        Saved with this meeting. Used as candidate facts in assistant prompts and terminology hints
        for transcription.
      </p>
      <label>
        Paste resume text
        <textarea
          className="field"
          rows={5}
          disabled={disabled}
          value={value?.text ?? ''}
          onChange={(e) =>
            onChange(e.target.value ? { name: 'Pasted text', text: e.target.value } : null)
          }
        />
      </label>
      {value && (
        <>
          {(value.text.length > RESUME_MAX_CHARS || !value.text.trim()) && (
            <p role="alert" className="notice warn">
              Resume must contain text and be no longer than 40,000 characters. Shorten or remove it
              before Start.
            </p>
          )}
          <p>
            {value.name} · {value.text.length.toLocaleString()} / 40,000 characters
          </p>
          <p>
            {value.text.slice(0, 240)}
            {value.text.length > 240 ? '…' : ''}
          </p>
          <button className="btn btn-ghost" disabled={disabled} onClick={() => onChange(null)}>
            Remove resume
          </button>
        </>
      )}
    </details>
  )
}
