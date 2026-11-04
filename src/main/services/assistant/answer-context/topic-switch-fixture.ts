import type { Job } from '@shared/types'
import type { FormattableLine } from '../../turns/transcript-format'

// An INVENTED interview with the "broken record" pattern (DECISIONS 2026-11-04): a long,
// stack-heavy story first, then quick topic switches whose answers should not drag that story
// back in. Every name, company and line here is fictional; no real meeting text belongs here.
// Shared by the prompt tests and the paid old-vs-new eval (scripts/eval/topic-switch.ps1);
// the eval owns the scoring of these fixtures (scripts/eval/carried-terms.ts).

export interface TopicSwitchExchange {
  /** The interviewer's question, as transcribed. */
  question: string
  /** How the question reads if Answer now is pressed before it finishes. */
  cutQuestion?: string
  /** Me's reply, one transcript line each. */
  reply: string[]
  /** Terms an on-topic answer names (any one is enough, lower case). */
  asked: string[]
  /** Earlier-topic technology/story terms an answer must not bring in (lower-case stems). */
  carryover: string[]
  /** Index of the exchange this question refers back to ("a service like that"): terms that
   *  exchange (its fixture reply or the answer given to it) used are not carryover here. */
  refersTo?: number
  /** A factual or inventory check: the answer should stay short (15-40 words). */
  factual: boolean
}

const FEDERATION_TERMS = ['federat', 'subgraph', 'kafka', 'apollo', 'invoic', 'postgres']
export const TOPIC_SWITCH_EXCHANGES: TopicSwitchExchange[] = [
  {
    question: 'Walk me through the federated graph you built at your last role.',
    reply: [
      'Sure. At Acme Corp I owned the move from one big GraphQL server to Apollo federation.',
      'We split the schema into subgraphs by domain: accounts, invoicing, catalog and shipping, and a gateway composed them.',
      'The invoicing subgraph was mine. It owned the invoice and payment types and extended the account type from the accounts subgraph.',
      'Writes went through mutations that published events to Kafka, and the downstream consumers had to be idempotent because Kafka redelivers.',
      'So every consumer kept a processed-event table in Postgres keyed by the event id, and a duplicate was a no-op.',
      'The hardest part was schema ownership. Two teams wanted the same field, and we settled it with a contract review before composition.',
      'We also added a composition check in CI so a breaking subgraph change failed the build before it reached the gateway.',
      'Performance-wise the gateway query planner was fine, but we had to batch the entity lookups in each subgraph with data loaders.',
      'For observability every subgraph forwarded the trace header, so one query showed up as one trace across the services.',
      'By the end we had seven subgraphs, each deployed on its own, and the old monolith schema was retired.',
      'If I did it again I would agree the entity keys earlier, because changing a key after composition is painful.',
      'And I would put the Kafka schemas in the same review as the GraphQL schema, since they drift apart otherwise.',
      'On rollout we ran the gateway beside the monolith and moved clients over one query at a time behind a flag.',
      'The accounts subgraph went first because everything else extended its types, so it had to be stable.',
      'We kept a shadow mode where the gateway answered in parallel and we diffed the responses for two weeks.',
      'Most of the diffs were nullability, where the old server had been looser than the new subgraph schemas.',
      'The invoicing team then added a reconciliation consumer on Kafka that compared invoices to payments every night.',
      'That consumer was also idempotent, and it wrote its findings to Postgres so finance could query them.',
      'Error handling was the other big piece: partial results from one subgraph should not fail the whole query.',
      'We standardised error extensions so the clients could tell a missing entity from an outage.',
      'Schema documentation lived next to each subgraph and the gateway published a combined reference every release.',
      'Looking back, federation paid off once there were more than three teams; before that it was mostly overhead.',
    ],
    asked: ['federat', 'subgraph', 'graphql'],
    carryover: [],
    factual: false,
  },
  {
    question: "What's your level of experience with AWS?",
    reply: [
      'Mostly at Globex. We ran Lambda functions and S3 for a claims intake service.',
      'Then the company moved most of that to Azure, so my recent cloud work is more Azure.',
    ],
    asked: ['globex', 'lambda', 's3', 'azure'],
    carryover: FEDERATION_TERMS,
    factual: true,
  },
  {
    question: 'Other than Lambda, what services have you used?',
    reply: ['S3 for the documents, SQS between a couple of functions, and CloudWatch for alarms.'],
    asked: [
      's3',
      'sqs',
      'sns',
      'cloudwatch',
      'dynamo',
      'api gateway',
      'ecs',
      'rds',
      'step functions',
    ],
    carryover: FEDERATION_TERMS,
    factual: true,
  },
  {
    question: 'Talk to me about some Node services you built recently.',
    cutQuestion: 'Talk to me about some of the Node',
    reply: [
      'At Initech I built a document intake service in Node with Express.',
      'It wrote to MongoDB and wrapped the upstream calls in retries with backoff.',
    ],
    asked: ['node'],
    carryover: FEDERATION_TERMS,
    factual: false,
  },
  {
    question: 'Have you had to use any in your TypeScript?',
    reply: ["Rarely. I'd reach for unknown and narrow it, and keep any to a typed boundary."],
    asked: ['any', 'unknown'],
    carryover: FEDERATION_TERMS,
    factual: true,
  },
  {
    question: 'How do you test a service like that?',
    refersTo: 3,
    reply: ['Unit tests around the handlers, and a contract test against the upstream API.'],
    asked: ['test'],
    carryover: FEDERATION_TERMS,
    factual: false,
  },
]

/** One employer line naming the whole stack, plus two thinner ones: the shape that pulls
 *  every answer toward the stack-heavy project. */
export const TOPIC_SWITCH_RESUME = `Senior Software Engineer
Acme Corp (2021-2024): Led the move to Apollo GraphQL federation with Node and TypeScript subgraphs; event-driven writes over Kafka with idempotent consumers; Postgres; deployed on EKS with Aurora and MSK; Terraform.
Globex (2018-2021): Claims intake on AWS Lambda and S3; later migrated to Azure Functions.
Initech (2016-2018): Node and Express REST services on MongoDB; retry and backoff for upstream integrations.`

export const TOPIC_SWITCH_JOB: Job = {
  id: 1,
  name: 'Fictional platform role',
  companyInfo: 'A fictional lender modernising its loan platform.',
  projectScope:
    'Node and TypeScript services, Apollo GraphQL federation, Kafka, AWS (EKS, Aurora, MSK, Lambda), Terraform.',
  notes: '',
  talkingPoints: '',
  persona: 'Calm, concrete, concise.',
  summaryEmail: '',
  createdAt: '2026-11-04',
  archived: false,
}

export interface TimedLine extends FormattableLine {
  tStartMs: number
  tEndMs: number
}

export interface TopicSwitchQuestion {
  startMs: number
  endMs: number
  text: string
}

const GAP_MS = 400
const MS_PER_CHAR = 55

function line(isUser: boolean, text: string, at: number): TimedLine {
  return {
    speaker: isUser ? -1 : 0,
    isUser,
    text,
    tStartMs: at,
    tEndMs: at + text.length * MS_PER_CHAR,
  }
}

/** The transcript window as it stands at exchange `index`: everything before it, its
 *  question, and the first `replyLines` lines of Me's reply. */
export function topicSwitchWindow(
  index: number,
  replyLines = 0,
): { window: TimedLine[]; question: TopicSwitchQuestion } {
  const window: TimedLine[] = []
  let at = 0
  let question: TopicSwitchQuestion | null = null
  TOPIC_SWITCH_EXCHANGES.slice(0, index + 1).forEach((ex, i) => {
    const q = line(false, ex.question, at)
    window.push(q)
    if (i === index) question = { startMs: q.tStartMs, endMs: q.tEndMs, text: ex.question }
    at = q.tEndMs + GAP_MS
    const reply = i === index ? ex.reply.slice(0, replyLines) : ex.reply
    for (const text of reply) {
      const l = line(true, text, at)
      window.push(l)
      at = l.tEndMs + GAP_MS
    }
  })
  return { window, question: question as unknown as TopicSwitchQuestion }
}
