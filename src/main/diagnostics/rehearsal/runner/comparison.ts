import { RehearsalAssistant } from '../outcomes/providers'
import {
  automaticAnswerRequest,
  type AssistSettings,
} from '../../../services/meetings/assist/suggestion/suggestion-requests'
import { buildSystemPrompt } from '../../../services/assistant/prompts'
import { SuggestionRunner } from '../../../services/meetings/assist/suggestion/suggestion-runner'
import { observeLatency } from '../../../services/meetings/assist/latency/latency'
import type { CompletedTurn } from '../../../services/turns/types'

export const comparisonQuestions = [
  { category: 'factual', text: 'Which database did you use for the delivery service?' },
  { category: 'behavioural', text: 'Tell me about a time you resolved a team disagreement.' },
  {
    category: 'code',
    text: 'Implement a linked list reversal in TypeScript and explain its complexity.',
  },
  { category: 'room', text: 'How should we as a team reduce the delivery risk?' },
] as const

export function comparisonPlan(repeats = 3) {
  if (!Number.isInteger(repeats) || repeats < 3 || repeats > 10)
    throw new Error('Repeats must be 3..10')
  return Array.from({ length: repeats }, (_, repeat) =>
    comparisonQuestions.flatMap((question, q) =>
      ((repeat + q) % 2 ? ['smart', 'full'] : ['full', 'smart']).map((profile) => ({
        ...question,
        repeat: repeat + 1,
        profile: profile as 'full' | 'smart',
        cacheIntent: repeat === 0 ? 'cold-first-pass' : 'warm-repeat',
      })),
    ),
  ).flat()
}

/** Same production builder/runner and rehearsal provider seam, without Electron or a
 *  profile write. This isolates model/profile behavior; it does not benchmark STT. */
export async function compareProfiles(options: { realProvider?: boolean; repeats?: number } = {}) {
  const plan = comparisonPlan(options.repeats)
  if (options.realProvider && !process.env.ANTHROPIC_API_KEY)
    throw new Error('Real provider requires ANTHROPIC_API_KEY')
  const real = options.realProvider
    ? (await import('../../../services/assistant/provider/claude')).claudeProvider
    : undefined
  const provider = new RehearsalAssistant(() => performance.now(), real)
  const settings: AssistSettings = {
    anthropicApiKey: options.realProvider ? process.env.ANTHROPIC_API_KEY! : 'canned-only',
    anthropicWorkspaceId: options.realProvider ? (process.env.ANTHROPIC_WORKSPACE_ID ?? '') : '',
    nudgeModel: 'claude-sonnet-5-5',
    answerModel: 'claude-opus-5-5',
    classifierModel: 'claude-haiku-5-5',
    whisperMode: 'full',
    nudgeCooldownSec: 0,
    coachWhileTalking: false,
  }
  const evidence = observeLatency()
  let stored = 0
  const runner = new SuggestionRunner({
    provider,
    emit: () => {},
    persist: () => ++stored,
    hold: () => {},
    release: () => {},
    log: () => {},
  })
  const samples: object[] = []
  try {
    for (const entry of plan) {
      const turn: CompletedTurn = {
        id: samples.length + 1,
        channel: 1,
        speaker: 1,
        role: 'other',
        text: entry.text,
        startMs: 0,
        endMs: 1000,
        words: entry.text.split(' ').length,
        fragments: 1,
        completedAt: performance.now(),
        reason: 'endpoint',
      }
      const request = automaticAnswerRequest(
        {
          meetingId: 1,
          atMs: 1000,
          system: buildSystemPrompt(null, []),
          window: [{ speaker: 1, isUser: false, text: entry.text, tStartMs: 0 }],
          recent: [],
          told: [],
          meetingText:
            'Fixture facts: I built a delivery service using PostgreSQL and TypeScript. I resolved a design/backend disagreement by testing both proposals. The team owns staged rollout and rollback.',
        },
        { ...settings, whisperMode: entry.profile },
        turn,
        [turn],
      )
      const run = runner.start(request)
      if (!run) throw new Error('Comparison run was not admitted')
      const outcome = await run.done
      const timing = evidence.tracker.records().find((r) => r.kind === 'run' && r.runId === run.id)
      samples.push({
        category: entry.category,
        repeat: entry.repeat,
        profile: entry.profile,
        cacheIntent: entry.cacheIntent,
        cacheObserved: timing?.usage ? (timing.usage.cacheReadCount ? 'hit' : 'no-hit') : 'unknown',
        outcome,
        timing,
      })
    }
    return {
      assistant: options.realProvider ? 'claude' : 'canned',
      repeats: options.repeats ?? 3,
      samples,
    }
  } finally {
    evidence.stop()
  }
}
