import { useEffect, useState } from 'react'
import type { MeetingState, TranscriptEvent } from '@shared/types'

export interface TranscriptLine {
  speaker: number
  isUser: boolean
  text: string
  /** Meeting-relative start, for the timestamp gutter. */
  tStartMs: number
  interim: boolean
}

/** Subscribes to live transcript + meeting state. Finals append; the interim line replaces itself. */
export function useTranscript(): {
  lines: TranscriptLine[]
  state: MeetingState
  setLines: React.Dispatch<React.SetStateAction<TranscriptLine[]>>
} {
  const [lines, setLines] = useState<TranscriptLine[]>([])
  const [state, setState] = useState<MeetingState>({ meetingId: null, status: 'idle' })

  useEffect(() => {
    const offT = window.sanas.meeting.onTranscript((ev: TranscriptEvent) => {
      setLines((prev) => {
        const next = prev.filter((l) => !l.interim)
        next.push({
          speaker: ev.speaker,
          isUser: ev.isUser,
          text: ev.text,
          tStartMs: ev.tStartMs,
          interim: !ev.isFinal,
        })
        return next.slice(-200) // cap render buffer; SQLite holds the full record
      })
    })
    const offS = window.sanas.meeting.onState((s: MeetingState) => {
      setState(s)
      if (s.status === 'live') setLines([])
    })
    return () => {
      offT()
      offS()
    }
  }, [])

  return { lines, state, setLines }
}
