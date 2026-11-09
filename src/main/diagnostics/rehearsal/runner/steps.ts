import type { Step } from '../scenario/scenario'
import type { Evidence } from '../scenario/assertions'
import type { ScriptedSttProvider, RehearsalAssistant } from '../outcomes/providers'
import type { RehearsalScreens } from '../screens/fixture-display'
import type { installSocketFaults } from '../audio/socket-fault'
import * as meetings from '../../../services/meetings'
import { listSuggestions } from '../../../db/repos/suggestion/suggestions'
export function createStepExecutor({
  meetingId,
  tier,
  stt,
  model,
  screens,
  sockets,
  evidence,
  now,
}: {
  meetingId: number
  tier: string
  stt: ScriptedSttProvider
  model: RehearsalAssistant
  screens: RehearsalScreens
  sockets?: ReturnType<typeof installSocketFaults>
  evidence: Evidence[]
  now(): number
}) {
  const starts = new Map<string, number>()
  let silentUntil = -1
  const admissions: { stepId: string; atMs: number; accepted: boolean; reason?: string }[] = []
  const admission = (stepId: string, result: { accepted: boolean; reason?: string }): void => {
    admissions.push({ stepId, atMs: now(), accepted: result.accepted, reason: result.reason })
    if (!result.accepted && result.reason === 'busy') evidence.push({ kind: 'busy', atMs: now() })
  }
  const execute = async (step: Step): Promise<void> => {
    starts.set(step.id, now())
    switch (step.kind) {
      case 'utterance':
        if (tier === 'scripted') stt.utterance(step)
        break
      case 'ask':
        admission(
          step.id,
          await meetings.requestAssist({ meetingId, kind: 'typed', text: step.text }),
        )
        break
      case 'detail': {
        const source = listSuggestions(meetingId)
          .filter(
            (s) => s.purpose === 'answer' && !['detail', 'audience'].includes(s.manualKind ?? ''),
          )
          .at(-1)
        if (!source) throw new Error('More detail has no completed source')
        admission(
          step.id,
          await meetings.requestAssist({
            meetingId,
            kind: 'detail',
            sourceSuggestionId: source.id,
          }),
        )
        break
      }
      case 'answer-mode':
        await meetings.setAnswerEveryQuestion(meetingId, step.enabled)
        break
      case 'screen': {
        await screens.prepare(step)
        const draft = step.text ? await meetings.attachScreen(meetingId) : undefined
        if (draft && !draft.ok) throw new Error('Screen attachment failed')
        const result = draft?.ok
          ? await meetings.requestAssist({
              meetingId,
              kind: 'typed',
              text: step.text!,
              captureToken: draft.draft.token,
            })
          : await meetings.captureScreen(meetingId)
        admission(step.id, result)
        if (!result.accepted)
          evidence.push({
            kind: 'capture-error',
            atMs: now(),
            text: meetings.captureStatus().message,
          })
        break
      }
      case 'fault':
        if (step.fault === 'socket-drop') {
          if (sockets) sockets.drop()
          else stt.drop(now(), step.durationMs)
        } else if (step.fault === 'silent-them') silentUntil = now() + step.durationMs
        else if (step.fault === 'assistant-slow') model.slowUntil = now() + step.durationMs
        else if (step.fault === 'assistant-fail') model.failUntil = now() + step.durationMs
        else screens.inject(step.fault, step.durationMs)
        break
    }
  }

  return {
    execute,
    starts,
    admissions,
    get silentUntil() {
      return silentUntil
    },
  }
}
export type StepExecutor = ReturnType<typeof createStepExecutor>
