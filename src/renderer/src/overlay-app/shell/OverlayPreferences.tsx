import { useEffect, useRef } from 'react'
import type { OverlaySettingsModel } from '../layout/useOverlaySettings'
import { AnswerEveryQuestion, type AnswerEveryQuestionModel } from './AnswerEveryQuestion'
import { LOCAL_SHORTCUTS } from './navigation/overlay-shortcuts'

/** The preferences popover: whole-window opacity (Electron's, synced with Settings), this
 *  meeting's Answer every question, and the local shortcuts. It scrolls inside the window.
 *  Escape (handled by navigation) closes it and restores the trigger's focus. */
export function OverlayPreferences({
  settings,
  answerEveryQuestion,
  onClose,
  trigger,
}: {
  settings: OverlaySettingsModel
  answerEveryQuestion: AnswerEveryQuestionModel
  onClose: () => void
  trigger: React.RefObject<HTMLButtonElement | null>
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input')?.focus()
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (ref.current?.contains(target) || trigger.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose, trigger])
  const percent = Math.round(settings.overlayOpacity * 100)
  return (
    <div
      className="overlay-preferences"
      role="dialog"
      aria-label="Overlay preferences"
      id="overlay-preferences"
      ref={ref}
    >
      <label className="ov-range">
        <span className="ov-range-label">Opacity</span>
        <input
          type="range"
          min="0.4"
          max="1"
          step="0.05"
          value={settings.overlayOpacity}
          aria-valuetext={`${percent}%`}
          onChange={(event) => settings.changeOpacity(Number(event.target.value))}
        />
        <span className="ov-range-value">{percent}%</span>
      </label>
      {answerEveryQuestion.meetingId !== null ? (
        <AnswerEveryQuestion model={answerEveryQuestion} />
      ) : (
        <p className="ov-message">Answer every question is set per meeting.</p>
      )}
      <div className="preferences-shortcuts">
        <p className="ov-field-label">While the overlay is focused</p>
        <dl>
          {LOCAL_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys}>
              <dt>
                <kbd>{shortcut.keys}</kbd>
              </dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
