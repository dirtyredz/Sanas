import { build } from 'esbuild'
import { mkdir, rm } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../../', import.meta.url))

let rules
/** The in-app latency rules (delivered rule, rounded median, stage lists), bundled from
 *  src/main/services/meetings/assist/latency-summary.ts so this report cannot drift from it. */
export async function loadLatencyRules() {
  if (rules) return rules
  const folder = resolve(root, '.tmp/owner-runs')
  await mkdir(folder, { recursive: true })
  const bundle = resolve(folder, `latency-rules-${process.pid}.mjs`)
  await build({
    entryPoints: [resolve(root, 'src/main/services/meetings/assist/latency-summary.ts')],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    tsconfig: resolve(root, 'tsconfig.node.json'),
  })
  try {
    rules = await import(pathToFileURL(bundle).href)
  } finally {
    await rm(bundle, { force: true })
  }
  return rules
}

export async function summarizeLogs(text) {
  const { distribution, isDeliveredAutomatic, tally, STAGE_FIELDS, ASSEMBLY_FIELDS } =
    await loadLatencyRules()
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
  const delivered = runs.filter(isDeliveredAutomatic)
  return {
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
      STAGE_FIELDS.map((key) => [
        key,
        {
          ...distribution(delivered.map((r) => r[key])),
          missing: delivered.filter((r) => !Number.isFinite(r[key])).length,
        },
      ]),
    ),
    assembly: Object.fromEntries(
      ASSEMBLY_FIELDS.map((key) => [
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dryRun = process.argv.includes('--dry-run')
  const folder = process.argv.slice(2).find((a) => !a.startsWith('--'))
  if (!folder) throw new Error('Provide a directory containing copied app .log files')
  const names = readdirSync(folder).filter((name) => /\.log(?:\.\d+)?$/.test(name))
  if (dryRun) {
    console.log(`Dry run: would summarize ${names.length} log file(s) in ${folder}; read nothing.`)
  } else {
    const text = names.map((name) => readFileSync(resolve(folder, name), 'utf8')).join('\n')
    const summary = await summarizeLogs(text)
    console.log(JSON.stringify(summary, null, 2))
    if (!summary.records || summary.malformed) process.exitCode = 1
  }
}
