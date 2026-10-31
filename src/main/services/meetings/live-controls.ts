import type {
  Admission,
  ContextUpdate,
  ManualRequest,
  MeetingContext,
} from '@shared/live-controls/types'
import { IPC } from '@shared/ipc'
import type { PresentationState } from '@shared/presentation/types'
import { getMeetingContext, saveMeetingContext } from '../../db/repos/meeting-context'
import { broadcast } from '../../windows/broadcast'
import type { LiveSession } from './assist/live-session'
import type { CaptureRequests } from './assist/capture-requests'
import { applyContext } from './context/session'
import type { PresentationSession } from './presentation/session'
import { isLiveMeeting, liveMeetingId } from './status/live-meeting'

interface LiveControlsDeps {
  serialize<T>(fn: () => Promise<T>): Promise<T>
  clockMs(): number
  live: LiveSession
  captures: Pick<CaptureRequests<unknown>, 'sendWithDraft'>
  presentation: PresentationSession
}

/** Thin facade for controls that act on the running meeting without owning its lifecycle. */
export function createLiveControls(deps: LiveControlsDeps): {
  updateMeetingContext(update: ContextUpdate): Promise<MeetingContext>
  requestAssist(input: ManualRequest): Promise<Admission>
  answerEveryQuestionState(): { meetingId: number | null; enabled: boolean }
  setAnswerEveryQuestion(meetingId: number, enabled: boolean): Promise<void>
  presentationState(): PresentationState
  moveSlide(meetingId: number, direction: 'prev' | 'next'): Promise<PresentationState>
  moveSlideShortcut(direction: 'prev' | 'next'): Promise<void>
} {
  const answerEveryQuestionState = (): { meetingId: number | null; enabled: boolean } => ({
    meetingId: liveMeetingId(),
    enabled: deps.live.assistance.answerEveryQuestionEnabled(),
  })

  const moveSlide = (meetingId: number, direction: 'prev' | 'next'): Promise<PresentationState> =>
    deps.serialize(async () => {
      if (liveMeetingId() !== meetingId) throw new Error('This meeting is no longer active.')
      return deps.presentation.move(meetingId, direction, deps.clockMs())
    })

  return {
    updateMeetingContext: (update) =>
      deps.serialize(async () => {
        if (!isLiveMeeting(update.meetingId)) throw new Error('This meeting is no longer active.')
        return applyContext(
          getMeetingContext(update.meetingId),
          update,
          deps.presentation.state(),
          Math.round(deps.clockMs()),
          saveMeetingContext,
          (next, event) => {
            deps.live.applyContext(next)
            if (event) deps.presentation.apply(next.slides, event)
            broadcast(IPC.MeetingContextChanged, next)
          },
        )
      }),
    requestAssist: (input) =>
      deps.serialize(async () => {
        if (!isLiveMeeting(input.meetingId)) throw new Error('This meeting is no longer active.')
        // a typed question with an attached screen sends the main-owned draft, never text alone
        if (input.kind === 'typed' && input.captureToken)
          return deps.captures.sendWithDraft(input, input.captureToken)
        return deps.live.request(input)
      }),
    answerEveryQuestionState,
    setAnswerEveryQuestion: (meetingId, enabled) =>
      deps.serialize(async () => {
        if (!isLiveMeeting(meetingId)) throw new Error('This meeting is no longer active.')
        deps.live.assistance.setAnswerEveryQuestion(enabled)
        broadcast(IPC.AnswerEveryQuestionChanged, answerEveryQuestionState())
      }),
    presentationState: () => deps.presentation.state(),
    moveSlide,
    moveSlideShortcut: async (direction) => {
      const state = deps.presentation.state()
      if (state.meetingId === null || !state.current) return
      try {
        await moveSlide(state.meetingId, direction)
      } catch (e) {
        broadcast(IPC.PresentationChanged, {
          ...deps.presentation.state(),
          error: e instanceof Error ? e.message : String(e),
        })
      }
    },
  }
}
