import type { MeetingResume } from '@shared/meeting-resume'
import {
  JOB_TEXT_FIELDS,
  JUDGEMENT_FIELDS,
  type ApplicationRowStatus,
  type ApplicationStage,
  type ConflictChoice,
  type FieldOutcome,
  type ImportFieldKey,
  type JobTextField,
  type JudgementField,
  type ValueSource,
} from '@shared/jobs/applications'
import type { ImportBaseline } from '../../../db/repos/job/applications'
import type { SourceValues } from './map-pack'

// Pure three-way comparison for refreshing a linked job: base = the source values of the
// last import/review, local = what Sanas has saved now, incoming = the new pack. Resume
// {name,text} is one unit; the glossary is one collection whose local notes count as local
// changes (conservative: no automatic per-term merge).

export interface LocalValues {
  fields: Record<JobTextField, string>
  glossary: readonly { term: string; note: string }[]
  resume: MeetingResume | null
}

export type RefreshOutcome = Exclude<FieldOutcome, 'new'>

export interface PlanItem {
  key: ImportFieldKey
  outcome: RefreshOutcome
}

/** The rule table: equal sides never conflict; a side equal to base yields to the other. */
export function threeWay<T>(
  base: T,
  local: T,
  incoming: T,
  eq: (a: T, b: T) => boolean,
): RefreshOutcome {
  if (eq(local, incoming)) return 'unchanged'
  if (eq(local, base)) return 'incoming'
  if (eq(incoming, base)) return 'keep-local'
  return 'conflict'
}

const termSet = (terms: readonly string[]): string =>
  [...new Set(terms.map((t) => t.toLowerCase()))].sort().join('\n')

/** A local glossary equals a source list only when it has the same terms and no notes. */
function localGlossary(local: LocalValues['glossary']): string | null {
  return local.some((g) => g.note.trim()) ? null : termSet(local.map((g) => g.term))
}

const sameResume = (a: MeetingResume | null, b: MeetingResume | null): boolean =>
  a === b || (!!a && !!b && a.name === b.name && a.text === b.text)

export function planRefresh(
  baseline: ImportBaseline,
  local: LocalValues,
  incoming: SourceValues,
): PlanItem[] {
  const items: PlanItem[] = JOB_TEXT_FIELDS.map((key) => ({
    key,
    outcome: threeWay(
      baseline.fields[key],
      local.fields[key],
      incoming.fields[key],
      (a, b) => a === b,
    ),
  }))
  items.push({
    key: 'glossary',
    outcome: threeWay<string | null>(
      termSet(baseline.glossary),
      localGlossary(local.glossary),
      termSet(incoming.glossary),
      (a, b) => a !== null && a === b,
    ),
  })
  items.push({
    key: 'resume',
    outcome: threeWay(baseline.resume, local.resume, incoming.resume, sameResume),
  })
  return items
}

const takesIncoming = (
  item: PlanItem,
  choices: Partial<Record<ImportFieldKey, ConflictChoice>>,
): boolean =>
  item.outcome === 'incoming' || (item.outcome === 'conflict' && choices[item.key] === 'incoming')

export interface ResolvedRefresh {
  fields: Partial<Record<JobTextField, string>>
  glossary?: string[]
  /** undefined: keep the saved resume. */
  resume?: MeetingResume | null
  /** Where each judgement field's saved value now comes from. */
  sources: Partial<Record<JudgementField, ValueSource>>
}

/** Applies the defaults (Keep Sanas for conflicts) and the user's choices. */
export function resolveRefresh(
  plan: readonly PlanItem[],
  incoming: SourceValues,
  previousSources: ImportBaseline['sources'],
  choices: Partial<Record<ImportFieldKey, ConflictChoice>> = {},
): ResolvedRefresh {
  const out: ResolvedRefresh = { fields: {}, sources: { ...previousSources } }
  for (const item of plan) {
    if (!takesIncoming(item, choices)) continue
    if (item.key === 'glossary') out.glossary = incoming.glossary
    else if (item.key === 'resume') out.resume = incoming.resume
    else out.fields[item.key] = incoming.fields[item.key]
    if ((JUDGEMENT_FIELDS as readonly string[]).includes(item.key)) {
      const key = item.key as JudgementField
      if (incoming.sources[key]) out.sources[key] = incoming.sources[key]
      else delete out.sources[key]
    }
  }
  return out
}

/** The baseline after a confirmed review: always the incoming source values, so an
 *  unchanged pack never challenges a value the user deliberately kept. */
export function nextBaseline(
  incoming: SourceValues,
  sources: ImportBaseline['sources'],
): ImportBaseline {
  return {
    version: 1,
    fields: { ...incoming.fields },
    glossary: [...incoming.glossary],
    resume: incoming.resume,
    sources,
  }
}

/** A linked application's row status in the picker. */
export function linkedStatus(input: {
  linkRoot: string
  currentRoot: string
  linkHash: string | null
  linkFingerprint: string
  linkStage: ApplicationStage
  archived: boolean
  packHash: string | null
  packFingerprint: string
  packStage: ApplicationStage
}): ApplicationRowStatus {
  if (input.linkRoot !== input.currentRoot) return 'source-mismatch'
  if (input.packStage === 'closed' && !input.archived) return 'archive-available'
  const changed =
    input.packHash !== input.linkHash ||
    input.packFingerprint !== input.linkFingerprint ||
    input.packStage !== input.linkStage
  return changed ? 'refresh-available' : 'imported'
}
