import { useEffect, useRef } from 'react'
import { useTranscript } from '../lib/useTranscript'
import { useSuggestion } from '../lib/useSuggestion'

export function Overlay(): React.JSX.Element {
  const { lines, state } = useTranscript()
  const suggestion = useSuggestion()
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
        <div className="suggestion-bar">
          <span className="label">
            {suggestion
              ? suggestion.trigger === 'hotkey'
                ? 'Answer'
                : 'Whisper'
              : 'Sanas'}
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
        {suggestion && !suggestion.error && (
          <p className="suggestion-text">{suggestion.text}</p>
        )}
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
