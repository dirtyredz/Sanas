import type { Segment } from '@shared/types'
import { presentationTimeline, slideMarker } from '@shared/presentation/timeline'
import type { PresentationHistory } from '@shared/presentation/types'
import { speakerDisplay } from '../../lib/format/speaker-label'
import { formatClock } from '../../lib/format/format-time'
import { SpeakerEditor } from './SpeakerEditor'

/** A saved meeting's transcript with slide markers, plus the speaker-name editor. */
export function TranscriptPanel({
  meetingId,
  segments,
  names,
  presentation,
  onChanged,
}: {
  meetingId: number
  segments: Segment[]
  names: Map<number, string>
  presentation: PresentationHistory
  onChanged: () => void
}): React.JSX.Element {
  const speakers = [
    ...new Set(segments.filter((s) => !s.isUser && s.speaker >= 0).map((s) => s.speaker)),
  ].sort((a, b) => a - b)
  const label = (s: Pick<Segment, 'speaker' | 'isUser'>): string =>
    speakerDisplay(s.speaker, s.isUser, names)
  return (
    <>
      <SpeakerEditor
        meetingId={meetingId}
        speakers={speakers}
        names={names}
        onChanged={onChanged}
      />
      <div className="transcript">
        {segments.length === 0 && <p className="empty">No transcript captured.</p>}
        {presentationTimeline(segments, presentation).map((row) => {
          if (row.kind === 'slide')
            return (
              <p className="slide-marker" key={`slide-${row.event.revision}`}>
                <span className="ts">{formatClock(row.tMs)}</span>{' '}
                {slideMarker(row.event, row.title)}
              </p>
            )
          const s = row.segment
          return (
            <p key={s.id} className="line">
              <span className="ts">{formatClock(s.tStartMs)}</span>
              <span className={`who ${s.isUser ? 'me' : ''}`}>{label(s)}</span>
              <span className="text">{s.text}</span>
            </p>
          )
        })}
      </div>
    </>
  )
}
