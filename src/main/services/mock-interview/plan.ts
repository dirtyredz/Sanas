export const fixtureIds = [
  'architecture',
  'coding-boundary',
  'coding-duplicates',
  'coding-sql',
  'dashboard',
] as const
export type FixtureId = (typeof fixtureIds)[number]

export interface LiveTopic {
  id: string
  question: string
  maxFollowUps: number
  screen?: FixtureId
}
export interface LivePlan {
  version: 1
  mode: 'live'
  name: string
  persona: string
  durationMs: number
  silenceMs: number
  displayId?: number
  topics: LiveTopic[]
}

export function validatePlan(raw: unknown): LivePlan {
  const fail = (): never => {
    throw new Error('Invalid live plan')
  }
  if (!raw || typeof raw !== 'object') return fail()
  const p = raw as LivePlan
  const text = (s: unknown, max: number): s is string =>
    typeof s === 'string' && !!s.trim() && s.length <= max
  const integer = (n: unknown, min: number, max: number): boolean =>
    typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max
  if (
    p.version !== 1 ||
    p.mode !== 'live' ||
    !text(p.name, 200) ||
    !text(p.persona, 2000) ||
    !integer(p.durationMs, 10000, 3600000) ||
    !integer(p.silenceMs ?? 2500, 500, 15000) ||
    (p.displayId !== undefined && !Number.isInteger(p.displayId)) ||
    !Array.isArray(p.topics) ||
    !p.topics.length ||
    p.topics.length > 30
  )
    return fail()
  const ids = new Set<string>()
  const topics = p.topics.map((t) => {
    if (
      !t ||
      !text(t.id, 100) ||
      ids.has(t.id) ||
      !text(t.question, 700) ||
      !integer(t.maxFollowUps, 0, 5)
    )
      return fail()
    ids.add(t.id)
    if (t.screen !== undefined && !fixtureIds.includes(t.screen))
      throw new Error('Live screen fixture is missing')
    return {
      id: t.id,
      question: t.question,
      maxFollowUps: t.maxFollowUps,
      ...(t.screen ? { screen: t.screen } : {}),
    }
  })
  return {
    version: 1,
    mode: 'live',
    name: p.name,
    persona: p.persona,
    durationMs: p.durationMs,
    silenceMs: p.silenceMs ?? 2500,
    displayId: p.displayId,
    topics,
  }
}
