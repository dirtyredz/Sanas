import { useEffect, useRef, useState } from 'react'
import type { OverlayResizeRequest } from '@shared/types'
import { CompactSuggestion } from '../lib/CompactSuggestion'
import { speakerDisplay } from '../lib/speaker-label'
import { useSuggestionHistory, type WhisperReadingState } from '../lib/useSuggestionHistory'
import { useTranscript } from '../lib/useTranscript'
import {
  DEFAULT_WHISPER_RATIO,
  MAXIMIZED_TRANSCRIPT_HEIGHT,
  SPLITTER_HEIGHT,
  overlaySplit,
  whisperRatioFromHeight,
} from './overlay-split'

type ResizeAxis = 'right' | 'bottom' | 'corner'

interface ResizeSession {
  pointerId: number
  axis: ResizeAxis
  screenX: number
  screenY: number
  width: number
  height: number
}

interface SplitSession {
  pointerId: number
  screenY: number
  whisperHeight: number
  containerHeight: number
}

export function Overlay(): React.JSX.Element {
  const { lines, state } = useTranscript()
  const [ghost, setGhost] = useState(false)
  const [whisperRatio, setWhisperRatio] = useState(DEFAULT_WHISPER_RATIO)
  const [whisperMaximized, setWhisperMaximized] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const suggestionScrollRef = useRef<HTMLDivElement>(null)
  const readingRef = useRef<WhisperReadingState>({ scrolled: false })
  const [history, selectSuggestion] = useSuggestionHistory(state.meetingId, readingRef)
  const contentRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<ResizeSession | null>(null)
  const splitRef = useRef<SplitSession | null>(null)
  const saveSplitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => window.sanas.overlay.onGhostState(setGhost), [])

  useEffect(() => {
    let active = true
    void window.sanas.settings.get().then((settings) => {
      if (active) setWhisperRatio(settings.overlayWhisperRatio)
    })
    return () => {
      active = false
      if (saveSplitTimerRef.current) clearTimeout(saveSplitTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = (): void => setContentHeight(content.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  useEffect(() => {
    readingRef.current.scrolled = false
    suggestionScrollRef.current?.scrollTo({ top: 0 })
  }, [history.selectedId])

  const live = state.status === 'live'
  const paused = state.status === 'paused'
  const tail = lines.slice(-12)
  const selectedIndex = history.items.findIndex((item) => item.suggestionId === history.selectedId)
  const suggestion = selectedIndex >= 0 ? history.items[selectedIndex] : null
  const latest = history.items[history.items.length - 1] ?? null
  const hasNewAnswer = latest !== null && latest.suggestionId !== history.selectedId
  const hotkeyInFlight = history.items.some((item) => item.trigger === 'hotkey' && item.streaming)
  const split = overlaySplit(contentHeight, whisperRatio)
  const transcriptHeight = whisperMaximized
    ? Math.min(MAXIMIZED_TRANSCRIPT_HEIGHT, Math.max(0, contentHeight - SPLITTER_HEIGHT))
    : split.transcriptHeight
  const whisperHeight = Math.max(0, contentHeight - SPLITTER_HEIGHT - transcriptHeight)
  const splitRows =
    contentHeight > 0 ? `${transcriptHeight}px ${SPLITTER_HEIGHT}px ${whisperHeight}px` : undefined

  const persistSplit = (ratio: number): void => {
    if (saveSplitTimerRef.current) clearTimeout(saveSplitTimerRef.current)
    saveSplitTimerRef.current = setTimeout(() => {
      saveSplitTimerRef.current = null
      void window.sanas.settings
        .set({ overlayWhisperRatio: ratio })
        .catch((error) => console.warn('[sanas] could not save the overlay split:', error))
    }, 400)
  }

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

  const startSplit = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || contentHeight <= SPLITTER_HEIGHT) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    splitRef.current = {
      pointerId: event.pointerId,
      screenY: event.screenY,
      whisperHeight,
      containerHeight: contentHeight,
    }
  }

  const continueSplit = (event: React.PointerEvent<HTMLDivElement>): void => {
    const session = splitRef.current
    if (!session || session.pointerId !== event.pointerId) return
    if (Math.abs(session.screenY - event.screenY) < 3) return
    const ratio = whisperRatioFromHeight(
      session.containerHeight,
      session.whisperHeight + session.screenY - event.screenY,
    )
    setWhisperMaximized(false)
    setWhisperRatio(ratio)
    persistSplit(ratio)
  }

  const stopSplit = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (splitRef.current?.pointerId !== event.pointerId) return
    splitRef.current = null
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
      <div
        className={`overlay-content ${whisperMaximized ? 'whisper-maximized' : ''}`}
        ref={contentRef}
        style={{ gridTemplateRows: splitRows }}
      >
        <section className="overlay-transcript" ref={scrollRef}>
          {tail.length === 0 && (
            <p className="muted">
              {live ? 'Listening…' : paused ? 'Paused.' : 'Start a meeting in the Sanas window.'}
            </p>
          )}
          {tail.map((line, index) => (
            <p key={index} className={`line ${line.interim ? 'interim' : ''}`}>
              <span className={`who ${line.isUser ? 'me' : ''}`}>
                {line.speaker >= 0 || line.isUser ? speakerDisplay(line.speaker, line.isUser) : ''}
              </span>
              <span className="text">{line.text}</span>
            </p>
          ))}
        </section>
        <div
          className="overlay-splitter"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize transcript and whisper panels"
          title="Drag to resize; double-click to maximize the whisper"
          onDoubleClick={() => setWhisperMaximized((maximized) => !maximized)}
          onPointerDown={startSplit}
          onPointerMove={continueSplit}
          onPointerUp={stopSplit}
          onPointerCancel={stopSplit}
        />
        <section className="overlay-suggestion">
          <div className="suggestion-bar">
            <span className="label">
              {suggestion ? (suggestion.trigger === 'hotkey' ? 'Answer' : 'Whisper') : 'Whisper'}
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
              disabled={!live || hotkeyInFlight}
              onClick={() => window.sanas.assist.now()}
            >
              Answer now
            </button>
          </div>
          {hasNewAnswer && (
            <button className="new-answer" onClick={() => selectSuggestion(latest.suggestionId)}>
              New answer ›
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
            {suggestion && !suggestion.error && <CompactSuggestion text={suggestion.text} />}
            {!suggestion && (
              <p className="muted">
                {live
                  ? 'Listening for key moments — or press the hotkey for an answer.'
                  : 'Suggestions appear here during a meeting.'}
              </p>
            )}
          </div>
        </section>
      </div>
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
