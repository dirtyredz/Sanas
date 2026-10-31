import { useEffect, useRef, useState } from 'react'
import { suggestionArrivalLabel, suggestionLabel } from '@shared/suggestion-label'
import { SuggestionContent } from '../lib/suggestions/SuggestionContent'
import {
  useSuggestionHistory,
  type WhisperReadingState,
} from '../lib/suggestions/useSuggestionHistory'
import { useMeetingContext } from '../lib/meeting/useMeetingContext'
import { OverlayComposer } from './OverlayComposer'
import { OverlayCaptureAction } from './capture/OverlayCaptureAction'
export function OverlaySuggestions({
  meetingId,
  live,
}: {
  meetingId: number | null
  live: boolean
}): React.JSX.Element {
  const readingRef = useRef<WhisperReadingState>({ scrolled: false })
  const suggestionScrollRef = useRef<HTMLDivElement>(null)
  const [history, selectSuggestion] = useSuggestionHistory(meetingId, readingRef)
  const { context } = useMeetingContext(meetingId)
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    readingRef.current.scrolled = false
    suggestionScrollRef.current?.scrollTo({ top: 0 })
  }, [history.selectedId])
  const selectedIndex = history.items.findIndex((item) => item.suggestionId === history.selectedId)
  const suggestion = selectedIndex >= 0 ? history.items[selectedIndex] : null
  const latest = history.items[history.items.length - 1] ?? null
  const hasNewAnswer = latest !== null && latest.suggestionId !== history.selectedId
  const hotkeyInFlight = history.items.some((item) => item.trigger === 'hotkey' && item.streaming)

  const request = async (kind: 'detail' | 'audience'): Promise<void> => {
    if (meetingId === null || pending) return
    setPending(true)
    setNotice('')
    try {
      const result = await window.sanas.assist.request(
        kind === 'detail'
          ? { meetingId, kind, sourceSuggestionId: suggestion!.storedSuggestionId! }
          : { meetingId, kind },
      )
      if (!result.accepted) setNotice(result.message)
      else if (result.storedSuggestionId) {
        const child = history.items.find(
          (item) => item.storedSuggestionId === result.storedSuggestionId,
        )
        if (child) selectSuggestion(child.suggestionId)
      }
    } catch (e) {
      setNotice(String(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="overlay-suggestion">
      <div className="suggestion-bar">
        <span className="label">
          {suggestion ? suggestionLabel(suggestion) : 'Whisper'}
          {suggestion?.streaming && <span className="cursor">▍</span>}
        </span>
        {history.items.length > 0 && (
          <span className="suggestion-nav" aria-label="Whisper history">
            <button
              aria-label="Previous answer"
              disabled={selectedIndex <= 0}
              onClick={() => selectSuggestion(history.items[selectedIndex - 1].suggestionId)}
            >
              ‹
            </button>
            <span>
              {selectedIndex + 1}/{history.items.length}
            </span>
            <button
              aria-label="Next answer"
              disabled={selectedIndex < 0 || selectedIndex >= history.items.length - 1}
              onClick={() => selectSuggestion(history.items[selectedIndex + 1].suggestionId)}
            >
              ›
            </button>
            <button
              className="latest"
              disabled={!hasNewAnswer}
              onClick={() => latest && selectSuggestion(latest.suggestionId)}
            >
              Latest
            </button>
          </span>
        )}
        <button
          className="answer-now"
          disabled={!live || hotkeyInFlight || pending}
          onClick={() => window.sanas.assist.now()}
        >
          Answer now
        </button>
      </div>
      <OverlayComposer key={meetingId} meetingId={meetingId} busy={hotkeyInFlight || pending} />
      <div className="manual-actions">
        <OverlayCaptureAction meetingId={meetingId} live={live} answering={hotkeyInFlight} />
        <button
          disabled={!live || hotkeyInFlight || pending}
          onClick={() => void request('audience')}
        >
          Ask the audience
        </button>
        {suggestion?.storedSuggestionId &&
          suggestion.groundingContextId &&
          suggestion.purpose === 'answer' &&
          !suggestion.streaming &&
          !suggestion.error &&
          (!suggestion.manualKind ||
            suggestion.manualKind === 'typed' ||
            suggestion.manualKind === 'capture') && (
            <button
              disabled={!live || hotkeyInFlight || pending}
              onClick={() => void request('detail')}
            >
              More detail
            </button>
          )}
        {suggestion?.sourceSuggestionId && (
          <button
            onClick={() => {
              const source = history.items.find(
                (i) => i.storedSuggestionId === suggestion.sourceSuggestionId,
              )
              if (source) selectSuggestion(source.suggestionId)
            }}
          >
            Back to source
          </button>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {suggestion?.contextRevision != null &&
        context &&
        suggestion.contextRevision < context.revision && <small>Based on earlier context</small>}
      {hasNewAnswer && (
        <button className="new-answer" onClick={() => selectSuggestion(latest.suggestionId)}>
          {suggestionArrivalLabel(latest)} ›
        </button>
      )}
      <div
        className="suggestion-content"
        ref={suggestionScrollRef}
        onScroll={(event) => {
          readingRef.current.scrolled = event.currentTarget.scrollTop > 4
        }}
      >
        {suggestion?.error && <p className="warn">{suggestion.error}</p>}
        {suggestion && !suggestion.error && (
          <SuggestionContent text={suggestion.text} manualKind={suggestion.manualKind} />
        )}
        {!suggestion && (
          <p className="muted">
            {live
              ? 'Listening for key moments — or press the hotkey for an answer.'
              : 'Suggestions appear here during a meeting.'}
          </p>
        )}
      </div>
    </section>
  )
}
