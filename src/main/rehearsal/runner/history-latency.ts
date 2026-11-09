import { createLatencyFixture } from '../../db/repos/history/latency-fixture'
/** Fixture-only, invoked by trials/history-latency.mjs under Electron's Node ABI. */
import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { runMigrations } from '../../db/migrations'
import { HistoryWorker } from '../../services/history/live/worker-client'
import { freezeEvidence } from '../../services/history/live/session'
import { RehearsalAssistant } from '../outcomes/providers'
import { SuggestionRunner } from '../../services/meetings/assist/suggestion-runner'
import { automaticAnswerRequest } from '../../services/meetings/assist/suggestion-requests'
import type { CompletedTurn } from '../../services/turns/types'

async function canned(evidence: string): Promise<void> {
  const provider = new RehearsalAssistant(() => performance.now())
  provider.slowUntil = performance.now() + 2
  const runner = new SuggestionRunner({
    provider,
    emit: () => {},
    persist: () => 1,
    hold: () => {},
    release: () => {},
    log: () => {},
  })
  const turn: CompletedTurn = {
    id: 1,
    channel: 1,
    speaker: 1,
    role: 'other',
    text: 'What is the fixture budget?',
    startMs: 0,
    endMs: 1000,
    completedAt: performance.now(),
    words: 6,
    fragments: 1,
    reason: 'endpoint',
  }
  const request = automaticAnswerRequest(
    {
      meetingId: 2,
      atMs: 1000,
      system: 'Synthetic job context',
      window: [{ speaker: 1, isUser: false, text: turn.text, tStartMs: 0 }],
      recent: [],
      told: [],
    },
    {
      anthropicApiKey: 'canned-only',
      anthropicWorkspaceId: '',
      nudgeModel: 'claude-sonnet-5-5',
      answerModel: 'claude-opus-5-5',
      classifierModel: 'claude-haiku-5-5',
      whisperMode: 'full',
      nudgeCooldownSec: 0,
      coachWhileTalking: false,
    },
    turn,
    [turn],
    'automatic',
    evidence,
  )
  const handle = runner.start(request)
  if (!handle) throw new Error('Fixture answer was not admitted')
  await handle.done
}

const root = resolve(process.argv[2] ?? '.tmp/history-latency')
mkdirSync(root, { recursive: true })
const percentile = (xs: number[], p: number): number =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0
const stats = (xs: number[]) => ({
  p50: percentile(xs, 0.5),
  p95: percentile(xs, 0.95),
  p99: percentile(xs, 0.99),
})
async function run(): Promise<void> {
  const results: unknown[] = []
  for (const count of [10_000, 100_000, 1_000_000]) {
    const existing = readdirSync(root).find(
      (n) => n.startsWith(`fixture-${count}-`) && n.endsWith('.db'),
    )
    const path = join(root, existing ?? `fixture-${count}-${Date.now()}.db`)
    const db = new Database(path)
    db.pragma('journal_mode = WAL')
    runMigrations(db)
    if (!existing) createLatencyFixture(db, count)
    const worker = new HistoryWorker(path)
    const loop = monitorEventLoopDelay({ resolution: 1 })
    loop.enable()
    const cold: number[] = [],
      warm: number[] = [],
      worst: number[] = [],
      off: number[] = [],
      on: number[] = [],
      waits: number[] = [],
      bookkeeping: number[] = [],
      manualScheduling: number[] = [],
      manualBudget: number[] = []
    let misses = 0,
      hits = 0
    try {
      for (let i = 0; i < 5; i++) {
        await worker.close()
        const t = performance.now()
        await freezeEvidence(
          () => worker.query({ jobId: 1, meetingId: 2, query: 'fixture9321' }),
          10,
        ).ready
        cold.push(performance.now() - t)
        // Let cold startup complete before a useful warm-query trial.
        for (let j = 0; j < 200 && !worker.isReady(); j++)
          await new Promise((r) => setTimeout(r, 10))
      }
      // Explicit readiness and one uncapped fixture warm-up; cold trials above remain separate.
      for (let i = 0; i < 200 && !worker.isReady(); i++) await new Promise((r) => setTimeout(r, 10))
      await worker.query({ jobId: 1, meetingId: 2, query: 'fixture9321' })
      for (let i = 0; i < 60; i++) {
        // Matched canned provider: same 2ms first-readable schedule, no API/cache claim.
        let start = performance.now()
        await canned('')
        off.push(performance.now() - start)
        start = performance.now()
        let queryMs = 0
        const b = performance.now()
        const h = freezeEvidence(
          () => worker.query({ jobId: 1, meetingId: 2, query: `fixture${9321 + i}` }),
          10,
          undefined,
          (e) => {
            queryMs = e.queryMs
          },
        )
        bookkeeping.push(performance.now() - b)
        const text = await h.ready
        waits.push(performance.now() - start)
        if (text) hits++
        else misses++
        if (queryMs) warm.push(queryMs)
        await canned(text)
        on.push(performance.now() - start)
      }
      for (let i = 0; i < 5; i++) {
        const start = performance.now()
        await freezeEvidence(
          () => worker.query({ jobId: 1, meetingId: 2, query: 'common budget' }),
          25,
          undefined,
          (e) => {
            manualScheduling.push(e.schedulingMs)
            manualBudget.push(e.waitMs)
          },
        ).ready
        worst.push(performance.now() - start)
        await new Promise((r) => setTimeout(r, 260))
      }
      const passed =
        hits >= 54 &&
        percentile(waits, 0.95) <= 10 &&
        percentile(waits, 0.99) <= 20 &&
        percentile(bookkeeping, 0.95) <= 2 &&
        percentile(on, 0.95) - percentile(off, 0.95) <= 50
      results.push({
        segments: count,
        passed,
        coldWaitMs: stats(cold),
        warmQueryMs: stats(warm),
        automaticWaitMs: stats(waits),
        manualWorstWaitMs: stats(worst),
        manualBudgetMs: stats(manualBudget),
        manualSchedulingMs: stats(manualScheduling),
        bookkeepingMs: stats(bookkeeping),
        offFirstReadableMs: stats(off),
        onFirstReadableMs: stats(on),
        p95RegressionMs: percentile(on, 0.95) - percentile(off, 0.95),
        hits,
        misses,
        eventLoopP99Ms: loop.percentile(99) / 1e6,
        cacheUsage: 'unknown: canned provider',
        profile: 'full',
        model: 'claude-opus-5-5 (canned)',
      })
      if (!passed) process.exitCode = 1
      console.log(JSON.stringify(results.at(-1)))
    } finally {
      // Avoid terminating Electron's bootstrap while it is still loading a recycled worker.
      for (let i = 0; i < 200 && !worker.isReady(); i++) await new Promise((r) => setTimeout(r, 10))
      loop.disable()
      await worker.close()
      db.close()
    }
  }
  writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2))
}
void run().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
