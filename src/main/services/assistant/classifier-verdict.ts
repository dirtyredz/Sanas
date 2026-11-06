// Pure verdict parsing for the turn classifier: what the model's reply MEANS, kept apart from
// the provider call (classifier.ts owns deadlines, cancellation and the request itself).
//
// Tolerant but conservative. Small models sometimes reorder the pair ("room question"), shout
// it, punctuate it or label it ("Verdict: ROOM, QUESTION."). A reply is accepted when it names
// exactly one kind and one addressee (in either order) or only `none`, as whole words, with no
// competing or hedging words. Anything else fails closed: an automatic answer for a turn
// nobody asked about costs money and attention, a missed one only costs the turn.
//
// Evidence never carries the reply itself: callers record the canonical verdict
// (`formatVerdict`) or, for a rejection, `malformedShape` (enum-token order, a length bucket and
// two flags), so surrounding provider prose can never reach a log or report.

export type ResponseKind = 'question' | 'request' | 'objection'
export type Addressee = 'me' | 'room' | 'other'

export type ClassifierVerdict = { kind: 'none' } | { kind: ResponseKind; addressee: Addressee }

/** Why a reply was not a verdict. */
export type VerdictRejection =
  'empty' | 'oversized' | 'no-verdict' | 'incomplete' | 'conflict' | 'hedged'

export type VerdictParse =
  { ok: true; verdict: ClassifierVerdict } | { ok: false; rejection: VerdictRejection }

/** A malformed reply described without its text. */
export interface MalformedShape {
  rejection: VerdictRejection
  lengthBucket: '0' | '1-16' | '17-48' | '49-120' | '>120'
  /** Enum words in the order they appeared, at most MAX_SHAPE_TOKENS. */
  tokens: VerdictToken[]
  punctuation: boolean
  uppercase: boolean
}

type VerdictToken = ResponseKind | Addressee | 'none'

/** A verdict is a few words; a longer reply is an explanation, which the prompt forbids. */
export const MAX_VERDICT_CHARS = 120
const MAX_SHAPE_TOKENS = 6

const KINDS: ReadonlySet<string> = new Set<ResponseKind>(['question', 'request', 'objection'])
const ADDRESSEES: ReadonlySet<string> = new Set<Addressee>(['me', 'room', 'other'])
/** Negation, alternatives and uncertainty: "not me", "question or request", "maybe room". */
const HEDGES: ReadonlySet<string> = new Set([
  'not',
  'no',
  'nor',
  'never',
  'neither',
  'either',
  'or',
  'unless',
  'maybe',
  'perhaps',
  'possibly',
  'probably',
  'likely',
  'unlikely',
  'might',
  'could',
  'unclear',
  'unsure',
  'uncertain',
  'isn',
  'isnt',
  'cannot',
  'can',
  'don',
  'doesn',
])

/** Lowercase words; apostrophes split ("isn't" → "isn", "t"), so hedges still match. */
function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? []
}

function isToken(word: string): word is VerdictToken {
  return word === 'none' || KINDS.has(word) || ADDRESSEES.has(word)
}

export function parseVerdict(text: string): VerdictParse {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, rejection: 'empty' }
  if (trimmed.length > MAX_VERDICT_CHARS) return { ok: false, rejection: 'oversized' }
  const all = words(trimmed)
  if (all.some((w) => HEDGES.has(w))) return { ok: false, rejection: 'hedged' }
  const kinds = new Set(all.filter((w) => KINDS.has(w)))
  const addressees = new Set(all.filter((w) => ADDRESSEES.has(w)))
  const none = all.includes('none')
  if (none) {
    return kinds.size || addressees.size
      ? { ok: false, rejection: 'conflict' }
      : { ok: true, verdict: { kind: 'none' } }
  }
  if (kinds.size > 1 || addressees.size > 1) return { ok: false, rejection: 'conflict' }
  if (!kinds.size && !addressees.size) return { ok: false, rejection: 'no-verdict' }
  if (!kinds.size || !addressees.size) return { ok: false, rejection: 'incomplete' }
  return {
    ok: true,
    verdict: {
      kind: [...kinds][0] as ResponseKind,
      addressee: [...addressees][0] as Addressee,
    },
  }
}

/** The verdict, or null for anything that is not one (see parseVerdict for the rules). */
export function parseClassification(text: string): ClassifierVerdict | null {
  const parsed = parseVerdict(text)
  return parsed.ok ? parsed.verdict : null
}

/** Canonical text for evidence: "none" or "<kind> <addressee>". */
export function formatVerdict(v: ClassifierVerdict): string {
  return v.kind === 'none' ? 'none' : `${v.kind} ${v.addressee}`
}

function lengthBucket(n: number): MalformedShape['lengthBucket'] {
  if (n === 0) return '0'
  if (n <= 16) return '1-16'
  if (n <= 48) return '17-48'
  if (n <= MAX_VERDICT_CHARS) return '49-120'
  return '>120'
}

/** What a rejected reply looked like, with none of its text. Bounded input. */
export function malformedShape(text: string, rejection: VerdictRejection): MalformedShape {
  const trimmed = text.trim()
  const head = trimmed.slice(0, MAX_VERDICT_CHARS * 4)
  return {
    rejection,
    lengthBucket: lengthBucket(trimmed.length),
    tokens: words(head).filter(isToken).slice(0, MAX_SHAPE_TOKENS),
    punctuation: /[^\p{L}\p{N}\s]/u.test(head),
    uppercase: /\p{Lu}/u.test(head),
  }
}
