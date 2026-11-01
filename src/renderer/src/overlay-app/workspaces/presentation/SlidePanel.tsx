import { useEffect, useRef, useState } from 'react'
import type { PresentationState } from '@shared/presentation/types'
import { hotkeyLabel } from '../../../lib/hotkey-label'
import { OverlayButton } from '../../controls/OverlayButton'

export function SlidePanel({ state }: { state: PresentationState }): React.JSX.Element {
  const scroll = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hints, setHints] = useState(['', ''])
  useEffect(() => {
    void window.sanas.settings
      .get()
      .then((s) =>
        setHints([hotkeyLabel(s.presentationPrevHotkey), hotkeyLabel(s.presentationNextHotkey)]),
      )
  }, [])
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 })
    setError('')
  }, [state.meetingId, state.revision])
  const move = async (direction: 'prev' | 'next'): Promise<void> => {
    if (state.meetingId === null) return
    setBusy(true)
    setError('')
    try {
      await window.sanas.presentation.move({ meetingId: state.meetingId, direction })
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="slide-panel">
      <div className="slide-controls">
        <span className="slide-ordinal">
          Slide {state.ordinal + 1} of {state.count}
        </span>
        <OverlayButton
          size="sm"
          disabled={busy || state.ordinal === 0}
          title={hints[0] ? `Previous slide (${hints[0]})` : 'Previous slide'}
          onClick={() => void move('prev')}
        >
          Previous
        </OverlayButton>
        <OverlayButton
          size="sm"
          disabled={busy || state.ordinal + 1 >= state.count}
          title={hints[1] ? `Next slide (${hints[1]})` : 'Next slide'}
          onClick={() => void move('next')}
        >
          Next
        </OverlayButton>
      </div>
      {(error || state.error) && (
        <p className="ov-message ov-message--error" role="alert">
          {error || state.error}
        </p>
      )}
      <div className="slide-script" ref={scroll}>
        <h3>{state.current?.title}</h3>
        {state.current?.talkingPoint && (
          <p className="slide-talking-point">{state.current.talkingPoint}</p>
        )}
        <p>{state.current?.script}</p>
        {state.current?.keyFacts && (
          <details className="ov-disclosure">
            <summary>Key facts</summary>
            <p>{state.current.keyFacts}</p>
          </details>
        )}
        {hints[0] && (
          <p className="slide-hint">
            {hints[0]} / {hints[1]} change slides from any app
          </p>
        )}
      </div>
    </div>
  )
}
