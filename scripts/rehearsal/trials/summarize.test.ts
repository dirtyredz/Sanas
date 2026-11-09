import { expect, it } from 'vitest'
import {
  distribution,
  isDeliveredAutomatic,
} from '../../../src/main/services/meetings/assist/latency-summary'
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
