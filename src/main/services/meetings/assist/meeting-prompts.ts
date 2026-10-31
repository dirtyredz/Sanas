import type { MeetingContext } from '@shared/live-controls/types'
import { getJob, listGlossary } from '../../../db/repos/jobs'
import { saveGrounding } from '../../../db/repos/suggestion-grounding'
import { buildSystemPrompt } from '../../assistant/prompts'
import { deckContext } from '../../assistant/presentation/prompts'

/** Prompt and immutable-grounding state resolved once for each meeting context revision. */
export class MeetingPrompts {
  private ordinaryPrompt = ''
  private presentationPrompt = ''
  private system = ''
  private coachSystem = ''
  private cacheableContext = ''
  private groundingContextId: number | undefined
  private context: MeetingContext | null = null

  begin(jobId: number, context: MeetingContext): void {
    const job = getJob(jobId)
    const glossary = listGlossary(jobId)
    this.ordinaryPrompt = buildSystemPrompt(job, glossary)
    this.presentationPrompt = buildSystemPrompt(job ? { ...job, talkingPoints: '' } : job, glossary)
    this.applyContext(context)
  }

  applyContext(context: MeetingContext): void {
    this.context = context
    this.system = this.coachSystem = context.slides.length
      ? this.presentationPrompt
      : this.ordinaryPrompt
    this.cacheableContext = deckContext(context.slides)
    this.groundingContextId = saveGrounding(
      context.meetingId,
      context.deckVersion,
      this.system,
      this.cacheableContext,
    )
  }

  snapshot(): {
    system: string
    coachSystem: string
    cacheableContext: string
    groundingContextId?: number
    contextRevision?: number
    meetingText?: string
  } {
    return {
      system: this.system,
      coachSystem: this.coachSystem,
      cacheableContext: this.cacheableContext,
      groundingContextId: this.groundingContextId,
      contextRevision: this.context?.revision,
      meetingText: this.context?.text,
    }
  }

  closingPrompt(): string {
    return this.coachSystem
  }
}
