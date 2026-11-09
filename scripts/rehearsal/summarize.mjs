import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const stages = [
  'classifierMs',
  'closeToClassifierStartMs',
  'closeToClassifierEndMs',
  'closeToRequestMs',
  'runToProviderRequestMs',
  'providerRequestToFirstProtocolMs',
  'providerRequestToFirstTextMs',
  'requestToFirstTextMs',
  'closeToPromotionMs',
  'requestToFirstReadableMs',
  'closeToFirstReadableMs',
  'lastFinalToFirstReadableMs',
]
export function distribution(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  const n = v.length
  return {
    n,
    median: n ? (v[Math.floor((n - 1) / 2)] + v[Math.floor(n / 2)]) / 2 : null,
    p90: n ? v[Math.ceil(n * 0.9) - 1] : null,
  }
}
export function summarizeLogs(text) {
  const records = []
  let malformed = 0
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/\[sanas\] latency (\{.*\})/)
    if (!match) continue
    try {
      records.push(JSON.parse(match[1]))
    } catch {
      malformed++
    }
  }
  const runs = records.filter((r) => r.kind === 'run')
  const delivered = runs.filter((r) => r.outcome === 'done' && r.classification === 'applies')
  const tally = (values) =>
    Object.fromEntries([...new Set(values)].map((v) => [v, values.filter((x) => x === v).length]))
  const result = {
    records: records.length,
    malformed,
    runs: runs.length,
    candidates: new Set(
      records
        .filter((r) => r.candidateId !== undefined)
        .map((r) => `${r.sessionId ?? 'legacy'}:${r.candidateId}`),
    ).size,
    classifiedAttempts: new Set(
      records
        .filter((r) => r.attemptId !== undefined)
        .map((r) => `${r.sessionId ?? 'legacy'}:${r.attemptId}`),
    ).size,
    terminalCandidates: records.filter((r) => r.candidateTerminal).length,
    legacyCorrelationWarning: records.some((r) => !r.sessionId),
    deliveredAutomatic: delivered.length,
    missingCandidate: runs.filter(
      (r) => r.classification === 'applies' && r.candidateId === undefined,
    ).length,
    outcomes: tally(runs.map((r) => `${r.path ?? 'unknown'}:${r.outcome ?? 'unknown'}`)),
    profiles: tally(
      delivered.map(
        (r) => `${r.effective?.profile ?? 'unknown'}:${r.effective?.model ?? 'unknown'}`,
      ),
    ),
    verdictPaths: tally(delivered.map((r) => `${r.verdict ?? 'unknown'}:${r.path ?? 'unknown'}`)),
    terminalReasons: tally(records.filter((r) => r.turnedDown).map((r) => r.turnedDown)),
    discards: tally(
      runs.filter((r) => r.outcome === 'discarded').map((r) => r.discard ?? 'unknown'),
    ),
    mismatchCategories: tally(runs.flatMap((r) => r.mismatchCategories ?? [])),
    missingUsage: runs.filter((r) => !r.usage).length,
    firstTextToReadableMs: distribution(
      delivered.map((r) =>
        Number.isFinite(r.requestToFirstReadableMs) && Number.isFinite(r.requestToFirstTextMs)
          ? r.requestToFirstReadableMs - r.requestToFirstTextMs
          : undefined,
      ),
    ),
    stages: Object.fromEntries(
      stages.map((key) => [
        key,
        {
          ...distribution(delivered.map((r) => r[key])),
          missing: delivered.filter((r) => !Number.isFinite(r[key])).length,
        },
      ]),
    ),
    assembly: Object.fromEntries(
      [
        'lastFinalToCloseMs',
        'boundaryToCloseMs',
        'timerLatenessMs',
        'ingressToAssemblyMs',
        'audioCursorGapMs',
      ].map((key) => [
        key === 'audioCursorGapMs' ? 'audioCursorGapMs_PROXY' : key,
        distribution(delivered.map((r) => r.assembly?.[key])),
      ]),
    ),
    rendererStates: tally(records.filter((r) => r.kind === 'visibility').map((r) => r.visibility)),
    broadcastToRendererReceiptMs: distribution(
      records
        .filter((r) => r.kind === 'visibility' && r.visibility === 'frame-after-commit')
        .map((r) => r.broadcastToRendererReceiptMs),
    ),
  }
  return result
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const folder = process.argv[2]
  if (!folder) throw new Error('Provide a directory containing copied app .log files')
  const text = readdirSync(folder)
    .filter((name) => /\.log(?:\.\d+)?$/.test(name))
    .map((name) => readFileSync(resolve(folder, name), 'utf8'))
    .join('\n')
  const summary = summarizeLogs(text)
  console.log(JSON.stringify(summary, null, 2))
  if (!summary.records || summary.malformed) process.exitCode = 1
}
