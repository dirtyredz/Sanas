import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { it } from 'vitest'
import { claudeProvider } from '../../src/main/services/assistant/claude'
import { candidateFacts } from '../../src/main/services/meetings/context/candidate-data'
import * as current from '../../src/main/services/meetings/assist/suggestion/suggestion-requests'
import { buildSystemPrompt } from '../../src/main/services/assistant/prompts'
import { ShownLedger } from '../../src/main/services/assistant/answer-context/shown-ledger'
import {
  TOPIC_SWITCH_EXCHANGES,
  TOPIC_SWITCH_JOB,
  TOPIC_SWITCH_RESUME,
  topicSwitchWindow,
  type TimedLine,
  type TopicSwitchExchange,
} from '../../src/main/services/assistant/answer-context/topic-switch-fixture'
import { carriedTerms } from './carried-terms'
import type { CompletedTurn } from '../../src/main/services/turns/types'
import type { SuggestionRequest } from '../../src/main/services/meetings/assist/suggestion/suggestion-runner'

// Old-vs-new answer prompts on the INVENTED topic-switch interview (no owner data, no DB).
// Run through scripts/eval/topic-switch.ps1, which extracts the old tree and sets the env:
//   EVAL_OLD_ROOT  extracted older checkout (its src/ is imported for the old builders)
//   EVAL_OUT       report path (.md); EVAL_DRY=1 builds prompts only (no provider calls)
//   EVAL_SAMPLES   passes per version; EVAL_AUTO_MODEL / EVAL_NOW_MODEL override the models
//   ANTHROPIC_API_KEY (+ optional ANTHROPIC_WORKSPACE_ID) for live runs.

type Lane = 'automatic' | 'answer-now'
interface Version {
  name: 'old' | 'new'
  system: string
  automatic(window: TimedLine[], turn: CompletedTurn): SuggestionRequest
  answerNow(
    window: TimedLine[],
    question: { text: string; startMs: number; open: boolean },
  ): SuggestionRequest
  remember(text: string): void
  reset(): void
}
interface Row {
  version: string
  sample: number
  exchange: number
  lane: Lane
  question: string
  promptChars: number
  systemChars: number
  answer: string
  /** Corrected carryover: earlier-topic technology/story terms (a bare employer name is
   *  excluded; so are terms from the exchange a question refers back to). */
  carried: string[]
  /** Strict carryover: also counts a bare employer name. */
  carriedStrict: string[]
  askedHit: boolean
  words: number
  overLength: boolean
}

const env = process.env
const dry = env.EVAL_DRY === '1'
const samples = Math.max(1, Number(env.EVAL_SAMPLES ?? '1') || 1)
const out = resolve(env.EVAL_OUT ?? '.tmp/eval/topic-switch.md')
const settings = {
  anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
  anthropicWorkspaceId: env.ANTHROPIC_WORKSPACE_ID ?? '',
  nudgeModel: env.EVAL_AUTO_MODEL || 'claude-sonnet-5-5',
  answerModel: env.EVAL_NOW_MODEL || 'claude-opus-5-5',
  classifierModel: 'claude-haiku-5-5',
  whisperMode: 'smart' as const,
  nudgeCooldownSec: 5,
  coachWhileTalking: false,
}
const facts = candidateFacts(TOPIC_SWITCH_RESUME)

function completedTurn(text: string, startMs: number, endMs: number): CompletedTurn {
  return {
    id: startMs,
    channel: 1,
    speaker: 0,
    role: 'other',
    text,
    startMs,
    endMs,
    words: text.split(/\s+/).length,
    fragments: 1,
    completedAt: 0,
    reason: 'endpoint',
  }
}

function newVersion(): Version {
  const shown = new ShownLedger()
  const system = buildSystemPrompt(TOPIC_SWITCH_JOB, []) + facts
  const snap = (window: TimedLine[]): current.AssistSnapshot => ({
    meetingId: 1,
    atMs: 0,
    system,
    window,
    ...shown.snapshot(),
  })
  return {
    name: 'new',
    system,
    automatic: (w, t) => current.automaticAnswerRequest(snap(w), settings, t, [t]),
    answerNow: (w, q) => current.answerNowRequest(snap(w), settings, { speaker: 0, ...q }),
    // both lanes produce answers the user may say aloud (the production persist path)
    remember: (text) => shown.record({ text, purpose: 'answer' }),
    reset: () => shown.reset(),
  }
}

async function oldVersion(root: string): Promise<Version> {
  const load = (rel: string): Promise<Record<string, any>> =>
    import(pathToFileURL(join(root, rel)).href)
  const requests = await load('src/main/services/meetings/assist/suggestion/suggestion-requests.ts')
  const prompts = await load('src/main/services/assistant/prompts.ts')
  const contract = await load('src/main/services/assistant/compact-contract.ts')
  const recent: string[] = []
  const system = prompts.buildSystemPrompt(TOPIC_SWITCH_JOB, []) + facts
  const snap = (window: TimedLine[]) => ({
    meetingId: 1,
    atMs: 0,
    system,
    window,
    recent: [...recent],
  })
  return {
    name: 'old',
    system,
    automatic: (w, t) =>
      requests.automaticAnswerRequest(snap(w), settings, t, { kind: 'question', addressee: 'me' }, [
        t,
      ]),
    // the old Answer now had no focus turn: it answered from the window alone
    answerNow: (w) => requests.answerRequest(snap(w), settings, 'hotkey'),
    remember: (text) => contract.rememberHeadline(recent, text),
    reset: () => {
      recent.length = 0
    },
  }
}

/** Dry runs: a stand-in answer that re-tells the stack-heavy story, so prompt sizes include a
 *  realistic told-stories block. */
function cannedAnswer(i: number): string {
  return i === 0
    ? '**At Acme Corp I led the move to Apollo federation with Node subgraphs.**\nThe invoicing subgraph published to Kafka with idempotent consumers on Postgres.'
    : `**Canned answer ${i}.**\nA supporting line for exchange ${i}.`
}

function wordCount(text: string): number {
  const t = text.replace(/\*\*|[⟨⟩]|```[\s\S]*?```/g, ' ').trim()
  return t ? t.split(/\s+/).length : 0
}

async function ask(req: SuggestionRequest, i: number): Promise<string> {
  if (dry) return cannedAnswer(i)
  return claudeProvider.complete({
    apiKey: req.apiKey,
    workspaceId: req.workspaceId,
    model: req.model,
    system: req.system,
    cacheableContext: req.cacheableContext,
    userContent: req.userContent,
    maxTokens: req.maxTokens,
    effort: req.effort,
    timeoutMs: req.timeoutMs,
    maxRetries: 2,
  })
}

async function runVersion(v: Version, sample: number, rows: Row[]): Promise<void> {
  v.reset()
  const answers = new Map<string, string>()
  for (const [i, ex] of TOPIC_SWITCH_EXCHANGES.entries()) {
    const at = topicSwitchWindow(i)
    const turn = completedTurn(ex.question, at.question.startMs, at.question.endMs)
    const lanes: [Lane, SuggestionRequest][] = [['automatic', v.automatic(at.window, turn)]]
    // Answer now: pressed mid-question when the fixture has a cut-off form, otherwise after
    // Me's first reply line (Me has started answering)
    const now = ex.cutQuestion
      ? (() => {
          const w = at.window.slice(0, -1)
          const q = at.window.at(-1)!
          w.push({ ...q, text: ex.cutQuestion })
          return v.answerNow(w, { text: ex.cutQuestion, startMs: q.tStartMs, open: true })
        })()
      : v.answerNow(topicSwitchWindow(i, 1).window, {
          text: ex.question,
          startMs: at.question.startMs,
          open: false,
        })
    lanes.push(['answer-now', now])
    for (const [lane, req] of lanes) {
      if (env.EVAL_DUMP === '1' && sample === 0) {
        const file = join(dirname(out), 'prompts', `${v.name}-${i}-${lane}.txt`)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, `${req.system}\n\n=== USER ===\n\n${req.userContent}`, 'utf8')
      }
      const answer = await ask(req, i)
      v.remember(answer)
      answers.set(`${lane}-${i}`, answer)
      const ref = ex.refersTo === undefined ? undefined : TOPIC_SWITCH_EXCHANGES[ex.refersTo]
      const referenced = ref
        ? [ref.question, ...ref.reply, answers.get(`${lane}-${ex.refersTo}`) ?? ''].join('\n')
        : undefined
      rows.push(score(v, sample, i, ex, lane, req, answer, referenced))
    }
  }
}

function score(
  v: Version,
  sample: number,
  i: number,
  ex: TopicSwitchExchange,
  lane: Lane,
  req: SuggestionRequest,
  answer: string,
  referenced?: string,
): Row {
  const words = wordCount(answer)
  return {
    version: v.name,
    sample,
    exchange: i,
    lane,
    question: ex.question,
    promptChars: req.userContent.length,
    systemChars: req.system.length + (req.cacheableContext?.length ?? 0),
    answer,
    carried: carriedTerms(answer, ex, { referenced }),
    carriedStrict: carriedTerms(answer, ex, { strict: true, referenced }),
    askedHit: ex.asked.some((t) => answer.toLowerCase().includes(t)),
    words,
    overLength: ex.factual && words > 40,
  }
}

/** Prompt sizes for a LONG meeting (the fixture behind ~9k chars of earlier small talk), where
 *  the old rolling window is full: the typical mid-interview request. No provider calls. */
function longMeetingSizes(versions: Version[]): string[] {
  const filler: TimedLine[] = Array.from({ length: 60 }, (_, k) => {
    const text =
      `${k % 2 ? 'Me' : 'They'} talk about the team, the schedule and the hiring process, part ${k}.`.repeat(
        2,
      )
    const at = -200_000 + k * 3_000
    return { speaker: k % 2 ? -1 : 0, isUser: k % 2 === 1, text, tStartMs: at, tEndMs: at + 2_500 }
  })
  const at = topicSwitchWindow(2)
  const window = [...filler, ...at.window]
  const turn = completedTurn(at.question.text, at.question.startMs, at.question.endMs)
  return versions.map((v) => {
    v.reset()
    for (let i = 0; i < 6; i++) v.remember(cannedAnswer(i))
    const auto = v.automatic(window, turn).userContent.length
    const now = v.answerNow(topicSwitchWindow(2, 1).window, {
      text: at.question.text,
      startMs: at.question.startMs,
      open: false,
    })
    const nowLong = v.answerNow([...filler, ...topicSwitchWindow(2, 1).window], {
      text: at.question.text,
      startMs: at.question.startMs,
      open: false,
    }).userContent.length
    v.reset()
    return `| ${v.name} | ${auto} | ${nowLong} | ${now.system.length} |`
  })
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

function report(rows: Row[], sizes: string[]): string {
  const scored = (v: string) => rows.filter((r) => r.version === v && r.exchange > 0)
  const summary = ['old', 'new'].map((v) => {
    const r = scored(v)
    const avg = (f: (x: Row) => number) =>
      Math.round(r.reduce((s, x) => s + f(x), 0) / Math.max(1, r.length))
    return `| ${v} | ${r.length} | ${r.filter((x) => x.carriedStrict.length).length} | ${r.filter((x) => x.carried.length).length} | ${r.filter((x) => !x.askedHit).length} | ${r.filter((x) => x.overLength).length} | ${avg((x) => x.words)} | ${avg((x) => x.promptChars)} | ${avg((x) => x.systemChars)} |`
  })
  const lines = [
    `# Topic-switch eval (${dry ? 'DRY RUN: prompts only, canned answers' : 'live'})`,
    '',
    `Generated ${new Date().toISOString()}. Old tree: ${env.EVAL_OLD_REF ?? '?'}; new: working tree.`,
    `Models: automatic ${settings.nudgeModel}, Answer now ${settings.answerModel}. Samples per version: ${samples}.`,
    'Fixture: invented (src/main/services/assistant/answer-context/topic-switch-fixture.ts). Exchange 0 seeds the story and is not scored.',
    '',
    '| version | scored answers | carryover (strict) | carryover (corrected) | missed asked term | factual over 40 words | avg words | avg prompt chars | avg system chars |',
    '|---|---|---|---|---|---|---|---|---|',
    ...summary,
    '',
    'Strict carryover also counts a bare employer name (Acme). Corrected counts only earlier-topic technology/story terms and ignores terms from the exchange a question refers back to.',
    '',
    'Pass bar (docs/DECISIONS.md, 2026-11-04 anchoring entry): old shows carryover in at least half its samples; new shows 0 corrected carryovers, factual answers at most 40 words.',
    '',
    '## Prompt size, long meeting (rolling window full; six answers already told)',
    '',
    '| version | automatic user prompt chars | Answer now user prompt chars | system prompt chars (cached) |',
    '|---|---|---|---|',
    ...sizes,
    '',
    '## Side by side',
    '',
  ]
  for (let s = 0; s < samples; s++)
    for (const [i, ex] of TOPIC_SWITCH_EXCHANGES.entries())
      for (const lane of ['automatic', 'answer-now'] as const) {
        const pick = (v: string) =>
          rows.find((r) => r.version === v && r.sample === s && r.exchange === i && r.lane === lane)
        const o = pick('old')
        const n = pick('new')
        if (!o || !n) continue
        const flag = (r: Row) =>
          `${r.carried.length ? `CARRYOVER: ${r.carried.join(', ')}` : r.carriedStrict.length ? `strict-only: ${r.carriedStrict.join(', ')}` : 'no carryover'}; ${r.askedHit ? 'asked term present' : 'MISSED asked term'}; ${r.words} words${r.overLength ? ' (OVER 40)' : ''}; prompt ${r.promptChars} chars`
        lines.push(
          `### Sample ${s + 1}, exchange ${i} (${lane}): ${ex.question}`,
          '',
          '| old | new |',
          '|---|---|',
          `| ${cell(o.answer)} | ${cell(n.answer)} |`,
          `| ${flag(o)} | ${flag(n)} |`,
          '',
        )
      }
  return lines.join('\n')
}

it('topic switch: old vs new answer prompts', async () => {
  if (!env.EVAL_OLD_ROOT)
    throw new Error('EVAL_OLD_ROOT is not set; run scripts/eval/topic-switch.ps1')
  if (!dry && !settings.anthropicApiKey)
    throw new Error('ANTHROPIC_API_KEY is not set (or use -DryRun)')
  const versions = [await oldVersion(resolve(env.EVAL_OLD_ROOT)), newVersion()]
  const rows: Row[] = []
  const sizes = longMeetingSizes(versions)
  for (let s = 0; s < samples; s++) for (const v of versions) await runVersion(v, s, rows)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, report(rows, sizes), 'utf8')
  for (const line of sizes) console.log(`long-meeting sizes ${line}`)
  const tally = (v: string) => rows.filter((r) => r.version === v && r.exchange > 0)
  for (const v of ['old', 'new'])
    console.log(
      `${v}: ${tally(v).length} scored, ${tally(v).filter((r) => r.carriedStrict.length).length} strict / ${tally(v).filter((r) => r.carried.length).length} corrected carryover, ${tally(v).filter((r) => r.overLength).length} factual over 40, avg prompt ${Math.round(tally(v).reduce((a, r) => a + r.promptChars, 0) / Math.max(1, tally(v).length))} chars`,
    )
  console.log(`report: ${out}`)
})
