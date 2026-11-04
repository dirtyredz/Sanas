import { readFileSync, writeFileSync } from 'node:fs'
import { readPcmWav } from '../audio/wav'
import { evaluate } from '../scenario/assertions'
import { imageDigest } from '../outcomes/outcomes'
import type { RehearsalOptions } from './options'
import type { CollectedEvidence } from './evidence'
import type { StepExecutor } from './steps'
import type { RehearsalAssistant } from '../outcomes/providers'
import type { RehearsalScreens } from '../screens/fixture-display'
import * as meetings from '../../services/meetings'
import { isPostProcessing } from '../../services/meetings/status/post-processing'
import { listSegments } from '../../db/repos/segments'
import { getMeeting } from '../../db/repos/meeting/meetings'
import { sleep } from './clock'
export async function finishReport({
  options,
  collected,
  executor,
  model,
  screens,
  meetingId,
  now,
  batchCount,
  taskErrors,
}: {
  options: RehearsalOptions
  collected: CollectedEvidence
  executor: StepExecutor
  model: RehearsalAssistant
  screens: RehearsalScreens
  meetingId: number
  now(): number
  batchCount(): number
  taskErrors: string[]
}) {
  const { scenario, tier, assistant, wav } = options
  const { evidence, finals, interimCount, finalReceipts, turnCompletions } = collected
  const { starts } = executor
  // Check live storage BEFORE batch replacement can hide an interim-persistence defect.
  const liveRows = listSegments(meetingId)
  const storedLines = liveRows
    .map((r) => JSON.stringify([r.tStartMs, r.tEndMs, r.text, r.speaker, r.isUser]))
    .sort()
  const finalLines = finals
    .map((r) => JSON.stringify([r.tStartMs, r.tEndMs, r.text, r.speaker, r.isUser]))
    .sort()
  evidence.push({
    kind: 'no-interims',
    atMs: now(),
    passed:
      (tier === 'audio' || interimCount > 0) &&
      storedLines.length === finalLines.length &&
      storedLines.every((r, i) => r === finalLines[i]),
  })
  const stoppedMs = now()
  for (const request of model.requests) request.pendingAtStop = request.status === 'pending'
  await meetings.stopMeeting()
  const deadline = performance.now() + (assistant === 'claude' || tier === 'audio' ? 330000 : 10000)
  while (isPostProcessing(meetingId) && performance.now() < deadline) await sleep(20)
  if (isPostProcessing(meetingId)) throw new Error('Post-processing deadline exceeded')
  const saved = getMeeting(meetingId)
  evidence.push({
    kind: 'summary',
    atMs: now(),
    text: saved?.summary ?? '',
    passed: !!saved?.summary,
  })
  if (saved?.audioPath) {
    const recorded = readPcmWav(readFileSync(saved.audioPath))
    evidence.push({
      kind: 'recording',
      atMs: now(),
      passed: recorded.pcm.length > 0 && recorded.channels === (wav?.channels ?? 2),
    })
  }
  evidence.push({
    kind: 'batch',
    atMs: now(),
    passed: batchCount() > 0 && listSegments(meetingId).length === batchCount(),
  })
  for (const capture of screens.captures) {
    const delivered = model.requests.find(
      (r) =>
        r.imageDigest === imageDigest(capture.base64) &&
        r.atMs >= capture.atMs &&
        r.deliveredMs !== undefined,
    )
    if (delivered)
      evidence.push({
        kind: 'screen',
        atMs: delivered.deliveredMs!,
        text: delivered.answer,
        passed: capture.verified,
        requestId: delivered.id,
      })
  }
  for (const r of model.requests)
    if (r.purpose !== 'classifier' && r.purpose !== 'summary')
      evidence.push({ kind: 'request', atMs: r.atMs, requestId: r.id })
  // Meeting-context delivery: expose each answer / next-point request's outgoing content so a
  // 'context' / 'context-coach' expectation can assert its `contains` token reached the model.
  for (const r of model.requests) {
    const kind =
      r.purpose === 'answer' ? 'context' : r.purpose === 'next-point' ? 'context-coach' : undefined
    if (kind) evidence.push({ kind, atMs: r.atMs, text: model.contents.get(r.id), requestId: r.id })
  }
  const checks = evaluate(
    scenario,
    evidence,
    starts,
    assistant,
    model.requests,
    finalReceipts,
    turnCompletions,
  )
  for (const id of taskErrors)
    checks.push({
      id,
      kind: 'step',
      passed: false,
      reason: 'Step failed; inspect isolated run artifacts',
    })

  return { version: 1, passed: checks.every((c) => c.passed), checks, stoppedMs }
}
export function writeReport(path: string, report: object): void {
  writeFileSync(path, JSON.stringify(report, null, 2))
}
