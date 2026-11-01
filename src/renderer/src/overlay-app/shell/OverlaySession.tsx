import { usePresentationState } from '../../lib/meeting/usePresentationState'
import { useTranscript } from '../../lib/meeting/useTranscript'
import { useCaptureStatus } from '../capture/useCaptureStatus'
import { useOverlaySettings } from '../layout/useOverlaySettings'
import { useManualRequests } from '../suggestions/useManualRequests'
import { useOverlaySuggestions } from '../suggestions/useOverlaySuggestions'
import { useOverlayComposer } from '../workspaces/composer/useOverlayComposer'
import { useAnswerEveryQuestion } from './AnswerEveryQuestion'
import { useComposerActivation } from './navigation/useComposerActivation'
import { useOverlayNavigation } from './navigation/useOverlayNavigation'
import { OverlayShell } from './OverlayShell'
import { useOverlayWindowState } from './useOverlayWindowState'

export type OverlaySessionModel = ReturnType<typeof useOverlaySessionModel>

/** Every overlay controller, composed once and kept mounted for the window's lifetime. Views
 *  below receive these models as props and own no subscriptions or request policy. */
function useOverlaySessionModel() {
  const { lines, state } = useTranscript()
  const meetingId = state.meetingId
  const active = state.status === 'live' || state.status === 'paused'
  const presentation = usePresentationState(meetingId)
  const settings = useOverlaySettings()
  const windowState = useOverlayWindowState()
  const navigation = useOverlayNavigation(meetingId)
  const suggestions = useOverlaySuggestions(meetingId)
  const manual = useManualRequests(
    meetingId,
    suggestions.items,
    suggestions.selected,
    suggestions.select,
  )
  const composer = useOverlayComposer(meetingId, suggestions.requestedInFlight || manual.pending)
  const capture = useCaptureStatus(meetingId, suggestions.requestedInFlight)
  const answerEveryQuestion = useAnswerEveryQuestion(meetingId)
  useComposerActivation(navigation.openAsk, composer.inputRef, navigation.workspace === 'ask')
  return {
    meeting: state,
    meetingId,
    active,
    lines,
    presentation,
    settings,
    windowState,
    navigation,
    suggestions,
    manual,
    composer,
    capture,
    answerEveryQuestion,
  }
}

export function OverlaySession(): React.JSX.Element {
  return <OverlayShell session={useOverlaySessionModel()} />
}
