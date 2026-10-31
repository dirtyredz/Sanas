import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/updates/types'

export function UpdatesSection(): React.JSX.Element {
  const [state, setState] = useState<UpdateState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const accept = (next: UpdateState): void =>
    setState((old) => (!old || next.revision >= old.revision ? next : old))
  useEffect(() => {
    let active = true
    const receive = (next: UpdateState): void => {
      if (active) accept(next)
    }
    const off = window.sanas.updates.onChanged(receive)
    window.sanas.updates
      .get()
      .then(receive)
      .catch(() => {
        if (active) setError('Update status unavailable.')
      })
    return () => {
      active = false
      off()
    }
  }, [])
  const run = async (action: 'check' | 'restart'): Promise<void> => {
    setError(null)
    try {
      accept(await window.sanas.updates[action]())
    } catch {
      setError('Update action failed. Please try again.')
    }
  }
  return (
    <section className="card">
      <h3>Updates</h3>
      <p>Installed version: {state?.currentVersion ?? 'Loading?'}</p>
      <p role="status">
        {state?.phase}
        {state?.availableVersion ? ' ? ' + state.availableVersion : ''}
        {state?.progress !== null && state?.progress !== undefined
          ? ' ? ' + Math.round(state.progress) + '%'
          : ''}
      </p>
      {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
      <p className="muted">{state?.blockReason}</p>
      <button
        className="btn"
        disabled={
          !state ||
          ['disabled', 'checking', 'available', 'downloading', 'installing'].includes(state.phase)
        }
        onClick={() => void run('check')}
      >
        Check for updates
      </button>
      <button className="btn" disabled={!state?.canRestart} onClick={() => void run('restart')}>
        Restart to update
      </button>
    </section>
  )
}
