import { expect, it } from 'vitest'
// @ts-expect-error standalone Node tool has no declaration file
import { distribution, summarizeLogs } from './summarize.mjs'

it('uses median and nearest-rank p90, never treating missing stages as zero', () => {
  expect(distribution([1, 2, 3, 4, undefined])).toEqual({ n: 4, median: 2.5, p90: 4 })
  const text = [
    { kind: 'run', classification: 'applies', outcome: 'done', requestToFirstTextMs: 100 },
    { kind: 'run', classification: 'applies', outcome: 'discarded', requestToFirstTextMs: 9999 },
    { kind: 'run', classification: 'applies', outcome: 'done' },
  ]
    .map((r) => `[sanas] latency ${JSON.stringify(r)}`)
    .join('\n')
  expect(summarizeLogs(text)).toMatchObject({
    runs: 3,
    deliveredAutomatic: 2,
    stages: { requestToFirstTextMs: { n: 1, median: 100, p90: 100, missing: 1 } },
  })
})
