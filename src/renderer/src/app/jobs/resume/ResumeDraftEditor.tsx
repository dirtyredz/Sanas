import type { MeetingResume } from '@shared/meeting/meeting-resume'
import { RESUME_MAX_CHARS } from '@shared/meeting/meeting-resume'
import { resumeDraftProblem, withText } from './resume-draft'

/** Paste/import, name, count and preview for an unsaved resume draft. Saving is the caller's. */
export function ResumeDraftEditor({
  value,
  onChange,
  disabled,
  importing,
  importError,
  onImport,
}: {
  value: MeetingResume | null
  onChange: (value: MeetingResume | null) => void
  disabled: boolean
  importing?: boolean
  importError?: string
  onImport: () => void
}): React.JSX.Element {
  const locked = disabled || importing
  const problem = resumeDraftProblem(value)
  return (
    <>
      <button className="btn btn-ghost" disabled={locked} onClick={onImport}>
        {importing ? 'Importing resume...' : 'Choose PDF or DOCX (up to 5 MB)'}
      </button>
      {importError && (
        <p role="alert" className="notice warn">
          {importError}
        </p>
      )}
      <label>
        Paste resume text
        <textarea
          className="field"
          rows={8}
          disabled={locked}
          value={value?.text ?? ''}
          onChange={(e) => onChange(withText(value, e.target.value))}
        />
      </label>
      {value && (
        <>
          <label>
            Resume name
            <input
              className="field"
              maxLength={255}
              disabled={locked}
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
          </label>
          {problem && (
            <p role="alert" className="notice warn">
              {problem}
            </p>
          )}
          <p>
            {value.name} · {value.text.length.toLocaleString('en-US')} /{' '}
            {RESUME_MAX_CHARS.toLocaleString('en-US')} characters
          </p>
          <p>
            {value.text.slice(0, 240)}
            {value.text.length > 240 ? '…' : ''}
          </p>
          <button className="btn btn-ghost" disabled={locked} onClick={() => onChange(null)}>
            Remove resume
          </button>
        </>
      )}
    </>
  )
}
