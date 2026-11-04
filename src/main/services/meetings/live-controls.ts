import type {
  Admission,
  ContextUpdate,
  ManualRequest,
  MeetingContext,
} from '@shared/live-controls/types'
import { IPC } from '@shared/ipc'
import { getMeetingContext, saveMeetingContext } from '../../db/repos/meeting/meeting-context'
import { broadcast } from '../../windows/broadcast'
import type { LiveSession } from './assist/live-session'
import type { CaptureRequests } from './assist/capture-requests'
import { applyContext } from './context/session'
import { isLiveMeeting, liveMeetingId } from './status/live-meeting'

interface LiveControlsDeps {
  serialize<T>(fn: () => Promise<T>): Promise<T>
  clockMs(): number
  live: LiveSession
  captures: Pick<CaptureRequests<unknown>, 'sendWithDraft'>
}

/** Thin facade for controls that act on the running meeting without owning its lifecycle. */
export function createLiveControls(deps: LiveControlsDeps): {
  updateMeetingContext(update: ContextUpdate): Promise<MeetingContext>
  requestAssist(input: ManualRequest): Promise<Admission>
  answerEveryQuestionState(): { meetingId: number | null; enabled: boolean }
  setAnswerEveryQuestion(meetingId: number, enabled: boolean): Promise<void>
} {
  const answerEveryQuestionState = (): { meetingId: number | null; enabled: boolean } => ({
    meetingId: liveMeetingId(),
    enabled: deps.live.assistance.answerEveryQuestionEnabled(),
  })

  return {
    updateMeetingContext: (update) =>
      deps.serialize(async () => {
        if (!isLiveMeeting(update.meetingId)) throw new Error('This meeting is no longer active.')
        return applyContext(
          getMeetingContext(update.meetingId),
          update,
          Math.round(deps.clockMs()),
          saveMeetingContext,
          (next) => {
            deps.live.applyContext(next)
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
  }
}
