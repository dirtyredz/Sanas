import { useEffect, useState } from 'react'
export function AnswerEveryQuestion({
  meetingId,
}: {
  meetingId: number | null
}): React.JSX.Element | null {
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true,
      received = false
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
  if (meetingId === null) return null
  return (
    <div className="answer-every-question">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setError('')
            window.sanas.assist
              .setAnswerEveryQuestion(meetingId, e.target.checked)
              .catch((error) => setError(String(error)))
          }}
        />{' '}
        Answer every question
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
