import { useEffect, useRef } from 'react'
import type { MeetingState } from '@shared/types'
import type { TranscriptLine } from '../../../lib/meeting/useTranscript'
import { speakerDisplay } from '../../../lib/speaker-label'

/** The live transcript tail: the last twelve lines, interim text muted, teal for the room and
 *  sand for the owner. The full record stays in the main window. */
export function OverlayTranscript({
  lines,
  status,
}: {
  lines: TranscriptLine[]
  status: MeetingState['status']
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])
  const tail = lines.slice(-12)
  return (
    <div className="overlay-transcript" ref={scrollRef}>
      {tail.length === 0 && (
        <p className="ov-empty">
          {status === 'live'
            ? 'Listening — speech appears here as it is transcribed.'
            : status === 'paused'
              ? 'Paused. Resume in Sanas to keep transcribing.'
              : 'The live transcript appears here during a meeting.'}
        </p>
      )}
      {tail.map((line, index) => (
        <p key={index} className={`line ${line.interim ? 'interim' : ''}`}>
          <span className={`who ${line.isUser ? 'me' : ''}`}>
            {line.speaker >= 0 || line.isUser ? speakerDisplay(line.speaker, line.isUser) : ''}
          </span>
          <span className="text">{line.text}</span>
        </p>
      ))}
    </div>
  )
}
