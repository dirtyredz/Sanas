import { useEffect, useRef, useState } from 'react'
import { useTranscript } from '../lib/useTranscript'
import { useSuggestion } from '../lib/useSuggestion'
import { speakerDisplay } from '../lib/speaker-label'

export function Overlay(): React.JSX.Element {
  const { lines, state } = useTranscript()
  const suggestion = useSuggestion()
  const [ghost, setGhost] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => window.sanas.overlay.onGhostState(setGhost), [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const live = state.status === 'live'
  const tail = lines.slice(-12)

  return (
    <div className="overlay-panel">
      <header className="overlay-header">
        <span className={`dot ${live ? 'live' : ''}`} />
        <span className="title">SANAS</span>
        <span className="hint">
          {ghost ? 'ghost — hotkey restores' : live ? 'listening' : state.status}
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
          <p className="muted">{live ? 'Listening…' : 'Start a meeting in the Sanas window.'}</p>
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
        {suggestion && !suggestion.error && <p className="suggestion-text">{suggestion.text}</p>}
        {!suggestion && (
          <p className="muted">
            {live
              ? 'Listening for key moments — or press the hotkey for an answer.'
              : 'Suggestions appear here during a meeting.'}
          </p>
        )}
      </section>
    </div>
  )
}
