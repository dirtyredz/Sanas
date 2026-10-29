import type { Meeting } from '@shared/types'
import { loadSettings } from '../../../config/settings'
import { getMeeting, updateMeetingSummary } from '../../../db/repos/meetings'
import { listSegments } from '../../../db/repos/segments'
import { getJob, listGlossary } from '../../../db/repos/jobs'
import { speakerNameMap } from '../../../db/repos/speakers'
import { whilePostProcessing } from '../status/post-processing'
import { claudeProvider } from '../../assistant/claude'
import {
  buildSummaryPrompt,
  buildSystemPrompt,
  summaryMaxTokens,
  type TranscriptLine,
} from '../../assistant/prompts'
import { splitSummaryOutput } from './summary-output'

// Post-meeting summary + action items. Two entry points share one Claude call:
// the fire-and-forget pass on stop (live transcript window, no DB round-trip)
// and the on-demand pass from the meeting view (stored transcript, capped by SUMMARY_CHARS).

const MIN_LINES = 5 // fewer than this isn't worth a call
const SUMMARY_TIMEOUT_MS = 300_000

/** Runs the summary prompt over `lines` and stores the result on the meeting.
 *  Resolves true when a summary was written; false when skipped (too short / no key). */
export async function summarizeLines(
  meetingId: number,
  lines: TranscriptLine[],
  systemPrompt: string,
): Promise<boolean> {
  if (lines.length < MIN_LINES) return false
  const { anthropicApiKey, anthropicWorkspaceId, answerModel } = loadSettings()
  if (!anthropicApiKey) return false

  const names = speakerNameMap(meetingId)
  const text = await claudeProvider.complete({
    apiKey: anthropicApiKey,
    workspaceId: anthropicWorkspaceId || undefined,
    model: answerModel,
    system: systemPrompt,
    userContent: buildSummaryPrompt(lines, names),
    maxTokens: summaryMaxTokens(lines, names),
    effort: 'medium',
    // generous: a long meeting's detailed summary is a large one-shot call
    timeoutMs: SUMMARY_TIMEOUT_MS,
    // no onDelta — one-shot; persisted when done
  })
  const { summary, actions } = splitSummaryOutput(text)
  updateMeetingSummary(meetingId, summary, actions)
  return true
}

/** On-demand (re)summary from the persisted transcript. Throws with a readable
 *  message when it can't run so the UI can show why. */
export async function summarizeStoredMeeting(meetingId: number): Promise<Meeting> {
  const meeting = getMeeting(meetingId)
  if (!meeting) throw new Error('Meeting not found.')
  const lines = listSegments(meetingId).map((s): TranscriptLine => ({
    speaker: s.speaker,
    isUser: s.isUser,
    text: s.text,
  }))
  if (lines.length < MIN_LINES) {
    throw new Error(`Transcript too short to summarize (${lines.length} lines).`)
  }
  if (!loadSettings().anthropicApiKey) throw new Error('Anthropic API key is not set.')
  // same job context the live meeting would have had, rebuilt from the DB
  const systemPrompt = buildSystemPrompt(getJob(meeting.jobId), listGlossary(meeting.jobId))
  // marked while it runs: merge must not fold a meeting whose summary is still coming
  await whilePostProcessing(meetingId, () => summarizeLines(meetingId, lines, systemPrompt))
  return getMeeting(meetingId) ?? meeting
}
