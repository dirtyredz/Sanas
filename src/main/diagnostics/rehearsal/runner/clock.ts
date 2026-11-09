import { audioFrame, type readPcmWav } from '../audio/wav'
import type { Scenario } from '../scenario/scenario'
import type { Evidence } from '../scenario/assertions'
import type { ScriptedSttProvider, RehearsalAssistant } from '../outcomes/providers'
import type { installSocketFaults } from '../audio/socket-fault'
import type { StepExecutor } from './steps'
import { SyntheticCapture } from '../audio/synthetic-capture'
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
export async function pumpClock({
  scenario,
  wav,
  now,
  tier,
  stt,
  sockets,
  model,
  evidence,
  executor,
}: {
  scenario: Scenario
  wav?: ReturnType<typeof readPcmWav>
  now(): number
  tier: string
  stt: ScriptedSttProvider
  sockets?: ReturnType<typeof installSocketFaults>
  model: RehearsalAssistant
  evidence: Evidence[]
  executor: StepExecutor
}) {
  const capture = new SyntheticCapture()
  const tasks: Promise<void>[] = []
  try {
    let lastReconnect = 0,
      lastSocketOpen = sockets?.opened() ?? 0
    const execute = executor.execute
    let stepIndex = 0,
      audioMs = 0
    const duration = Math.max(scenario.durationMs, wav ? wav.pcm.length / (32 * wav.channels) : 0)
    const taskErrors: string[] = []
    while (now() <= duration) {
      const clock = now()
      while (stepIndex < scenario.steps.length && scenario.steps[stepIndex].atMs <= clock) {
        const step = scenario.steps[stepIndex++]
        tasks.push(
          model
            .withAction(step.id, () => execute(step))
            .catch(() => {
              taskErrors.push(step.id)
            }),
        )
      }
      while (audioMs + 20 <= clock) {
        capture.push(audioFrame(wav, audioMs, clock < executor.silentUntil), wav?.channels ?? 2)
        audioMs += 20
      }
      if (tier === 'scripted') stt.tick(clock)
      if (stt.reconnects > lastReconnect || (sockets?.opened() ?? 0) > lastSocketOpen) {
        evidence.push({ kind: 'reconnect', atMs: clock })
        lastReconnect = stt.reconnects
        lastSocketOpen = sockets?.opened() ?? 0
      }
      await sleep(10)
    }
    // Include the last partial frame; a WAV shorter than the scenario is zero-padded.
    while (audioMs < duration) {
      capture.push(audioFrame(wav, audioMs, now() < executor.silentUntil), wav?.channels ?? 2)
      audioMs += 20
    }
    stt.tick(duration)
    while (stepIndex < scenario.steps.length) {
      const step = scenario.steps[stepIndex++]
      tasks.push(
        model
          .withAction(step.id, () => execute(step))
          .catch(() => {
            taskErrors.push(step.id)
          }),
      )
    }
    await Promise.all(tasks)

    return taskErrors
  } finally {
    capture.stop()
  }
}
