// What a merge moves where. Pure — no database, no Electron — so it can be tested and so
// the rules below live somewhere a reader can check them.
//
// Two rules make a merged meeting honest rather than merely joined:
//  - Timestamps shift by the real wall-clock gap between the recordings, so the merged
//    timeline says when things were actually said and the gap between parts stays visible
//    as silence rather than being edited away.
//  - Diarized speaker numbers are assigned per connection, so each part's speakers move
//    into their own block instead of being conflated. Whether part one's "S1" is part
//    two's "S1" is something only a listener knows; the meeting view's merge-speakers
//    control is how they say so.

/** SQLite's datetime text ("YYYY-MM-DD HH:MM:SS", UTC). */
function parseUtc(s: string): number {
  return Date.parse(s.replace(' ', 'T') + 'Z')
}

export interface MergePart {
  id: number
  jobId: number
  startedAt: string
  endedAt: string | null
  summary: string | null
  actionItems: string | null
  /** Highest diarized speaker index in this meeting; -1 when it has none. */
  maxSpeaker: number
}

export interface MergeStep {
  from: number
  timeOffsetMs: number
  speakerOffset: number
}

export interface MergePlan {
  /** The earliest part; it keeps its row, title and start. */
  keepId: number
  steps: MergeStep[]
  endedAt: string | null
  summary: string | null
  actionItems: string | null
}

/** Works out what moves where, or throws a readable reason why it should not. */
export function planMerge(parts: MergePart[]): MergePlan {
  if (parts.length < 2) throw new Error('Pick at least two meetings to merge.')
  if (new Set(parts.map((p) => p.id)).size !== parts.length) {
    throw new Error('The same meeting was listed twice.')
  }
  if (new Set(parts.map((p) => p.jobId)).size > 1) {
    throw new Error('Those meetings belong to different jobs — move them together first.')
  }
  if (parts.some((p) => p.endedAt === null)) {
    throw new Error('One of those meetings never ended — stop it before merging.')
  }

  const ordered = [...parts].sort((a, b) => parseUtc(a.startedAt) - parseUtc(b.startedAt))
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]
    if (prev.endedAt && parseUtc(ordered[i].startedAt) < parseUtc(prev.endedAt)) {
      throw new Error('Those meetings overlap in time — they were not one conversation.')
    }
  }
  const [keep, ...rest] = ordered
  const base = parseUtc(keep.startedAt)

  const steps: MergeStep[] = []
  let speakerOffset = keep.maxSpeaker + 1
  for (const p of rest) {
    steps.push({
      from: p.id,
      timeOffsetMs: Math.max(0, parseUtc(p.startedAt) - base),
      speakerOffset,
    })
    speakerOffset += p.maxSpeaker + 1
  }

  // the merged record ends when its last part ended
  const endedAt = ordered.reduce<string | null>(
    (latest, p) =>
      p.endedAt && (!latest || parseUtc(p.endedAt) > parseUtc(latest)) ? p.endedAt : latest,
    null,
  )
  // keep every part's text rather than discarding it; Regenerate replaces it with one piece
  const join = (pick: (p: MergePart) => string | null): string | null => {
    const blocks = ordered
      .map((p) => ({ at: p.startedAt.slice(11, 16), text: (pick(p) ?? '').trim() }))
      .filter((b) => b.text)
    if (blocks.length === 0) return null
    if (blocks.length === 1) return blocks[0].text
    return blocks.map((b) => `[part ${b.at}] ${b.text}`).join('\n\n')
  }

  return {
    keepId: keep.id,
    steps,
    endedAt,
    summary: join((p) => p.summary),
    actionItems: join((p) => p.actionItems),
  }
}
