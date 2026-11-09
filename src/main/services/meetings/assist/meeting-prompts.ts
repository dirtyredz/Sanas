import { buildCoverageCatalog } from '../../assistant/coach/coverage/catalog'
import { getApprovedMemory, ordinaryJob } from '../../../db/repos/job/memory/approved'
import { getMeetingGrounding } from '../../../db/repos/meeting/meeting-grounding'
import { meetingCandidateFacts } from '../context/grounding/meeting-facts'
import type { MeetingContext } from '@shared/live-controls/types'
import { getJob } from '../../../db/repos/job/jobs'
import { listGlossary } from '../../../db/repos/job/glossary'
import { saveMeetingGrounding } from '../../../db/repos/suggestion/suggestion-grounding'
import { buildSystemPrompt } from '../../assistant/prompts/prompts'

/** The meeting's prompt state: one system prompt (persona, job context and talking points,
 *  glossary, candidate facts) frozen at Start with its immutable grounding row, plus the
 *  current meeting-context revision that requests carry in their user content. */
export class MeetingPrompts {
  coverageCatalog = buildCoverageCatalog(null)
  private system = ''
  private groundingContextId: number | undefined
  private context: MeetingContext | null = null

  begin(jobId: number, context: MeetingContext): void {
    const job = getJob(jobId)
    this.coverageCatalog = buildCoverageCatalog(job)
    const glossary = listGlossary(jobId)
    const grounding = getMeetingGrounding(context.meetingId)
    const facts = grounding.hasBiography
      ? meetingCandidateFacts(grounding)
      : '\n\nNo resume or interview profile is attached to this meeting. Use any explicitly supplied candidate biography; otherwise answer with plausible, marked filler and do not treat job or practice context as biography.'
    this.system =
      buildSystemPrompt(job, glossary, ordinaryJob(jobId) ? getApprovedMemory(jobId).text : '') +
      facts
    this.groundingContextId = saveMeetingGrounding(context.meetingId, this.system)
    this.context = context
  }

  applyContext(context: MeetingContext): void {
    this.context = context
  }

  snapshot(): {
    system: string
    groundingContextId?: number
    contextRevision?: number
    meetingText?: string
  } {
    return {
      system: this.system,
      groundingContextId: this.groundingContextId,
      contextRevision: this.context?.revision,
      meetingText: this.context?.text,
    }
  }

  closingPrompt(): string {
    return this.system
  }
}
