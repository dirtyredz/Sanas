import { expect, it } from 'vitest'
import {
  distribution,
  isDeliveredAutomatic,
} from '../../../src/main/services/meetings/assist/latency/latency-summary'
// @ts-expect-error standalone Node tool has no declaration file
import { summarizeLogs } from './summarize.mjs'

it('uses the in-app rules: whole-ms median, nearest-rank p90, missing stages never zero', async () => {
  expect(distribution([1, 2, 3, 4, undefined])).toEqual({ n: 4, median: 3, p90: 4 })
  const text = [
    { kind: 'run', classification: 'applies', outcome: 'done', requestToFirstTextMs: 100 },
    { kind: 'run', classification: 'applies', outcome: 'discarded', requestToFirstTextMs: 9999 },
    { kind: 'run', classification: 'applies', outcome: 'done' },
  ]
    .map((r) => `[sanas] latency ${JSON.stringify(r)}`)
    .join('\n')
  expect(await summarizeLogs(text)).toMatchObject({
    runs: 3,
    deliveredAutomatic: 2,
    stages: { requestToFirstTextMs: { n: 1, median: 100, p90: 100, missing: 1 } },
  })
})

it('the trial report and the in-app summary share one delivered rule', async () => {
  expect(isDeliveredAutomatic({ kind: 'run', classification: 'applies', outcome: 'done' })).toBe(
    true,
  )
  expect(isDeliveredAutomatic({ kind: 'run', classification: 'n/a', outcome: 'done' })).toBe(false)
  expect(isDeliveredAutomatic({ kind: 'candidate', classification: 'applies' })).toBe(false)
  const text = `[sanas] latency ${JSON.stringify({ kind: 'run', classification: 'n/a', outcome: 'done' })}`
  expect(await summarizeLogs(text)).toMatchObject({ deliveredAutomatic: 0 })
})

it('prints calibrated bounds beside final receipt and separates delivered missing from failed/discarded', async () => {
  const records = [
    {
      kind: 'run',
      classification: 'applies',
      outcome: 'done',
      captureTiming: 'valid',
      captureIntervalWidthMs: 250,
      questionEndToFirstReadableLowerMs: 1500,
      questionEndToFirstReadableUpperMs: 1750,
      lastFinalToFirstReadableMs: 900,
    },
    {
      kind: 'run',
      classification: 'applies',
      outcome: 'done',
      captureTiming: 'unavailable',
      captureTimingReason: 'reset',
    },
    {
      kind: 'run',
      classification: 'applies',
      outcome: 'error',
      captureTiming: 'valid',
      questionEndToFirstReadableLowerMs: 9999,
    },
    {
      kind: 'run',
      classification: 'applies',
      outcome: 'discarded',
      captureTiming: 'valid',
      questionEndToFirstReadableLowerMs: 9999,
    },
  ]
  const result = await summarizeLogs(
    records.map((r) => '[sanas] latency ' + JSON.stringify(r)).join('\n'),
  )
  expect(result.captureTiming).toEqual({
    delivered: 2,
    valid: 1,
    unavailable: 1,
    reasons: { reset: 1 },
  })
  expect(result.stages.questionEndToFirstReadableLowerMs).toEqual({
    n: 1,
    median: 1500,
    p90: 1500,
    missing: 1,
  })
  expect(result.stages.questionEndToFirstReadableUpperMs.median).toBe(1750)
  expect(result.stages.lastFinalToFirstReadableMs.median).toBe(900)
})
