export interface Slide {
  title: string
  talkingPoint: string
  script: string
  keyFacts: string
}

export interface SlideEvent {
  revision: number
  ordinal: number
  tMs: number
}

export interface PresentationHistory {
  slides: Slide[]
  events: SlideEvent[]
}

export interface PresentationState {
  meetingId: number | null
  revision: number
  count: number
  ordinal: number
  current: Slide | null
  next: Pick<Slide, 'title' | 'talkingPoint'> | null
  error?: string
}

export const SLIDE_LIMITS = {
  title: 200,
  talkingPoint: 2000,
  script: 12000,
  keyFacts: 4000,
} as const

export function validateSlides(value: unknown): Slide[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('A deck must contain at most 100 slides.')
  let total = 0
  return value.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error(`Slide ${i + 1} must be an object.`)
    const slide = {} as Slide
    for (const key of Object.keys(SLIDE_LIMITS) as (keyof Slide)[]) {
      const text =
        raw[key] === undefined && (key === 'script' || key === 'keyFacts') ? '' : raw[key]
      if (typeof text !== 'string' || text.length > SLIDE_LIMITS[key])
        throw new Error(`Slide ${i + 1}: invalid ${key} (maximum ${SLIDE_LIMITS[key]} characters).`)
      if ((key === 'title' || key === 'talkingPoint') && !text.trim())
        throw new Error(`Slide ${i + 1}: ${key} is required.`)
      total += text.length
      if (total > 1000000) throw new Error('Deck exceeds 1,000,000 characters.')
      slide[key] = text
    }
    return slide
  })
}
