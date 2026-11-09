import { useEffect, useState } from 'react'
import type { MeetingContext } from '@shared/live-controls/types'
import { newerContext } from './meeting-context-state'

export function useMeetingContext(meetingId: number | null) {
  const [context, setContext] = useState<MeetingContext | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setContext(null)
    setError('')
    if (meetingId === null) return
    const accept = (incoming: MeetingContext): void => {
      if (active) setContext((current) => newerContext(current, incoming, meetingId))
    }
    const remove = window.sanas.meetingContext.onChanged(accept)
    window.sanas.meetingContext
      .get(meetingId)
      .then(accept)
      .catch((e) => {
        if (active) setError(String(e))
      })
    return () => {
      active = false
      remove()
    }
  }, [meetingId])
  return { context: context?.meetingId === meetingId ? context : null, error }
}
