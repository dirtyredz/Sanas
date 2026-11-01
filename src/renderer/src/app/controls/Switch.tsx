import type { InputHTMLAttributes } from 'react'

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'onChange' | 'role'
> {
  checked: boolean
  onChange: (checked: boolean) => void
}

/** An on/off setting: a real checkbox (keyboard, label and form semantics intact) announced
 *  as a switch and drawn as a track and thumb (`.switch` in styles/controls.css). Label it with
 *  a FieldRow, a wrapping <label>, or aria-label. */
export function Switch({ checked, onChange, className, ...rest }: SwitchProps): React.JSX.Element {
  return (
    <span className={['switch', className].filter(Boolean).join(' ')}>
      <input
        {...rest}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </span>
  )
}
