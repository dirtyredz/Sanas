import { useCallback, useEffect, useState } from 'react'

export interface AnswerEveryQuestionModel {
  meetingId: number | null
  enabled: boolean
  error: string
  set(enabled: boolean): void
}

/** This meeting's Answer every question switch. Main's snapshot and broadcasts are the truth;
 *  changing it here never changes the saved default. */
export function useAnswerEveryQuestion(meetingId: number | null): AnswerEveryQuestionModel {
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true,
      received = false
    setEnabled(false)
    const apply = (state: { meetingId: number | null; enabled: boolean }): void => {
      if (active && state.meetingId === meetingId) setEnabled(state.enabled)
    }
    const remove = window.sanas.assist.onAnswerEveryQuestion((state) => {
      received = true
      apply(state)
    })
    window.sanas.assist
      .getAnswerEveryQuestion()
      .then((state) => {
        if (!received) apply(state)
      })
      .catch((e) => {
        if (active) setError(String(e))
      })
    return () => {
      active = false
      remove()
    }
  }, [meetingId])
  const set = useCallback(
    (value: boolean) => {
      if (meetingId === null) return
      setError('')
      window.sanas.assist.setAnswerEveryQuestion(meetingId, value).catch((e) => setError(String(e)))
    },
    [meetingId],
  )
  return { meetingId, enabled, error, set }
}

export function AnswerEveryQuestion({
  model,
}: {
  model: AnswerEveryQuestionModel
}): React.JSX.Element | null {
  if (model.meetingId === null) return null
  return (
    <div className="answer-every-question">
      <label className="ov-switch">
        <input
          type="checkbox"
          role="switch"
          checked={model.enabled}
          onChange={(e) => model.set(e.target.checked)}
        />
        <span className="ov-switch-track" aria-hidden="true" />
        <span>Answer every question</span>
      </label>
      {model.error && (
        <p className="ov-message ov-message--error" role="alert">
          {model.error}
        </p>
      )}
    </div>
  )
}
