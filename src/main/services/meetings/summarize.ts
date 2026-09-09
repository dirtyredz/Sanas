import type { Meeting } from '@shared/types'
import { loadSettings } from '../../config/settings'
import { getMeeting, updateMeetingSummary } from '../../db/repos/meetings'
import { listSegments } from '../../db/repos/segments'
import { getJob, listGlossary } from '../../db/repos/jobs'
import { claudeProvider } from '../assistant/claude'
import { buildSummaryPrompt, buildSystemPrompt, type TranscriptLine } from '../assistant/prompts'

// Post-meeting summary + action items. Two entry points share one Claude call:
// the fire-and-forget pass on stop (live transcript window, no DB round-trip)
// and the on-demand pass from the meeting view (full stored transcript).

const MIN_LINES = 5 // fewer than this isn't worth a call

function splitSections(text: string): { summary: string; actions: string } {
  const idx = text.indexOf('ACTION ITEMS')
  const summary = (idx >= 0 ? text.slice(0, idx) : text).replace(/^SUMMARY\s*/i, '').trim()
  const actions = idx >= 0 ? text.slice(idx + 'ACTION ITEMS'.length).trim() : ''
  return { summary, actions }
}

/** Runs the summary prompt over `lines` and stores the result on the meeting.
 *  Resolves true when a summary was written; false when skipped (too short / no key). */
export async function summarizeLines(
  meetingId: number,
  lines: TranscriptLine[],
  systemPrompt: string,
): Promise<boolean> {
  if (lines.length < MIN_LINES) return false
  const { anthropicApiKey, anthropicWorkspaceId } = loadSettings()
  if (!anthropicApiKey) return false

  const text = await claudeProvider.complete({
    apiKey: anthropicApiKey,
    workspaceId: anthropicWorkspaceId || undefined,
    system: systemPrompt,
    userContent: buildSummaryPrompt(lines),
    maxTokens: 1500,
    effort: 'medium',
    // no onDelta — one-shot; persisted when done
  })
  const { summary, actions } = splitSections(text)
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
  await summarizeLines(meetingId, lines, systemPrompt)
  return getMeeting(meetingId) ?? meeting
}
