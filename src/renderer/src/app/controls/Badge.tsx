import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'accent'

/** A small status pill beside a label: "Set", "Not set", "Registered", "Restart needed". */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone
  children: ReactNode
}): React.JSX.Element {
  return <span className={`badge badge--${tone}`}>{children}</span>
}
