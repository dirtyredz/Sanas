type SanasApi = Window['sanas']
import type { MeetingContext } from '@shared/live-controls/types'

export function mockLiveControls(
  getMeetingId: () => number | null,
  emit: Parameters<SanasApi['assist']['onSuggestion']>[0],
) {
  const contexts = new Map<number, MeetingContext>()
  const changed = new Set<(context: MeetingContext) => void>()
  const compose = new Set<() => void>()
  const toggles = new Set<(state: { meetingId: number | null; enabled: boolean }) => void>()
  let enabled = false,
    seq = 10000
  const get = async (id: number): Promise<MeetingContext> =>
    contexts.get(id) ?? { meetingId: id, revision: 0, text: '' }
  const meetingContext: SanasApi['meetingContext'] = {
    get,
    update: async (input) => {
      const current = await get(input.meetingId)
      if (current.revision !== input.expectedRevision)
        throw new Error('Context changed. Reload before applying.')
      const next = { ...current, text: input.text, revision: current.revision + 1 }
      contexts.set(input.meetingId, next)
      changed.forEach((cb) => cb(next))
      return next
    },
    onChanged: (cb) => {
      changed.add(cb)
      return () => {
        changed.delete(cb)
      }
    },
  }
  const assist: Pick<
    SanasApi['assist'],
    'request' | 'getAnswerEveryQuestion' | 'setAnswerEveryQuestion' | 'onAnswerEveryQuestion'
  > = {
    request: async (input) => {
      const context = await get(input.meetingId),
        id = ++seq
      const event = {
        suggestionId: id,
        meetingId: input.meetingId,
        trigger: 'hotkey' as const,
        purpose: 'answer' as const,
        manualKind:
          input.kind === 'typed' && input.captureToken ? ('capture' as const) : input.kind,
        contextRevision: context.revision,
        groundingContextId: 1,
        ...(input.kind === 'typed' ? { requestText: input.text } : {}),
        ...(input.kind === 'detail' ? { sourceSuggestionId: input.sourceSuggestionId } : {}),
      }
      emit({ ...event, kind: 'start', text: '' })
      emit({
        ...event,
        kind: 'done',
        storedSuggestionId: id,
        text:
          input.kind === 'audience'
            ? 'Where could you apply this approach?'
            : '**Preview answer**\n\nThis is a local preview of the live controls.\n\nDetail paragraphs remain visible.\n\nUse your meeting context for a grounded answer.',
      })
      return { accepted: true }
    },
    getAnswerEveryQuestion: async () => ({ meetingId: getMeetingId(), enabled }),
    setAnswerEveryQuestion: async (_id, value) => {
      enabled = value
      toggles.forEach((cb) => cb({ meetingId: getMeetingId(), enabled }))
    },
    onAnswerEveryQuestion: (cb) => {
      toggles.add(cb)
      return () => {
        toggles.delete(cb)
      }
    },
  }
  const overlay = {
    activateComposer: async () => {
      compose.forEach((cb) => cb())
    },
    composerReady: async () => {},
    releaseFocus: async () => {},
    onCompose: (cb: () => void) => {
      compose.add(cb)
      return () => {
        compose.delete(cb)
      }
    },
  }
  return {
    meetingContext,
    assist,
    overlay,
    reset: (id: number, value: boolean, contextText = '') => {
      contexts.set(id, { meetingId: id, revision: 0, text: contextText })
      enabled = value
    },
  }
}
