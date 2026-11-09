/** Rename or merge the diarized speakers of a saved meeting. */
export function SpeakerEditor({
  meetingId,
  speakers,
  names,
  onChanged,
}: {
  meetingId: number
  speakers: number[]
  names: Map<number, string>
  onChanged: () => void
}): React.JSX.Element | null {
  if (speakers.length === 0) return null
  return (
    <div className="speaker-editor">
      {speakers.map((sp) => (
        <span key={sp} className="speaker-row">
          <input
            placeholder={`S${sp + 1}`}
            aria-label={`Name for speaker ${sp + 1}`}
            defaultValue={names.get(sp) ?? ''}
            onBlur={(e) =>
              window.sanas.meetings.renameSpeaker(meetingId, sp, e.target.value).then(onChanged)
            }
          />
          {speakers.length > 1 && (
            <select
              value=""
              aria-label={`Merge speaker ${sp + 1} into`}
              title="Merge this speaker into another (fixes diarization drift)"
              onChange={(e) => {
                if (e.target.value === '') return
                window.sanas.meetings
                  .mergeSpeakers(meetingId, sp, Number(e.target.value))
                  .then(onChanged)
              }}
            >
              <option value="">merge into…</option>
              {speakers
                .filter((o) => o !== sp)
                .map((o) => (
                  <option key={o} value={o}>
                    {names.get(o) ?? `S${o + 1}`}
                  </option>
                ))}
            </select>
          )}
        </span>
      ))}
    </div>
  )
}
