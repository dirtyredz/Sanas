import { forwardRef, type TextareaHTMLAttributes } from 'react'

/** A labelled multi-line field in the overlay's field style. The label is visible text, so the
 *  field never relies on placeholder text for its name. */
export const OverlayTextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hideLabel?: boolean }
>(function OverlayTextArea({ label, hideLabel = false, className, ...rest }, ref) {
  return (
    <label className="ov-field">
      <span className={hideLabel ? 'ov-visually-hidden' : 'ov-field-label'}>{label}</span>
      <textarea
        ref={ref}
        className={['ov-textarea', className].filter(Boolean).join(' ')}
        {...rest}
      />
    </label>
  )
})
