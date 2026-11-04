import type { TopicSwitchExchange } from '../../src/main/services/assistant/answer-context/topic-switch-fixture'

// Scoring for the topic-switch eval (scripts/eval/topic-switch.eval.ts): which earlier-topic
// terms an answer dragged in. The invented fixture only carries the data (each exchange's
// `carryover` stems); how they are counted belongs to the eval.

/** Employers whose bare name counts only in the STRICT tally. The resume has the asked
 *  technology at Acme (Node, TypeScript, EKS/Aurora/MSK on AWS), so naming it is not a
 *  broken record; the earlier story's technology terms are. */
export const STRICT_EMPLOYER_TERMS = ['acme']

/** Lower-case carryover terms an answer brought in that its question did not name. `strict`
 *  also counts a bare employer name; `referenced` is the text of the exchange a back-referring
 *  question points at (terms from it are not carryover). */
export function carriedTerms(
  answer: string,
  ex: TopicSwitchExchange,
  opts: { strict?: boolean; referenced?: string } = {},
): string[] {
  const a = answer.toLowerCase()
  const q = ex.question.toLowerCase()
  const ref = (opts.referenced ?? '').toLowerCase()
  const terms = opts.strict ? [...ex.carryover, ...STRICT_EMPLOYER_TERMS] : ex.carryover
  return terms.filter((t) => a.includes(t) && !q.includes(t) && !ref.includes(t))
}
