import { useEffect, useRef, useState } from 'react'
import { speakerDisplay } from '../lib/speaker-label'
import { OverlaySuggestions } from './OverlaySuggestions'
import { MeetingContextEditor } from '../lib/meeting/MeetingContextEditor'
import { AnswerEveryQuestion } from './AnswerEveryQuestion'
import { useTranscript } from '../lib/meeting/useTranscript'
import { MAXIMIZED_TRANSCRIPT_HEIGHT, SPLITTER_HEIGHT, overlaySplit } from './overlay-split'
import { useOverlaySettings } from './useOverlaySettings'
import { useOverlayResize } from './useOverlayResize'
import { useSplitDrag } from './useSplitDrag'
import { usePresentationState } from '../lib/meeting/usePresentationState'
import { SlidePanel } from './SlidePanel'

export function Overlay(): React.JSX.Element {
  const { lines, state } = useTranscript()
  const presentation = usePresentationState(state.meetingId)
  const [tab, setTab] = useState<'slide' | 'transcript' | 'context'>('slide')
  useEffect(() => setTab('slide'), [state.meetingId])
  const [ghost, setGhost] = useState(false)
  const {
    overlayOpacity,
    setOverlayOpacity,
    whisperRatio,
    setWhisperRatio,
    persistSplit,
    opacitySaverRef,
  } = useOverlaySettings()
  const { startResize, continueResize, stopResize } = useOverlayResize()
  const [whisperMaximized, setWhisperMaximized] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => window.sanas.overlay.onGhostState(setGhost), [])

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

  const live = state.status === 'live'
  const paused = state.status === 'paused'
  const tail = lines.slice(-12)
  const split = overlaySplit(contentHeight, whisperRatio)
  const transcriptHeight = whisperMaximized
    ? Math.min(MAXIMIZED_TRANSCRIPT_HEIGHT, Math.max(0, contentHeight - SPLITTER_HEIGHT))
    : split.transcriptHeight
  const whisperHeight = Math.max(0, contentHeight - SPLITTER_HEIGHT - transcriptHeight)
  const splitRows =
    contentHeight > 0 ? `${transcriptHeight}px ${SPLITTER_HEIGHT}px ${whisperHeight}px` : undefined

  const { startSplit, continueSplit, stopSplit } = useSplitDrag(
    contentHeight,
    whisperHeight,
    setWhisperMaximized,
    setWhisperRatio,
    persistSplit,
  )

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
        <label
          className="opacity-control"
          title={`Overlay opacity: ${Math.round(overlayOpacity * 100)}%`}
        >
          <span aria-hidden="true">◐</span>
          <input
            aria-label="Overlay opacity"
            type="range"
            min="0.4"
            max="1"
            step="0.05"
            value={overlayOpacity}
            onChange={(event) => {
              const opacity = Number(event.target.value)
              setOverlayOpacity(opacity)
              opacitySaverRef.current.schedule(opacity)
            }}
          />
        </label>
        <button
          className="ghost-btn"
          title="Ghost mode: clicks pass through. Press the overlay hotkey to restore."
          onClick={() => window.sanas.overlay.setClickThrough(true)}
        >
          👻
        </button>
      </header>
      {state.captureWarning && <p className="warn capture-warning">{state.captureWarning}</p>}
      <AnswerEveryQuestion meetingId={state.meetingId} />
      <div
        className={`overlay-content ${whisperMaximized ? 'whisper-maximized' : ''}`}
        ref={contentRef}
        style={{ gridTemplateRows: splitRows }}
      >
        <section
          className={presentation.current ? 'presentation-region' : 'overlay-transcript'}
          ref={presentation.current ? undefined : scrollRef}
        >
          {state.meetingId !== null && (
            <div className="slide-tabs">
              <button onClick={() => setTab('context')} aria-pressed={tab === 'context'}>
                Context
              </button>
              <button onClick={() => setTab('slide')} aria-pressed={tab === 'slide'}>
                Slide
              </button>
              <button onClick={() => setTab('transcript')} aria-pressed={tab === 'transcript'}>
                Transcript
              </button>
            </div>
          )}
          {tab === 'context' && state.meetingId !== null ? (
            <MeetingContextEditor meetingId={state.meetingId} />
          ) : presentation.current && tab === 'slide' ? (
            <SlidePanel state={presentation} />
          ) : (
            <div className={presentation.current ? 'overlay-transcript' : undefined}>
              {tail.length === 0 && (
                <p className="muted">
                  {live
                    ? 'Listening…'
                    : paused
                      ? 'Paused.'
                      : 'Start a meeting in the Sanas window.'}
                </p>
              )}
              {tail.map((line, index) => (
                <p key={index} className={`line ${line.interim ? 'interim' : ''}`}>
                  <span className={`who ${line.isUser ? 'me' : ''}`}>
                    {line.speaker >= 0 || line.isUser
                      ? speakerDisplay(line.speaker, line.isUser)
                      : ''}
                  </span>
                  <span className="text">{line.text}</span>
                </p>
              ))}
            </div>
          )}
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
        <OverlaySuggestions meetingId={state.meetingId} live={live || paused} />
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
