// Carries speaker identity and names across a re-diarization pass. Batch
// diarization re-numbers voices, so "S2 = Sarah" and "S1 = me" from the live pass
// can't be looked up by index — but the same voice occupies the same time ranges
// in both passes, so overlap in time says which new index each old one became.
// Pure functions; the DB work stays in rediarize.ts.

export interface TimedSpeech {
  speaker: number
  tStartMs: number
  tEndMs: number
}

type Interval = [number, number]

const MIN_SHARE = 0.5 // a voice must mostly land on one new index to carry anything

function intervalsBySpeaker(segs: TimedSpeech[]): Map<number, Interval[]> {
  const m = new Map<number, Interval[]>()
  for (const s of segs) {
    const list = m.get(s.speaker) ?? []
    list.push([s.tStartMs, s.tEndMs])
    m.set(s.speaker, list)
  }
  return m
}

function overlapMs(a: Interval[], b: Interval[]): number {
  let total = 0
  for (const [as, ae] of a) {
    for (const [bs, be] of b) total += Math.max(0, Math.min(ae, be) - Math.max(as, bs))
  }
  return total
}

function durationMs(iv: Interval[]): number {
  return iv.reduce((t, [s, e]) => t + Math.max(0, e - s), 0)
}

/** New speaker indices whose speech mostly overlaps the previous pass's user speech
 *  (mono capture only — in stereo the channel already says who the user is). */
export function carryUserIdentity(prevUserSpeech: TimedSpeech[], next: TimedSpeech[]): Set<number> {
  const out = new Set<number>()
  const user: Interval[] = prevUserSpeech.map((s) => [s.tStartMs, s.tEndMs])
  if (user.length === 0) return out
  for (const [speaker, iv] of intervalsBySpeaker(next)) {
    const dur = durationMs(iv)
    if (dur > 0 && overlapMs(iv, user) / dur > MIN_SHARE) out.add(speaker)
  }
  return out
}

/** Re-keys previous speaker names onto the new indices their voices moved to.
 *  A new index takes at most one name — the strongest overlap wins. */
export function carrySpeakerNames(
  prev: TimedSpeech[],
  next: TimedSpeech[],
  names: ReadonlyMap<number, string>,
): Map<number, string> {
  const prevIv = intervalsBySpeaker(prev)
  const nextIv = intervalsBySpeaker(next)
  const claims: { speaker: number; name: string; share: number }[] = []
  for (const [oldSpeaker, name] of names) {
    const iv = prevIv.get(oldSpeaker)
    const dur = iv ? durationMs(iv) : 0
    if (!iv || dur === 0) continue
    let best: { speaker: number; share: number } | null = null
    for (const [newSpeaker, niv] of nextIv) {
      const share = overlapMs(iv, niv) / dur
      if (share > MIN_SHARE && (!best || share > best.share)) best = { speaker: newSpeaker, share }
    }
    if (best) claims.push({ speaker: best.speaker, name, share: best.share })
  }
  claims.sort((a, b) => b.share - a.share)
  const out = new Map<number, string>()
  for (const c of claims) if (!out.has(c.speaker)) out.set(c.speaker, c.name)
  return out
}
