import type { Admission, ManualRequest, MeetingContext } from '@shared/live-controls/types'
import type { AssistSnapshot } from './suggestion-requests'
import { admitManual } from './manual-requests'
import { getMeetingContext } from '../../../db/repos/meeting-context'
import { detailSource, existingDetail } from '../../../db/repos/suggestion-grounding'
import { IPC } from '@shared/ipc'
import { loadSettings } from '../../../config/settings'
import { insertSuggestion } from '../../../db/repos/suggestions'
import { speakerNameMap } from '../../../db/repos/speakers'
import { claudeProvider } from '../../assistant/claude'
import { classifyTurn } from '../../assistant/classifier'
import { rememberHeadline } from '../../assistant/compact-contract'
import type { TranscriptLine } from '../../assistant/prompts'
import type { TurnFinal } from '../../turns/types'
import { broadcast } from '../../../windows/broadcast'
import { isLiveMeeting, liveMeetingId } from '../status/live-meeting'
import { clearPostProcessing, markPostProcessing } from '../status/post-processing'
import { LiveAssistance } from './live-assistance'
import { SuggestionRunner } from './suggestion-runner'
import type { PresentationState } from '@shared/presentation/types'
import { PresentationEvidence } from './presentation-evidence'
import { MeetingPrompts } from './meeting-prompts'

// The live-assist side of the running meeting, assembled in one place: the rolling
// transcript window the prompts read, the headlines already shown (so automatic prompts do
// not repeat them), the job's system prompt, and the SuggestionRunner + LiveAssistance pair
// wired to the provider, the DB and the windows. The meeting orchestrator (../index.ts)
// owns lifecycle, STT and the audio clock; it hands this the identity-resolved finals and
// drives `assistance` with lifecycle calls.

const WINDOW_LINES = 200 // rolling finals kept for prompt assembly

export class LiveSession {
  readonly assistance: LiveAssistance
  private readonly window: TranscriptLine[] = []
  private readonly shownHeadlines: string[] = []
  private readonly runner: SuggestionRunner
  private snapshot: () => AssistSnapshot | null = () => null
  private readonly evidence = new PresentationEvidence()
  private readonly coachHeadlines: string[] = []
  private readonly prompts = new MeetingPrompts()

  /** `clockMs` is the meeting's audio clock, so suggestions line up with the transcript. */
  constructor(
    private readonly clockMs: () => number,
    private readonly presentation: () => PresentationState,
  ) {
    const runner = (this.runner = new SuggestionRunner({
      provider: claudeProvider,
      emit: (event) => broadcast(IPC.SuggestionEvent, event),
      persist: (s) => {
        const id = insertSuggestion(s)
        // a late answer from a meeting that has since ended must not leak into the next one
        if (isLiveMeeting(s.meetingId)) rememberHeadline(this.shownHeadlines, s.text)
        if (isLiveMeeting(s.meetingId) && s.purpose === 'next-point')
          rememberHeadline(this.coachHeadlines, s.text)
        return id
      },
      hold: markPostProcessing,
      release: clearPostProcessing,
      log: (message) => console.warn(`[sanas] ${message}`),
    }))
    this.assistance = new LiveAssistance({
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      settings: loadSettings,
      classify: (req) => classifyTurn(claudeProvider, req),
      runner,
      snapshot: (this.snapshot = () => {
        const meetingId = liveMeetingId()
        if (meetingId === null) return null
        let names: ReadonlyMap<number, string> | undefined
        try {
          names = speakerNameMap(meetingId)
        } catch (e) {
          console.warn('[sanas] could not read speaker names:', e) // labels fall back to S1/S2
        }
        return {
          ...this.prompts.snapshot(),
          meetingId,
          atMs: Math.round(clockMs()),
          window: [...this.window],
          names,
          recent: [...this.shownHeadlines],
          presentation: this.presentation(),
          coachEvidence: this.evidence.snapshot(),
          coachRecent: [...this.coachHeadlines],
        }
      }),
      log: (message) => console.warn(`[sanas] ${message}`),
    })
  }

  /** A new meeting (not a resume): empty window and headlines, the job's prompt, and
   *  assistance started. A resume keeps all of it and only restarts assistance. */
  begin(jobId: number): void {
    this.window.length = 0
    this.shownHeadlines.length = 0
    this.coachHeadlines.length = 0
    this.evidence.reset(0)
    this.assistance.presentationChanged(0)
    this.assistance.start()
    this.prompts.begin(jobId, getMeetingContext(liveMeetingId()!))
    this.presentationChanged(this.clockMs())
    this.assistance.setAnswerEveryQuestion(loadSettings().answerEveryQuestion)
  }

  applyContext(context: MeetingContext): void {
    this.prompts.applyContext(context)
    this.presentationChanged(this.clockMs())
  }

  request(input: ManualRequest): Admission {
    return admitManual(
      {
        canStart: () => this.runner.canStart('hotkey'),
        settings: loadSettings,
        detailSource,
        existingDetail,
        admitted: () => this.assistance.manualAdmitted(),
        start: (request) => this.runner.start(request),
      },
      this.snapshot(),
      input,
    )
  }

  /** One persisted-or-not final: into the prompt window, then to live assistance. */
  final(line: TranscriptLine, turn: TurnFinal): void {
    this.evidence.final(turn)
    this.window.push(line)
    if (this.window.length > WINDOW_LINES) this.window.shift()
    this.assistance.final(turn)
  }

  presentationChanged(atMs: number): void {
    this.evidence.reset(atMs)
    this.coachHeadlines.length = 0
    this.assistance.presentationChanged(atMs)
  }

  /** A voice was (un)pinned as the user: relabel the window so the next prompt agrees, and
   *  drop pending work built on the old identity (old turns stay old). */
  relabel(speaker: number, isUser: boolean): void {
    for (const line of this.window) if (line.speaker === speaker) line.isUser = isUser
    this.assistance.identityChanged()
    this.evidence.identityChanged(this.clockMs())
    this.coachHeadlines.length = 0
  }

  /** What the post-stop summary reads: a copy of the window and the meeting's prompt. */
  closing(): { window: TranscriptLine[]; prompt: string } {
    return { window: [...this.window], prompt: this.prompts.closingPrompt() }
  }
}
