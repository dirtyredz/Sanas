import { useEffect, useRef } from 'react'
import { useTranscript } from '../lib/useTranscript'

export function Overlay(): React.JSX.Element {
  const { lines, state } = useTranscript()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const live = state.status === 'live'
  const tail = lines.slice(-12)

  return (
    <div className="overlay-panel">
      <header className="overlay-header">
        <span className={`dot ${live ? 'live' : ''}`} />
        <span className="title">Sanas</span>
        <span className="hint">{live ? 'listening' : state.status}</span>
      </header>
      <section className="overlay-transcript" ref={scrollRef}>
        {tail.length === 0 && (
          <p className="muted">{live ? 'Listening…' : 'Start a meeting in the Sanas window.'}</p>
        )}
        {tail.map((l, i) => (
          <p key={i} className={`line ${l.interim ? 'interim' : ''}`}>
            {l.speaker >= 0 && <span className="who">{l.isUser ? 'Me' : `S${l.speaker + 1}`}</span>}
            {l.text}
          </p>
        ))}
      </section>
      <section className="overlay-suggestion">
        <p className="muted">Whispered suggestions land here (Phase 3).</p>
      </section>
    </div>
  )
}
