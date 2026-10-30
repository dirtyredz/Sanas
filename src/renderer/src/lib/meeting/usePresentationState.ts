import { useEffect, useState } from 'react'
import { acceptPresentation, EMPTY_PRESENTATION } from './presentation-state'
import type { PresentationState } from '@shared/presentation/types'

export function usePresentationState(meetingId: number | null): PresentationState {
  const [state, setState] = useState(EMPTY_PRESENTATION)
  useEffect(() => {
    let active = true
    let broadcast = false
    setState(EMPTY_PRESENTATION)
    const remove = window.sanas.presentation.onChanged((next) => {
      broadcast = true
      setState((old) => acceptPresentation(old, next, meetingId))
    })
    window.sanas.presentation
      .getState()
      .then((next) => {
        if (active && !broadcast) setState((old) => acceptPresentation(old, next, meetingId))
      })
      .catch((e) => {
        if (active) setState((old) => ({ ...old, error: String(e) }))
      })
    return () => {
      active = false
      remove()
    }
  }, [meetingId])
  return state.meetingId === meetingId ? state : EMPTY_PRESENTATION
}
