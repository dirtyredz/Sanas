import type { ReactNode } from 'react'

/** One card of the Settings page: a title, one line of what it governs, its fields. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="card settings-section">
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  )
}

/** Keys of Settings the renderer never sees in the clear; typed into fields, sent once. */
export type SecretKey = 'deepgramApiKey' | 'anthropicApiKey' | 'smtpPass'

export function SetBadge({ set }: { set: boolean }): React.JSX.Element {
  return set ? <span className="ok">✓ set</span> : <span className="warn">not set</span>
}
