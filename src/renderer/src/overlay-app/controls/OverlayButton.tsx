import { forwardRef, type ButtonHTMLAttributes } from 'react'

export type OverlayButtonVariant = 'primary' | 'secondary' | 'quiet' | 'icon'

export interface OverlayButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: OverlayButtonVariant
  size?: 'md' | 'sm'
  /** Work is in progress: the button is disabled and announces itself as busy. */
  busy?: boolean
}

/** The overlay's one button vocabulary (styles in app/styles/overlay-controls.css). Every
 *  button is type="button" and outside the window's drag region. */
export const OverlayButton = forwardRef<HTMLButtonElement, OverlayButtonProps>(
  function OverlayButton(
    { variant = 'secondary', size = 'md', busy = false, className, disabled, ...rest },
    ref,
  ) {
    const classes = ['ov-btn', `ov-btn--${variant}`, size === 'sm' ? 'ov-btn--sm' : '', className]
      .filter(Boolean)
      .join(' ')
    return (
      <button
        ref={ref}
        type="button"
        className={classes}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        {...rest}
      />
    )
  },
)
