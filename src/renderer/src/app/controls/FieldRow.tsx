import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'

/** One setting: label (plus an optional badge) and help on the left, the control on the right.
 *  `stack` puts the control under the label for wide controls (keys, sliders, lists).
 *
 *  The single child control receives the generated `id` and `aria-describedby`, so the label
 *  and help are wired without each caller inventing ids. Pass `controlId` when the child is a
 *  composite that sets its own id. */
export function FieldRow({
  label,
  badge,
  help,
  error,
  layout = 'inline',
  controlId,
  children,
}: {
  label: ReactNode
  badge?: ReactNode
  help?: ReactNode
  /** Shown instead of nothing under the help; also marks the control invalid. */
  error?: string
  layout?: 'inline' | 'stack'
  controlId?: string
  children: ReactNode
}): React.JSX.Element {
  const generated = useId()
  const id = controlId ?? generated
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [help ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ')
  const control =
    controlId === undefined && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id,
          'aria-describedby': describedBy || undefined,
          'aria-invalid': error ? true : undefined,
        })
      : children

  return (
    <div className={`field-row field-row--${layout}${error ? ' field-row--invalid' : ''}`}>
      <div className="field-row-text">
        <label className="field-row-label" htmlFor={id}>
          {label}
          {badge}
        </label>
        {help && (
          <p className="field-row-help" id={helpId}>
            {help}
          </p>
        )}
        {error && (
          <p className="field-row-error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="field-row-control">{control}</div>
    </div>
  )
}
