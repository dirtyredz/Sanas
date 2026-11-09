export interface CoveragePoint {
  readonly id: string
  readonly source: 'talkingPoints' | 'notes'
  readonly text: string
  readonly terms: readonly string[]
}
export interface CoverageCatalog {
  readonly points: readonly CoveragePoint[]
  readonly incomplete: boolean
}

const STOP = new Set(
  'about after again also been being could from have into just more most other over should some than that their them then there these they this those through very what when where which while with would your'.split(
    ' ',
  ),
)
export function terms(text: string): string[] {
  return [
    ...new Set(
      (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
        (t) => t.length >= 4 && !STOP.has(t),
      ),
    ),
  ]
}

/** Complete sentences/bullets only: clipping a claim may remove its qualification. */
export function excerpts(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/u)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
}

export function buildCoverageCatalog(
  job: { talkingPoints?: string; notes?: string } | null | undefined,
): CoverageCatalog {
  const points: CoveragePoint[] = []
  let incomplete = false
  for (const source of ['talkingPoints', 'notes'] as const) {
    for (const [index, text] of excerpts(job?.[source] ?? '').entries()) {
      if (points.length >= 128 || text.length > 600) {
        incomplete = true
        continue
      }
      points.push(
        Object.freeze({
          id: `${source}:${index}`,
          source,
          text,
          terms: Object.freeze(terms(text)),
        }),
      )
    }
  }
  return Object.freeze({ points: Object.freeze(points), incomplete })
}
