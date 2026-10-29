import { useEffect, useRef, useState } from 'react'
import { useTranscript } from '../lib/useTranscript'
import { useSuggestion } from '../lib/useSuggestion'
import { speakerDisplay } from '../lib/speaker-label'
import { CompactSuggestion } from '../lib/CompactSuggestion'
import type { OverlayResizeRequest } from '@shared/types'

type ResizeAxis = 'right' | 'bottom' | 'corner'

interface ResizeSession {
  pointerId: number
  axis: ResizeAxis
  screenX: number
  screenY: number
  width: number
  height: number
}

export function Overlay(): React.JSX.Element {
  const { lines, state } = useTranscript()
  const suggestion = useSuggestion()
  const [ghost, setGhost] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<ResizeSession | null>(null)

  useEffect(() => window.sanas.overlay.onGhostState(setGhost), [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const live = state.status === 'live'
  const paused = state.status === 'paused'
  const tail = lines.slice(-12)

  const startResize = (axis: ResizeAxis, event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      axis,
      screenX: event.screenX,
      screenY: event.screenY,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }

  const continueResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const session = resizeRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const request: OverlayResizeRequest = {}
    if (session.axis !== 'bottom') {
      request.width = Math.round(session.width + event.screenX - session.screenX)
    }
    if (session.axis !== 'right') {
      request.height = Math.round(session.height + event.screenY - session.screenY)
    }
    if ((request.width ?? 1) > 0 && (request.height ?? 1) > 0) {
      void window.sanas.overlay.resize(request)
    }
  }

  const stopResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="overlay-panel">
      <header className="overlay-header">
        <span className={`dot ${live ? 'live' : paused ? 'paused' : ''}`} />
        <span className="title">SANAS</span>
        <span className="hint">
          {ghost
            ? 'ghost — hotkey restores'
            : live
              ? 'listening'
              : paused
                ? 'paused'
                : state.status}
        </span>
        <button
          className="ghost-btn"
          title="Ghost mode: clicks pass through. Press the overlay hotkey to restore."
          onClick={() => window.sanas.overlay.setClickThrough(true)}
        >
          👻
        </button>
      </header>
      <section className="overlay-transcript" ref={scrollRef}>
        {tail.length === 0 && (
          <p className="muted">
            {live ? 'Listening…' : paused ? 'Paused.' : 'Start a meeting in the Sanas window.'}
          </p>
        )}
        {tail.map((l, i) => (
          <p key={i} className={`line ${l.interim ? 'interim' : ''}`}>
            <span className={`who ${l.isUser ? 'me' : ''}`}>
              {l.speaker >= 0 || l.isUser ? speakerDisplay(l.speaker, l.isUser) : ''}
            </span>
            <span className="text">{l.text}</span>
          </p>
        ))}
      </section>
      <section className="overlay-suggestion">
        <div className="suggestion-bar">
          <span className="label">
            {suggestion ? (suggestion.trigger === 'hotkey' ? 'Answer' : 'Whisper') : 'Sanas'}
            {suggestion?.streaming && <span className="cursor">▍</span>}
          </span>
          <button
            className="answer-now"
            disabled={!live || suggestion?.streaming === true}
            onClick={() => window.sanas.assist.now()}
          >
            Answer now
          </button>
        </div>
        {suggestion?.error && <p className="warn">{suggestion.error}</p>}
        {suggestion && !suggestion.error && <CompactSuggestion text={suggestion.text} />}
        {!suggestion && (
          <p className="muted">
            {live
              ? 'Listening for key moments — or press the hotkey for an answer.'
              : 'Suggestions appear here during a meeting.'}
          </p>
        )}
      </section>
      {(['right', 'bottom', 'corner'] as const).map((axis) => (
        <div
          key={axis}
          className={`resize-handle ${axis}`}
          onPointerDown={(event) => startResize(axis, event)}
          onPointerMove={continueResize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
        />
      ))}
    </div>
  )
}
