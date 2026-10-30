import { useEffect, useRef, useState } from 'react'
import type { PresentationState } from '@shared/presentation/types'
import { hotkeyLabel } from '../lib/hotkey-label'

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
        <span>
          Slide {state.ordinal + 1} of {state.count}
        </span>
        <button
          disabled={busy || state.ordinal === 0}
          title={hints[0]}
          onClick={() => void move('prev')}
        >
          Previous slide
        </button>
        <button
          disabled={busy || state.ordinal + 1 >= state.count}
          title={hints[1]}
          onClick={() => void move('next')}
        >
          Next slide
        </button>
        <small>{hints.join(' / ')}</small>
        {(error || state.error) && <p role="alert">{error || state.error}</p>}
      </div>
      <div className="slide-script" ref={scroll}>
        <h3>{state.current?.title}</h3>
        <p>{state.current?.talkingPoint}</p>
        <p>{state.current?.script}</p>
        {state.current?.keyFacts && (
          <details>
            <summary>Key facts</summary>
            <p>{state.current.keyFacts}</p>
          </details>
        )}
      </div>
    </div>
  )
}
