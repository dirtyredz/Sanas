import type { JudgementField } from '@shared/jobs/applications'
import { JOB_CONTEXT_MAX_CHARS } from '@shared/jobs/limits'
import { loadSettings } from '../../../config/settings'
import { assistantProvider } from '../../assistant/provider'
import type { AssistantProvider } from '../../assistant/types'

// Draft-at-import: when a pack leaves a judgement field (company info, talking points,
// persona, glossary) empty, Sanas drafts it once, through the AssistantProvider seam, from
// the verified notes and job details only. The resume is never sent: its extra claims must
// not leak into job context. A failure leaves the field empty with a readable reason and
// never blocks creating the job; the user can edit every draft before it is saved.

export interface DraftInput {
  company: string
  role: string
  projectScope: string
  notes: string
  companyInfo: string
}

export interface DraftResult {
  text: Partial<Record<Exclude<JudgementField, 'glossary'>, string>>
  glossary: string[] | null
  errors: Partial<Record<JudgementField, string>>
  notice: string | null
}

const DRAFT_TIMEOUT_MS = 60_000
const DRAFT_MAX_TOKENS = 2_500
const DRAFT_GLOSSARY_MAX = 60

const INSTRUCTIONS: Record<JudgementField, string> = {
  companyInfo:
    '"companyInfo": 2–5 sentences about the target company and team, using only COMPANY, ROLE and PROJECT SCOPE. "" if they say nothing about the company.',
  talkingPoints:
    '"talkingPoints": 3–6 lines, each starting "- ", naming verified experience from NOTES worth steering toward for this role. Use only what NOTES state.',
  persona:
    '"persona": 1–3 sentences on how the candidate should come across for this role (tone, seniority, focus), consistent with NOTES.',
  glossary:
    '"glossary": an array of up to 40 terms (technologies, products, acronyms, proper nouns) that appear verbatim in NOTES, PROJECT SCOPE or COMPANY INFO.',
}

export const DRAFT_GROUNDING_RULE =
  'Use ONLY facts stated in NOTES (and, to describe the target company or role, the job details given). Never invent employers, dates, numbers, technologies, titles or achievements, and never use or assume a resume. If NOTES do not support something, leave it out.'

const block = (tag: string, value: string): string =>
  `<${tag}>\n${value.replaceAll(`</${tag}`, `<\\/${tag}`)}\n</${tag}>`

/** The system and user text for one draft request (exported for the grounding test). */
export function buildDraftPrompt(
  missing: readonly JudgementField[],
  input: DraftInput,
): { system: string; userContent: string } {
  const system = [
    'You draft job context for a private interview copilot.',
    DRAFT_GROUNDING_RULE,
    'Reply with one JSON object and nothing else, with exactly these keys:',
    ...missing.map((key) => INSTRUCTIONS[key]),
  ].join('\n')
  const userContent = [
    block('company', input.company),
    block('role', input.role),
    block('project_scope', input.projectScope),
    block('company_info', input.companyInfo),
    block('notes', input.notes),
  ].join('\n\n')
  return { system, userContent }
}

// eslint-disable-next-line no-control-regex
const DISALLOWED = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const clean = (s: string): string => s.replace(/\r\n?/g, '\n').replace(DISALLOWED, '').trim()

function parseDraft(text: string, missing: readonly JudgementField[]): Omit<DraftResult, 'notice'> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('the reply was not JSON')
  const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  const out: Omit<DraftResult, 'notice'> = { text: {}, glossary: null, errors: {} }
  for (const key of missing) {
    const value = raw[key]
    if (key === 'glossary') {
      const terms = Array.isArray(value)
        ? value
            .filter((t): t is string => typeof t === 'string')
            .map(clean)
            .filter(Boolean)
        : []
      if (terms.length) out.glossary = terms.slice(0, DRAFT_GLOSSARY_MAX)
      else out.errors.glossary = 'Sanas found no terms to suggest.'
      continue
    }
    const draft = typeof value === 'string' ? clean(value).slice(0, JOB_CONTEXT_MAX_CHARS) : ''
    if (draft) out.text[key] = draft
    else out.errors[key] = 'Sanas had nothing grounded to draft here.'
  }
  return out
}

export async function draftJudgementFields(
  missing: readonly JudgementField[],
  input: DraftInput,
  provider: AssistantProvider = assistantProvider,
  settings: () => {
    anthropicApiKey: string
    anthropicWorkspaceId: string
    answerModel: string
  } = loadSettings,
): Promise<DraftResult> {
  if (!missing.length) return { text: {}, glossary: null, errors: {}, notice: null }
  const failAll = (why: string): DraftResult => ({
    text: {},
    glossary: null,
    errors: Object.fromEntries(missing.map((k) => [k, why])),
    notice: `Sanas could not draft the empty fields (${why}). Fill them in, or leave them empty.`,
  })
  if (!input.notes.trim() && !input.projectScope.trim())
    return failAll('the pack has no notes or project scope to draft from')
  const { anthropicApiKey, anthropicWorkspaceId, answerModel } = settings()
  if (!anthropicApiKey) return failAll('no Anthropic API key is set')
  const { system, userContent } = buildDraftPrompt(missing, input)
  try {
    const reply = await provider.complete({
      apiKey: anthropicApiKey,
      workspaceId: anthropicWorkspaceId || undefined,
      model: answerModel,
      system,
      userContent,
      maxTokens: DRAFT_MAX_TOKENS,
      effort: 'medium',
      timeoutMs: DRAFT_TIMEOUT_MS,
      maxRetries: 1,
    })
    const parsed = parseDraft(reply, missing)
    const failed = Object.keys(parsed.errors).length
    return {
      ...parsed,
      notice: failed
        ? 'Some empty fields could not be drafted. Fill them in, or leave them empty.'
        : null,
    }
  } catch (e) {
    const notJson =
      e instanceof SyntaxError || (e instanceof Error && e.message === 'the reply was not JSON')
    const why = notJson ? 'the reply was not JSON' : 'the assistant request failed'
    return failAll(why)
  }
}
