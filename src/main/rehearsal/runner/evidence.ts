import { IPC } from '../../../shared/ipc'
import type { SuggestionEvent, TranscriptEvent, MeetingState } from '../../../shared/types'
import type { Evidence } from '../scenario/assertions'
import type { Scenario } from '../scenario/scenario'
import type { RehearsalAssistant } from '../outcomes/providers'
import { turnSteps } from '../outcomes/outcomes'
import { observeRehearsalAssistance } from '../../services/meetings/assist/diagnostics'
import { observeRehearsalBroadcast } from '../../windows/broadcast'
export function collectEvidence(scenario: Scenario, model: RehearsalAssistant, now: () => number) {
  const evidence: Evidence[] = []
  const finalReceipts = new Map<string, number>()
  const turnCompletions = new Map<string, number>()
  const transitions: {
    atMs: number
    event: string
    stepIds: string[]
    turnId?: number
    reason?: string
    suggestionId?: number
  }[] = []
  observeRehearsalAssistance((e) => {
    const stepIds = e.turn ? turnSteps(scenario.steps, [e.turn]) : []
    if (e.event === 'turn-completed') for (const id of stepIds) turnCompletions.set(id, now())
    transitions.push({
      atMs: now(),
      event: e.event,
      turnId: e.turn?.id,
      stepIds,
      reason: e.reason,
      suggestionId: e.suggestionId,
    })
  })
  const finals: TranscriptEvent[] = []
  let interimCount = 0
  observeRehearsalBroadcast((channel, payload) => {
    if (channel === IPC.SuggestionEvent) {
      const e = payload as SuggestionEvent
      const request = model.requests.find((r) => r.suggestionId === e.suggestionId)
      if (request && e.kind === 'delta' && e.text) request.firstVisibleMs ??= now()
      if (request && e.kind === 'done') {
        request.deliveredMs = now()
        request.firstVisibleMs ??= now()
      }
      if (e.kind === 'done')
        evidence.push({
          kind: e.purpose === 'next-point' ? 'coach' : 'suggestion',
          atMs: now(),
          text: e.text,
          requestId: request?.id,
        })
      if (e.kind === 'error') evidence.push({ kind: 'assistant-error', atMs: now() })
    }
    if (channel === IPC.TranscriptEvent) {
      const e = payload as TranscriptEvent
      if (e.isFinal) {
        finals.push(e)
        if (!e.isUser)
          for (const id of turnSteps(scenario.steps, [{ startMs: e.tStartMs, endMs: e.tEndMs }]))
            finalReceipts.set(id, now())
      } else interimCount++
    }
    if (channel === IPC.MeetingState && (payload as MeetingState).captureWarning)
      evidence.push({ kind: 'capture-warning', atMs: now() })
  })

  return {
    evidence,
    finals,
    finalReceipts,
    turnCompletions,
    transitions,
    get interimCount() {
      return interimCount
    },
    close() {
      observeRehearsalBroadcast(undefined)
      observeRehearsalAssistance(undefined)
    },
  }
}
export type CollectedEvidence = ReturnType<typeof collectEvidence>
