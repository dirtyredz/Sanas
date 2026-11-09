import { useEffect, useRef, useState } from 'react'
import type { PresentationHistory } from '@shared/presentation/types'

const EMPTY: PresentationHistory = { events: [], versions: {} }

/** Loads a saved meeting's slide history; `onError` reports a failed load as text. */
export function usePresentationHistory(
  meetingId: number,
  onError: (text: string) => void,
): PresentationHistory {
  const [history, setHistory] = useState<PresentationHistory>(EMPTY)
  const report = useRef(onError)
  report.current = onError
  useEffect(() => {
    let active = true
    setHistory(EMPTY)
    window.sanas.presentation
      .getHistory(meetingId)
      .then((loaded) => {
        if (active) setHistory(loaded)
      })
      .catch((e) => {
        if (active) report.current(String(e))
      })
    return () => {
      active = false
    }
  }, [meetingId])
  return history
}
