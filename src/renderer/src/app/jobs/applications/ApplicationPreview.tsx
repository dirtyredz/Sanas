import { useEffect, useState } from 'react'
import type { ApplicationPreview as Preview, PreviewField } from '@shared/jobs/applications'
import { errorText } from '../../../lib/ipc-error'
import {
  applyProblem,
  buildApplyRequest,
  initialChoices,
  retainChoices,
  type PreviewChoices,
} from './apply-request'
import { formatUpdated, sourceLabel } from './picker-rows'

const OUTCOME_TEXT: Record<PreviewField['outcome'], string> = {
  new: '',
  unchanged: 'Unchanged',
  incoming: 'Will update from the application',
  'keep-local': 'Your Sanas value is kept (only Sanas changed)',
  conflict: 'Changed in both — choose',
}

/**
 * Create or refresh preview for one listed application. Nothing is saved until Create/Apply;
 * drafted fields are editable first, conflicts default to Keep Sanas, archiving is an explicit
 * choice, and a stale preview asks for a fresh review while keeping choices that still apply.
 */
export function ApplicationPreview({
  applicationId,
  onCancel,
  onApplied,
}: {
  applicationId: string
  onCancel: () => void
  onApplied: (jobId: number) => void
}): React.JSX.Element {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [choices, setChoices] = useState<PreviewChoices | null>(null)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setPreview(null)
    setLoadError('')
    setMessage('')
    window.sanas.jobApplications
      .preview(applicationId)
      .then((next) => {
        if (!active) return
        setPreview(next)
        setChoices((previous) => (previous ? retainChoices(previous, next) : initialChoices(next)))
      })
      .catch((e) => active && setLoadError(errorText(e)))
    return () => {
      active = false
    }
  }, [applicationId, version])

  if (loadError)
    return (
      <section className="card import-preview">
        <p className="notice warn">{loadError}</p>
        <button className="btn" onClick={onCancel}>
          Back
        </button>
      </section>
    )
  if (!preview || !choices)
    return <p className="muted">Preparing the preview (drafting empty fields can take a moment)…</p>

  const update = (patch: Partial<PreviewChoices>): void => setChoices({ ...choices, ...patch })
  const problem = applyProblem(preview, choices)
  const nothingToDo = preview.mode === 'refresh' && !preview.hasChanges && !choices.archive

  const apply = async (): Promise<void> => {
    setPending(true)
    setMessage('')
    try {
      const result = await window.sanas.jobApplications.apply(buildApplyRequest(preview, choices))
      if (result.status === 'stale') setMessage(result.message)
      else onApplied(result.jobId)
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card import-preview" aria-labelledby="import-preview-title">
      <h3 id="import-preview-title">
        {preview.mode === 'create' ? 'New job from application' : 'Review application changes'}
      </h3>
      <p className="muted">
        {preview.company}
        {preview.role && ` · ${preview.role}`} · {preview.stage} · updated{' '}
        {formatUpdated(preview.updatedAt)}
        {preview.jdUrl && ` · ${preview.jdUrl}`}
      </p>
      {preview.draftNotice && <p className="notice warn">{preview.draftNotice}</p>}
      {preview.normalized.length > 0 && (
        <p className="hint">Cleaned up while reading: {preview.normalized.join('; ')}</p>
      )}
      {preview.stageChange && (
        <p className="notice">
          Stage changed: {preview.stageChange.from} → {preview.stageChange.to}
        </p>
      )}
      {preview.name && (
        <label className="field">
          <span className="label">Job name</span>
          <input
            value={choices.name}
            maxLength={120}
            onChange={(e) => update({ name: e.target.value, nameAccepted: true })}
          />
          {preview.name.shortened && (
            <label className="hint">
              <input
                type="checkbox"
                checked={choices.nameAccepted}
                onChange={(e) => update({ nameAccepted: e.target.checked })}
              />{' '}
              The full name is longer than 120 characters; use this shortened name
            </label>
          )}
        </label>
      )}
      {preview.fields.map((field) => (
        <PreviewFieldView key={field.key} field={field} choices={choices} onChange={update} />
      ))}
      {preview.glossaryExcluded.length > 0 && (
        <p className="hint">
          Left out of the glossary (transcription-hint budget):{' '}
          {preview.glossaryExcluded.join(', ')}
        </p>
      )}
      {preview.offerArchive && (
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={choices.archive}
              onChange={(e) => update({ archive: e.target.checked })}
            />{' '}
            Archive the linked job (the application is closed; nothing is deleted)
          </span>
        </label>
      )}
      {preview.archived && (
        <p className="hint">This job is archived; refreshing keeps it archived.</p>
      )}
      {message && (
        <p role="status" className="notice warn">
          {message}{' '}
          <button className="btn btn-sm" onClick={() => setVersion((v) => v + 1)}>
            Review again
          </button>
        </p>
      )}
      {problem && <p className="hint">{problem}</p>}
      <div className="actions">
        <button className="btn" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={() => void apply()}
          disabled={pending || !!problem || nothingToDo || !!message}
        >
          {pending ? 'Saving…' : preview.mode === 'create' ? 'Create job' : 'Apply'}
        </button>
      </div>
      {nothingToDo && <p className="hint">Nothing new to apply.</p>}
    </section>
  )
}

function PreviewFieldView({
  field,
  choices,
  onChange,
}: {
  field: PreviewField
  choices: PreviewChoices
  onChange: (patch: Partial<PreviewChoices>) => void
}): React.JSX.Element {
  const source = sourceLabel(field.source)
  const edit = choices.edits[field.key as keyof PreviewChoices['edits']]
  return (
    <div className={`import-field import-field--${field.outcome}`}>
      <div className="import-field-head">
        <span className="label">{field.label}</span>
        {source && (
          <span className={`badge ${field.source === 'drafted' ? 'badge--accent' : 'badge--ok'}`}>
            {source}
          </span>
        )}
        {OUTCOME_TEXT[field.outcome] && <span className="hint">{OUTCOME_TEXT[field.outcome]}</span>}
      </div>
      {field.outcome === 'new' && field.editable ? (
        <textarea
          rows={field.key === 'glossary' ? 4 : 3}
          aria-label={field.label}
          placeholder={field.key === 'glossary' ? 'One term per line' : ''}
          value={edit ?? field.incoming}
          onChange={(e) => onChange({ edits: { ...choices.edits, [field.key]: e.target.value } })}
        />
      ) : field.outcome === 'conflict' ? (
        <div className="import-conflict">
          <label>
            <input
              type="radio"
              name={`choice-${field.key}`}
              checked={choices.choices[field.key] !== 'incoming'}
              onChange={() => onChange({ choices: { ...choices.choices, [field.key]: 'keep' } })}
            />{' '}
            Keep Sanas
            <pre className="import-value">{field.local || '(empty)'}</pre>
          </label>
          <label>
            <input
              type="radio"
              name={`choice-${field.key}`}
              checked={choices.choices[field.key] === 'incoming'}
              onChange={() =>
                onChange({ choices: { ...choices.choices, [field.key]: 'incoming' } })
              }
            />{' '}
            Use application
            <pre className="import-value">{field.incoming || '(empty)'}</pre>
          </label>
        </div>
      ) : field.outcome === 'unchanged' || field.outcome === 'keep-local' ? null : (
        <pre className="import-value">{field.incoming || '(empty)'}</pre>
      )}
      {field.draftError && <p className="hint">{field.draftError}</p>}
    </div>
  )
}
