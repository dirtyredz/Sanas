import type { GlossaryTerm, Job, WhisperMode } from '@shared/types'
import {
  renderTranscriptWindow,
  type FormattableLine,
  type SpeakerNames,
} from '../transcript-format'
import { COMPACT_CONTRACT, NO_SUGGESTION, recentSuggestionsBlock } from './compact-contract'
import { boundedExcerpt } from './excerpt'
import type { ResponseKind } from './classifier'

// Prompt assembly: stable system prompt (cacheable, per meeting) + volatile
// transcript window in the user turn. Never send the whole meeting (GOTCHAS.md).

export type TranscriptLine = FormattableLine

export const WINDOW_CHARS = 6000 // ~recent few minutes of conversation
const TURN_CHARS = 4000 // the triggering turn, opening + ending kept
export const SUMMARY_CHARS = 120_000 // enough for a long technical meeting, while still bounded
const MIN_SUMMARY_TOKENS = 1500
const MAX_SUMMARY_TOKENS = 8000

export interface AssistProfile {
  kind: 'points' | 'smart' | 'full'
  maxTokens: number
  effort: 'low' | 'medium'
  useAnswerModel: boolean
}

/** Hotkey answers are unconditionally full. Ambient requests follow the saved mode. */
export function assistProfile(trigger: 'ambient' | 'hotkey', mode: WhisperMode): AssistProfile {
  if (trigger === 'hotkey' || mode === 'full') {
    return { kind: 'full', maxTokens: 1200, effort: 'medium', useAnswerModel: true }
  }
  if (mode === 'points') {
    return { kind: 'points', maxTokens: 220, effort: 'low', useAnswerModel: false }
  }
  return { kind: 'smart', maxTokens: 500, effort: 'low', useAnswerModel: false }
}

export function buildSystemPrompt(job: Job | null, glossary: GlossaryTerm[]): string {
  const parts: string[] = [
    `You are Sanas, a discreet real-time meeting copilot. The user is in a live work
meeting; you see a rolling transcript captured by their laptop microphone ("Me" lines
are the user; other participants appear by name when known, otherwise as S1/S2/…;
labels may be imperfect).

Your job: help the user decide what to say next. Be immediately usable — the user is
reading you mid-conversation. Lead with the substance (a suggested reply, phrasing, or
key point), not with analysis. Never mention that you are an AI or that a transcript
exists. Transcription may contain errors; infer intent charitably.

Follow the conversation's CURRENT topic. The job context below is background to draw on
only when it is relevant to what is being discussed right now — never a default topic to
steer back to, and never a reason to repeat an earlier point.`,
  ]

  if (job) {
    const sections: [string, string][] = [
      ['Company info', job.companyInfo],
      ['Project scope', job.projectScope],
      ['Notes', job.notes],
      ['Talking points (raise only when the current topic makes them relevant)', job.talkingPoints],
      ['Persona — how the user wants to come across', job.persona],
    ]
    const pack = sections
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `## ${k}\n${v.trim()}`)
      .join('\n\n')
    if (pack) parts.push(`# Job context: ${job.name}\n\n${pack}`)
  }

  if (glossary.length > 0) {
    parts.push(
      `# Glossary\n${glossary.map((g) => `- ${g.term}${g.note ? `: ${g.note}` : ''}`).join('\n')}`,
    )
  }

  return parts.join('\n\n')
}

/** The completed turn an automatic answer responds to, so generation answers THAT turn
 *  rather than whichever line happens to be the latest in the window. */
export interface TriggeringTurn {
  /** Display label of the speaker ("Sarah", "S2", "?"). */
  speaker: string
  text: string
  kind: ResponseKind
  /** Who it was put to: Me specifically, or the room (an open floor). */
  addressee: 'me' | 'room' | 'other'
}

export interface UserContentOptions {
  names?: SpeakerNames
  /** Automatic answers: the turn being answered. */
  turn?: TriggeringTurn
  /** Automatic answers: headlines already shown this meeting. Its presence also enables the
   *  no-op output — an automatic answer may decline; a requested one never does. */
  recent?: readonly string[]
}

function focusBlock(turn: TriggeringTurn): string {
  const who =
    turn.addressee === 'room'
      ? `It was put to the room, not to Me specifically. Only suggest something if there is a
genuinely useful, non-repeated contribution or question for Me to raise; otherwise output
exactly ${NO_SUGGESTION}.`
      : turn.addressee === 'other'
        ? 'It was put to another participant. The owner has enabled answering every question; provide an answer for the owner’s reference.'
        : 'It was put to Me.'
  return `Respond to this completed turn (a ${turn.kind}):
${turn.speaker}: ${boundedExcerpt(turn.text, TURN_CHARS)}
Answer THAT turn, about the topic being discussed now. ${who}`
}

export function buildUserContent(
  window: TranscriptLine[],
  trigger: 'ambient' | 'hotkey',
  mode: WhisperMode,
  opts: UserContentOptions = {},
): string {
  const transcript = renderTranscriptWindow(window, WINDOW_CHARS, opts.names)
  const focus = opts.turn ? `\n\n${focusBlock(opts.turn)}` : ''
  const recent = opts.recent ? `\n\n${recentSuggestionsBlock(opts.recent)}` : ''
  const profile = assistProfile(trigger, mode)
  const ask = {
    full: `Give the actual answer to the current ask. Be complete enough to use immediately.
If code, a query, command, formula, or other exact artifact is useful, include it.`,
    smart: `Decide whether the current moment contains a concrete ask for code, a query,
command, number, definition, or formula. If it does, give the actual answer and include the
minimal exact artifact when useful. Otherwise give one short, speakable line for the user.`,
    points: `Give only a short speakable line or at most two compact supporting points.
Coach the user toward an answer; do not expand into a full answer or code solution.`,
  }[profile.kind]

  return `Rolling transcript (most recent last):\n\n${transcript}${focus}\n\n---\n${ask}${recent}\n\n${COMPACT_CONTRACT}`
}

/** Ask-your-history: answers come from excerpts only, with citations. */
export const HISTORY_SYSTEM = `You answer questions about the user's past work meetings from transcript
excerpts. Use only the excerpts. If they do not contain the answer, say what is missing rather
than guessing. Be specific — who said what, and when. Cite each claim with the meeting title and
date in square brackets, e.g. [Northwind weekly sync, 2026-09-08]. Excerpts are speech-to-text and
may contain errors; "Me" is the user. Answer in a few short paragraphs or a list, no preamble.`

export function buildHistoryPrompt(question: string, excerpts: string): string {
  return `Question: ${question}\n\nExcerpts (most relevant meeting first; [m:ss] is time into the meeting):\n\n${excerpts}`
}

/** Post-meeting summary prompt — all prompt text lives here, not in the orchestrator. */
export function buildSummaryPrompt(
  window: TranscriptLine[],
  names?: SpeakerNames,
  recordedTranscript?: string,
): string {
  const transcript = recordedTranscript ?? renderTranscriptWindow(window, SUMMARY_CHARS, names)
  return `The meeting just ended. Here is the transcript ("Me" = the user; other speakers are
named when known, otherwise S1/S2/…). Refer to people by name where the transcript does:

${transcript}

Extract durable knowledge the user can rely on weeks later. Do not merely recap the sequence of
conversation. Never invent or fill gaps from general knowledge. Mark uncertainty explicitly, and
put anything doubted, contradicted, or left to verify under **Open questions / unverified**. Preserve
technical tokens exactly as spoken: commands, branch and target names, endpoints, headers, IDs,
numbers, dates, and tool names must not be normalized or paraphrased.

The amount of detail must scale with the transcript: keep a short meeting short, but make a long,
technical meeting as detailed as needed to retain its useful knowledge. Use standalone statements,
not "S1 said..." narration; attribute a statement only when who said it affects its meaning or
reliability.

Write exactly this outer format so the result can be stored in two database columns:

SUMMARY
<a Markdown knowledge extract using the applicable sections below, in this order; omit any section
that would be empty>

Allowed summary sections and content:
- **Overview** — 2-3 sentences stating the meeting's purpose and outcome.
- **Decisions** — what was decided, and why when the transcript states a reason.
- **What we learned** — facts, how systems or processes work, constraints, gotchas, and reasons
  given. Write these as durable standalone knowledge.
- **Specifics** — exact commands, branch/target names, endpoints, headers, IDs, numbers, dates,
  and tools. Put every exact technical token in inline code formatting.
- **Open questions / unverified** — doubts, contradictions, and anything left to check.
- **People & roles** — who is who, only when the transcript makes it learnable.

Format each included section label as a bold line exactly like **Overview**. Use short paragraphs
or "- " bullets beneath it. Do not use other headings or fenced code blocks.

ACTION ITEMS
<bulleted list of concrete follow-ups, each starting with "- ". Include owner (if known), task, and
due date (if stated). Leave this section empty when there are no action items.>`
}

/** A ceiling, not a target: short meetings stay concise while long transcripts have room to retain
 *  substantially more knowledge. The provider receives this as Anthropic's integer max_tokens. */
export function summaryMaxTokens(window: TranscriptLine[], names?: SpeakerNames): number {
  const transcriptChars = renderTranscriptWindow(window, SUMMARY_CHARS, names).length
  return Math.min(MAX_SUMMARY_TOKENS, Math.max(MIN_SUMMARY_TOKENS, Math.ceil(transcriptChars / 15)))
}
