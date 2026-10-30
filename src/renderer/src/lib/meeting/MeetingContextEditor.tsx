import { useState } from 'react'
import type { MeetingContext } from '@shared/live-controls/types'
import { validateSlides } from '@shared/presentation/types'
import { SlideListEditor } from '../presentation/SlideListEditor'
import { useMeetingContext } from './useMeetingContext'
import { usePresentationState } from './usePresentationState'

export function MeetingContextEditor({ meetingId }: { meetingId: number }): React.JSX.Element {
  const { context, error } = useMeetingContext(meetingId)
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {context && <ContextDraft key={meetingId} context={context} />}
    </>
  )
}
function ContextDraft({ context }: { context: MeetingContext }): React.JSX.Element {
  const [base, setBase] = useState(context)
  const [text, setText] = useState(context.text)
  const [slides, setSlides] = useState(context.slides)
  const presentation = usePresentationState(context.meetingId)
  const [deckRevision, setDeckRevision] = useState<number | null>(null)
  const [ordinal, setOrdinal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const changedDeck = JSON.stringify(slides) !== JSON.stringify(base.slides)
  const selected = Math.min(ordinal ?? presentation.ordinal, Math.max(0, slides.length - 1))
  let invalid = ''
  try {
    validateSlides(slides)
  } catch (e) {
    invalid = String(e)
  }
  const reload = (): void => {
    setBase(context)
    setText(context.text)
    setSlides(context.slides)
    setDeckRevision(null)
    setOrdinal(null)
    setNotice('')
  }
  const apply = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.sanas.meetingContext.update({
        meetingId: base.meetingId,
        expectedRevision: base.revision,
        text,
        ...(changedDeck
          ? {
              deck: {
                slides,
                ordinal: selected,
                expectedPresentationRevision: deckRevision ?? presentation.revision,
              },
            }
          : {}),
      })
      setBase(result)
      setText(result.text)
      setSlides(result.slides)
      setDeckRevision(null)
      setOrdinal(null)
      setNotice('Applied to this meeting.')
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="meeting-context-editor">
      <label className="field">
        <span>Meeting context</span>
        <textarea
          maxLength={20000}
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <details>
        <summary>Meeting slides</summary>
        <SlideListEditor
          slides={slides}
          setSlides={(value) => {
            setSlides(value)
            if (deckRevision === null) setDeckRevision(presentation.revision)
          }}
        />
        <button
          onClick={() => {
            setSlides(base.initialSlides)
            setDeckRevision(presentation.revision)
          }}
        >
          Restore meeting-start slides
        </button>
        <button
          onClick={() => {
            setSlides([])
            setDeckRevision(presentation.revision)
          }}
        >
          Clear slides
        </button>
        {slides.length > 0 && (
          <label>
            Continue from slide{' '}
            <select
              value={selected}
              onChange={(e) => {
                setOrdinal(Number(e.target.value))
                setDeckRevision(presentation.revision)
              }}
            >
              {slides.map((s, i) => (
                <option key={i} value={i}>
                  {i + 1}: {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </details>
      {context.revision !== base.revision && (
        <p role="alert">Context changed in another window. Reload to use the latest version.</p>
      )}
      {invalid && <p role="alert">{invalid}</p>}
      <button disabled={busy || !!invalid} onClick={() => void apply()}>
        Apply to this meeting
      </button>
      <button disabled={busy} onClick={reload}>
        Reload saved context
      </button>
      <p role="status">{notice}</p>
    </div>
  )
}
