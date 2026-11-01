import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/updates/types'
import { Badge } from '../../controls/Badge'
import { SettingsSection } from '../frame/SettingsSection'
import { describeUpdate } from './update-status'

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
  const status = describeUpdate(state)
  const problem = error || state?.error
  return (
    <SettingsSection
      id="updates"
      description="Sanas downloads updates in the background and never restarts during a meeting."
    >
      <dl className="settings-facts">
        <div>
          <dt>Installed version</dt>
          <dd className="mono">{state?.currentVersion ?? '…'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd role="status">
            <Badge tone={status.tone}>{status.text}</Badge>
          </dd>
        </div>
      </dl>
      {status.progress !== null && (
        <div
          className="progress"
          role="progressbar"
          aria-label="Update download"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={status.progress}
        >
          <span style={{ width: `${status.progress}%` }} />
        </div>
      )}
      {problem && (
        <p className="settings-inline-message warn" role="alert">
          {problem}
        </p>
      )}
      {state?.blockReason && <p className="settings-callout">{state.blockReason}</p>}
      <div className="settings-actions">
        <button
          type="button"
          className="btn btn-sm"
          disabled={!status.canCheck}
          onClick={() => void run('check')}
        >
          Check for updates
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!state?.canRestart}
          onClick={() => void run('restart')}
        >
          Restart to update
        </button>
      </div>
    </SettingsSection>
  )
}
