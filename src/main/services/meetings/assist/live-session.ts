import { getDb } from '../../../db'
import { getMeeting } from '../../../db/repos/meeting/meetings'
import { listGlossary } from '../../../db/repos/job/glossary'
import { getJob } from '../../../db/repos/jobs'
import { historyWorker } from '../../history/live/worker-client'
import { liveQuery } from '../../history/live/policy'
import { freezeEvidence } from '../../history/live/session'
import type { Admission, MeetingContext } from '@shared/live-controls/types'
import type { AssistSnapshot } from './suggestion-requests'
import { admitManual, type AssistInput } from './manual-requests'
import { getMeetingContext } from '../../../db/repos/meeting/meeting-context'
import { detailSource, existingDetail } from '../../../db/repos/suggestion-grounding'
import { IPC } from '@shared/ipc'
import { loadSettings } from '../../../config/settings'
import { insertSuggestion } from '../../../db/repos/suggestions'
import { speakerNameMap } from '../../../db/repos/speakers'
import { assistantProvider } from '../../assistant/provider'
import { classifyTurn } from '../../assistant/classifier'
import { ShownLedger } from '../../assistant/answer-context/shown-ledger'
import type { TranscriptLine } from '../../assistant/prompts'
import type { TurnFinal } from '../../turns/types'
import { broadcast } from '../../../windows/broadcast'
import { isLiveMeeting, liveMeetingId } from '../status/live-meeting'
import { clearPostProcessing, markPostProcessing } from '../status/post-processing'
import { LiveAssistance } from './live-assistance'
import { SuggestionRunner } from './suggestion-runner'
import { MeetingPrompts } from './meeting-prompts'
import { observeLatency } from './latency'

// The live-assist side of the running meeting, assembled in one place: the rolling
// transcript window the prompts read, the headlines and stories already shown (so prompts do
// not repeat them), the job's system prompt, and the SuggestionRunner + LiveAssistance pair
// wired to the provider, the DB and the windows. The meeting orchestrator (../index.ts)
// owns lifecycle, STT and the audio clock; it hands this the identity-resolved finals and
// drives `assistance` with lifecycle calls. Stage timing (./latency.ts) goes to the main
// log as one redacted line per finished answer or rejected candidate.

const WINDOW_LINES = 200 // rolling finals kept for prompt assembly

export class LiveSession {
  readonly assistance: LiveAssistance
  private readonly window: TranscriptLine[] = []
  private readonly shown = new ShownLedger()
  private readonly runner: SuggestionRunner
  private snapshot: () => AssistSnapshot | null = () => null
  private readonly prompts = new MeetingPrompts()
  private historyScope: { meetingId: number; jobId: number; terms: string[] } | null = null

  /** `clockMs` is the meeting's audio clock, so suggestions line up with the transcript. */
  constructor(
    private readonly clockMs: () => number,
    availabilityChanged?: () => void,
  ) {
    const runner = (this.runner = new SuggestionRunner({
      provider: assistantProvider,
      emit: (event) => broadcast(IPC.SuggestionEvent, event),
      persist: (s) => {
        const id = insertSuggestion(s)
        // a late answer from a meeting that has since ended must not leak into the next one
        if (isLiveMeeting(s.meetingId)) this.shown.record(s)
        return id
      },
      hold: markPostProcessing,
      release: clearPostProcessing,
      log: (message) => console.warn(`[sanas] ${message}`),
      now: () => performance.now(),
    }))
    observeLatency((record) => console.warn(`[sanas] latency ${JSON.stringify(record)}`))
    this.assistance = new LiveAssistance({
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      settings: loadSettings,
      retrieve: (meetingId, text, automatic, signal, candidateId) => {
        const scope = this.historyScope
        if (!scope || scope.meetingId !== meetingId) return null
        const query = liveQuery(text, automatic, scope.terms)
        if (!query) return null
        return freezeEvidence(
          () => historyWorker(getDb().name).query({ meetingId, jobId: scope.jobId, query }),
          automatic ? 10 : 25,
          signal,
          (e) =>
            console.warn(
              '[sanas] retrieval',
              JSON.stringify({ meetingId, candidateId, automatic, ...e }),
            ),
        )
      },
      availabilityChanged,
      classify: (req) => classifyTurn(assistantProvider, req),
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
          ...this.shown.snapshot(),
        }
      }),
      log: (message) => console.warn(`[sanas] ${message}`),
    })
  }

  /** A new meeting (not a resume): empty window and headlines, the job's prompt, and
   *  assistance started. A resume keeps all of it and only restarts assistance. */
  begin(jobId: number): void {
    this.historyScope = null
    if (getJob(jobId)?.name !== 'Unsorted' && !getMeeting(liveMeetingId()!)?.practice) {
      this.historyScope = {
        meetingId: liveMeetingId()!,
        jobId,
        terms: listGlossary(jobId)
          .slice(0, 100)
          .map((t) => t.term.slice(0, 100)),
      }
      historyWorker(getDb().name).start()
    }
    this.window.length = 0
    this.shown.reset()
    this.assistance.contextChanged(0)
    this.assistance.start()
    this.prompts.begin(jobId, getMeetingContext(liveMeetingId()!))
    this.assistance.setAnswerEveryQuestion(loadSettings().answerEveryQuestion)
  }

  /** An applied context revision: new grounding for later requests, and coaching restarts
   *  so a next point built on the old context is never shown. Started answers keep theirs. */
  applyContext(context: MeetingContext): void {
    this.prompts.applyContext(context)
    this.assistance.contextChanged(this.clockMs())
  }

  /** True while no requested answer holds the hotkey lane (checked before a capture). */
  canRequest(): boolean {
    return this.runner.canStart('hotkey')
  }

  request(input: AssistInput): Admission {
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
    this.window.push(line)
    if (this.window.length > WINDOW_LINES) this.window.shift()
    this.assistance.final(turn)
  }

  /** A voice was (un)pinned as the user: relabel the window so the next prompt agrees, and
   *  drop pending work built on the old identity (old turns stay old). */
  relabel(speaker: number, isUser: boolean): void {
    for (const line of this.window) if (line.speaker === speaker) line.isUser = isUser
    this.assistance.identityChanged()
  }

  /** What the post-stop summary reads: a copy of the window and the meeting's prompt. */
  closing(): { window: TranscriptLine[]; prompt: string } {
    return { window: [...this.window], prompt: this.prompts.closingPrompt() }
  }
}
