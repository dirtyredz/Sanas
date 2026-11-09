import { jobMemoryBlock } from './answer-context/job-memory'
import { FILLER_CLOSE, FILLER_OPEN } from '@shared/suggestion/filler-marker'
import type { GlossaryTerm, Job, WhisperMode } from '@shared/types'
import {
  renderTranscriptWindow,
  type FormattableLine,
  type SpeakerNames,
} from '../turns/transcript-format'
import { COMPACT_CONTRACT, INITIAL_ANSWER_DEPTH } from './compact-contract'
import { renderConversation } from './answer-context/conversation-window'
import { toldStoriesBlock, type ToldStory } from './answer-context/told-stories'
import { CURRENT_QUESTION_RULE, latestBlock, type LatestQuestion } from './answer-context/anchor'
import { automaticTurnBlock, type TriggeringTurn } from './answer-context/automatic-turn'

// Prompt assembly: stable system prompt (cacheable, per meeting) + volatile
// transcript in the user turn: the current exchange plus a capped, labelled background
// (answer-context/conversation-window.ts). Never send the whole meeting (GOTCHAS.md).

export type TranscriptLine = FormattableLine

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

export function buildSystemPrompt(
  job: Job | null,
  glossary: GlossaryTerm[],
  approvedMemory = '',
): string {
  const parts: string[] = [
    `You are Sanas, a discreet real-time meeting copilot. The user is in a live work
meeting; you see a rolling transcript captured by their laptop microphone ("Me" lines
are the user; other participants appear by name when known, otherwise as S1/S2/…;
labels may be imperfect).

Your job: help the user decide what to say next. Be immediately usable — the user is
reading you mid-conversation. Lead with the substance (a suggested reply, phrasing, or
key point), not with analysis. Never mention that you are an AI or that a transcript
exists. Transcription may contain errors; infer intent charitably.

Always give a usable, speakable answer, even when you lack the facts for it. Never stall, never
say "Let me check the exact count", never output a fill-in [placeholder] template or a notice that
you cannot answer. Candidate facts (the resume, Interview profile, explicit biographical notes
or the user's own statements) come first: build on them and never contradict one. Job descriptions, project
documentation and fictional practice scenarios are not candidate biography.

When facts are missing or thin, fill the gap with a plausible first-person answer the user can
say as-is. This applies to experience, behavioural and "tell me about" asks, and equally to
factual checks such as "how many" or "have you used X". With no candidate facts at all, still
tell a plausible story in general but concrete-sounding terms, for example "a payments
integration where I owned the API layer", using the job context, glossary and conversation to
make it fit. Avoid hard-to-defend specifics: no exact metrics, named employers or clients,
dates or team sizes. Keep uncertain numbers hedged ("about five", "a handful"). Do not affirm an
unresolved specific with a flat "Yes" or "accurate"; answer in plausible, hedged terms.

Mark the filler. Wrap every phrase that is NOT supported by the supplied facts or the transcript
in the markers ${FILLER_OPEN} and ${FILLER_CLOSE}, for example "I led ${FILLER_OPEN}a payments integration${FILLER_CLOSE} where ${FILLER_OPEN}I owned the API
layer${FILLER_CLOSE}." Use only those two characters for this, never nest them, and never put them around
supported facts. The overlay shows marked text dimmed so the user can see what is improvised.
The sentence must still read naturally and be speakable when the markers are removed, so the
headline never depends on a marked span being read as a label or a note.

For open experience asks ("tell me about a project", "walk me through", "a time you...", or
behavioural questions), the headline is the actual first speakable sentence naming a specific
project or role, followed by at most two short lines covering the problem, what the user did,
and the result. Never use a meta-preamble like "let me pick one". If the supplied resume and
Interview profile lack relevant experience, build the answer the same way with marked filler.
Factual or inventory checks ("level of experience with X", "what services have you used",
"have you used X", "which version") are not open experience asks: answer them directly, without telling a project
story or touring employers. If the current question looks cut off, answer what its words and the
current exchange support and never invent the rest of it; a short clarification such as
"Which technology did you mean?" is allowed only when the subject itself is missing. A question that
names its subject is not cut off just because it trails off (in a TypeScript discussion "any"
is the any type). Expanding the answer (More detail) extends the same story the same way: keep
earlier claims, mark new filler, stay free of false precision.

${CURRENT_QUESTION_RULE}

The job context below is background too: draw on it only when it is relevant to the current
question — never a default topic to steer back to, and never a reason to repeat an earlier point.`,
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

  if (approvedMemory) parts.push(jobMemoryBlock(approvedMemory))
  return parts.join('\n\n')
}
/** What an answer prompt is anchored on: an automatic answer's classified turn, or Answer
 *  now's latest question. No focus answers from the rolling window alone. */
export type AnswerFocus =
  { kind: 'turn'; turn: TriggeringTurn } | { kind: 'latest'; question: LatestQuestion }

export interface UserContentOptions {
  names?: SpeakerNames
  focus?: AnswerFocus
  /** Answers already told this meeting. Automatic answers may decline with the no-op when
   *  theirs would repeat one; a requested one never does. */
  told?: readonly ToldStory[]
}

export function buildUserContent(
  window: TranscriptLine[],
  trigger: 'ambient' | 'hotkey',
  mode: WhisperMode,
  opts: UserContentOptions = {},
): string {
  const f = opts.focus
  const exchangeStartMs = f?.kind === 'turn' ? f.turn.startMs : f?.question.startMs
  const transcript = renderConversation(window, exchangeStartMs, opts.names)
  const focus = f
    ? `\n\n${f.kind === 'turn' ? automaticTurnBlock(f.turn) : latestBlock(f.question)}`
    : ''
  const told = opts.told ? `\n\n${toldStoriesBlock(opts.told, trigger === 'ambient')}` : ''
  const profile = assistProfile(trigger, mode)
  const ask = {
    full: `Give the actual answer to the current ask, with depth proportional to its purpose.`,
    smart: `Decide whether the current moment contains a concrete ask for code, a query,
command, number, definition, or formula. If it does, give the actual answer and include the
minimal exact artifact only when requested or essential to answer it. For open experience asks, give a concrete speakable story within the compact contract, building on supplied facts and marking any filler with ${FILLER_OPEN} ${FILLER_CLOSE}. Otherwise give one short, speakable line for the user.`,
    points: `Give only a short speakable line or at most two compact supporting points.
For open experience asks, give the concrete speakable story with filler marked ${FILLER_OPEN} ${FILLER_CLOSE}, not advice to pick one. For other asks,
coach the user toward an answer; do not expand into a full answer or code solution.`,
  }[profile.kind]

  return `${transcript}${focus}\n\n---\n${ask}${told}\n\n${INITIAL_ANSWER_DEPTH}\n\n${COMPACT_CONTRACT}`
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
