import { useState } from 'react'
import type { SpeakerIdentityStatus } from '@shared/meeting/speaker-identity'
import { errorText } from '../../../lib/ipc-error'

export function LiveSpeakerControls({
  identity,
  heardIds = [],
}: {
  identity: SpeakerIdentityStatus
  heardIds?: number[]
}): React.JSX.Element {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ids = [
    ...new Set([
      ...identity.currentSpeakerIds,
      ...identity.selectedSpeakerIds,
      ...heardIds.filter((id) => id >= 0),
    ]),
  ]
  const toggle = async (id: number): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.sanas.meeting.pinSpeaker(id, !identity.selectedSpeakerIds.includes(id))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      {identity.identityNeedsConfirmation && (
        <p className="notice warn">
          Identify your voice again. Automatic answers and Next point are paused; Answer now still
          works.
        </p>
      )}
      <div className="speaker-bar">
        <span className="muted">Which voice is you?</span>
        {identity.currentSpeakerIds.length === 0 && (
          <span className="muted">— nothing heard yet on this connection</span>
        )}
        {ids.map((id) => (
          <button
            key={id}
            disabled={busy}
            className={`chip ${identity.selectedSpeakerIds.includes(id) ? 'me' : ''}`}
            onClick={() => void toggle(id)}
            title="Click to mark this voice as you"
          >
            {identity.selectedSpeakerIds.includes(id) ? 'Me' : `Speaker ${id + 1}`}
            {!identity.currentSpeakerIds.includes(id) && ' (earlier)'}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="notice warn">
          {error}
        </p>
      )}
    </div>
  )
}
