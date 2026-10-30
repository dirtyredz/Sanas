import { validateSlides, type Slide } from '../../../../shared/presentation/types'

export function parsePresentation(input: string): {
  slides: Slide[]
  warnings: string[]
  error: string
} {
  const slides: Slide[] = []
  const warnings: string[] = []
  let slide: Slide | null = null
  let field: keyof Slide = 'talkingPoint'
  let fence = ''
  let preamble: string[] = []
  let seen = new Set<string>()
  let appended = new Set<string>()
  const fallback = (): void => {
    while (preamble.length && !preamble[0].trim()) preamble.shift()
    while (preamble.length && !preamble[preamble.length - 1].trim()) preamble.pop()
    if (!preamble.length) return
    const title = preamble.shift()!
    const talkingPoint = preamble.length ? preamble.join('\n') : title
    if (!preamble.length) warnings.push('Single-line text used as both title and talking point.')
    slides.push({ title, talkingPoint, script: '', keyFacts: '' })
    preamble = []
  }
  const append = (text: string): void => {
    if (!slide) preamble.push(text)
    else {
      slide[field] += (appended.has(field) ? '\n' : '') + text
      appended.add(field)
    }
  }
  for (const line of input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = ''
      append(line)
      continue
    }
    if (fence) {
      append(line)
      continue
    }
    if (/^\\(?:##\s|\d+\s*\/|Talking point:|Script:|Key facts:)/i.test(line)) {
      append(line.slice(1))
      continue
    }
    const heading = /^(?:##\s+|\d+\s*\/\s*)(.*)$/.exec(line)
    if (heading) {
      if (preamble.some((l) => l.trim())) {
        fallback()
        warnings.push('Preamble preserved as an additional slide.')
      }
      slide = { title: heading[1], talkingPoint: '', script: '', keyFacts: '' }
      slides.push(slide)
      field = 'talkingPoint'
      seen = new Set()
      appended = new Set()
      continue
    }
    const label = /^(Talking point|Script|Key facts):[ \t]?(.*)$/i.exec(line)
    if (label && slide) {
      const fields: Record<string, keyof Slide> = {
        'talking point': 'talkingPoint',
        script: 'script',
        'key facts': 'keyFacts',
      }
      field = fields[label[1].toLowerCase()]
      if (seen.has(field)) warnings.push(`Slide ${slides.length}: repeated ${label[1]} appended.`)
      seen.add(field)
      if (label[2]) append(label[2])
    } else append(line)
  }
  fallback()
  let error = ''
  try {
    validateSlides(slides)
  } catch (e) {
    error = (e as Error).message
  }
  if (!slides.length) error = 'No slides found.'
  return { slides, warnings, error }
}
