import {
  JOB_TEXT_FIELDS,
  JUDGEMENT_FIELDS,
  type ImportFieldKey,
  type JudgementField,
  type PreviewField,
  type PreviewValue,
  type ValueSource,
} from '@shared/jobs/applications'
import type { LocalJobState } from '../../../../db/repos/job/applications'
import type { DraftResult } from '../draft-fields'
import type { SourceValues } from '../map-pack'
import type { PlanItem } from '../merge-preview'

// Projects pack values, drafts and the saved job state to typed preview fields. Labels and
// display text are the renderer's job (app/jobs/applications/preview-format.ts).

const isJudgement = (key: string): key is JudgementField =>
  (JUDGEMENT_FIELDS as readonly string[]).includes(key)

const text = (value: string): PreviewValue => ({ kind: 'text', text: value })
const terms = (list: readonly string[]): PreviewValue => ({
  kind: 'glossary',
  terms: list.map((term) => ({ term, note: '' })),
})

function sourceOf(
  key: ImportFieldKey,
  incoming: SourceValues,
  drafts: DraftResult | null,
): ValueSource | null {
  if (isJudgement(key)) {
    if (incoming.sources[key]) return 'resumes'
    const drafted = key === 'glossary' ? !!drafts?.glossary?.length : !!drafts?.text[key]
    return drafted ? 'drafted' : null
  }
  if (key === 'resume') return incoming.resume ? 'resumes' : null
  return incoming.fields[key] ? 'resumes' : null
}

export function createFields(incoming: SourceValues, drafts: DraftResult): PreviewField[] {
  const keys: ImportFieldKey[] = [...JOB_TEXT_FIELDS, 'glossary', 'resume']
  return keys.map((key) => {
    const missing = isJudgement(key) && incoming.missing.includes(key)
    let value: PreviewValue
    if (key === 'glossary') value = terms(missing ? (drafts.glossary ?? []) : incoming.glossary)
    else if (key === 'resume') value = { kind: 'resume', resume: incoming.resume }
    else
      value = text(
        missing && isJudgement(key)
          ? (drafts.text[key as Exclude<JudgementField, 'glossary'>] ?? '')
          : incoming.fields[key],
      )
    return {
      key,
      outcome: 'new',
      local: null,
      incoming: value,
      source: sourceOf(key, incoming, drafts),
      editable: missing,
      draftError: (missing && isJudgement(key) && drafts.errors[key]) || null,
    }
  })
}

export function refreshFields(
  plan: PlanItem[],
  local: LocalJobState,
  incoming: SourceValues,
): PreviewField[] {
  return plan.map(({ key, outcome }) => ({
    key,
    outcome,
    local:
      key === 'glossary'
        ? { kind: 'glossary', terms: local.glossary.map((g) => ({ ...g })) }
        : key === 'resume'
          ? { kind: 'resume', resume: local.resume }
          : text(local.fields[key]),
    incoming:
      key === 'glossary'
        ? terms(incoming.glossary)
        : key === 'resume'
          ? { kind: 'resume', resume: incoming.resume }
          : text(incoming.fields[key]),
    source: sourceOf(key, incoming, null),
    editable: false,
    draftError: null,
  }))
}
