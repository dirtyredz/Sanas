import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import type { MockState } from '@shared/mock-interview/types'
import { localVoice } from './speech'
import './style.css'

function Interviewer(): React.JSX.Element {
  const [state, setState] = useState<MockState | null>(null)
  const [error, setError] = useState('')
  const spoken = useRef(0)
  useEffect(() => {
    const off = window.sanas.mockInterview.onChanged(setState)
    window.sanas.mockInterview
      .getState()
      .then(setState)
      .catch((e) => setError(String(e)))
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void window.sanas.mockInterview.dismiss()
    }
    window.addEventListener('keydown', key)
    return () => {
      off()
      window.removeEventListener('keydown', key)
      speechSynthesis.cancel()
    }
  }, [])
  const speech = state?.speech
  useEffect(() => {
    if (!speech || spoken.current === speech.id) return
    spoken.current = speech.id
    let cancelled = false
    const ack = (ok: boolean): void => {
      if (!cancelled)
        void window.sanas.mockInterview.speechDone(speech.id, ok).catch((e) => setError(String(e)))
    }
    void localVoice(speechSynthesis)
      .then((voice) => {
        if (cancelled) return
        const utterance = new SpeechSynthesisUtterance(speech.text)
        utterance.voice = voice
        utterance.rate = 1
        utterance.onend = () => ack(true)
        utterance.onerror = () => ack(false)
        speechSynthesis.cancel()
        speechSynthesis.speak(utterance)
      })
      .catch((e) => {
        setError(String(e))
        ack(false)
      })
    return () => {
      cancelled = true
      speechSynthesis.cancel()
    }
  }, [speech?.id])
  const act = (fn: () => Promise<void>): void => {
    void fn().catch((e) => setError(String(e)))
  }
  return (
    <main className={state?.share ? 'with-share' : ''}>
      {state?.share && (
        <img className="shared-screen" src={state.share} alt="Interviewer shared screen" />
      )}
      <section className="interviewer-panel">
        <header>
          <span className="avatar" aria-hidden="true">
            S
          </span>
          <div>
            <h1>Mock interviewer</h1>
            <p role="status">
              {state?.status === 'waiting'
                ? 'Listening to you — answer aloud, then pause'
                : (state?.status ?? 'Preparing')}
            </p>
          </div>
        </header>
        {!state?.share && <p className="persona">{state?.persona}</p>}
        <p className="caption" aria-live="polite">
          {state?.caption || 'Getting ready for your practice session…'}
        </p>
        {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
        <nav>
          <button onClick={() => act(window.sanas.mockInterview.skip)}>Skip question</button>
          {state?.share && (
            <button onClick={() => act(window.sanas.mockInterview.dismiss)}>Dismiss share</button>
          )}
          <button className="end" onClick={() => act(window.sanas.mockInterview.end)}>
            End interview
          </button>
        </nav>
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Interviewer />)
