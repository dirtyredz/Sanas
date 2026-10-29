import { useEffect, useRef, useState } from 'react'
import type { MeetingState, TranscriptEvent } from '@shared/types'
import { useMeetingState } from './useMeetingState'

export interface TranscriptLine {
  speaker: number
  isUser: boolean
  text: string
  /** Meeting-relative start, for the timestamp gutter. */
  tStartMs: number
  interim: boolean
}

/** Subscribes to the live transcript and reads meeting state from the shared state hook. */
export function useTranscript(): {
  lines: TranscriptLine[]
  state: MeetingState
  setLines: React.Dispatch<React.SetStateAction<TranscriptLine[]>>
} {
  const [lines, setLines] = useState<TranscriptLine[]>([])
  const state = useMeetingState()
  const shownMeetingId = useRef<number | null>(null)

  useEffect(
    () =>
      window.sanas.meeting.onTranscript((ev: TranscriptEvent) => {
        setLines((prev) => {
          const next = prev.filter((line) => !line.interim)
          next.push({
            speaker: ev.speaker,
            isUser: ev.isUser,
            text: ev.text,
            tStartMs: ev.tStartMs,
            interim: !ev.isFinal,
          })
          return next.slice(-200) // cap render buffer; SQLite holds the full record
        })
      }),
    [],
  )

  useEffect(() => {
    // Clear for a new meeting only; resuming a paused one keeps what is on screen.
    if (state.status === 'live' && state.meetingId !== shownMeetingId.current) setLines([])
    if (state.meetingId !== null) shownMeetingId.current = state.meetingId
  }, [state])

  return { lines, state, setLines }
}
