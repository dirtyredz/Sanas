import type { ApplyRequest, JobTextField, JudgementField } from '@shared/jobs/applications'
import type { ImportBaseline } from '@shared/jobs/import-baseline'
import { JOB_NAME_MAX_CHARS } from '@shared/jobs/limits'
import { normalizeGlossary } from '../map-pack'
import type { CreatePayload } from './preview-session'

// Resolves what a confirmed create saves: pack values, drafts for the empty judgement fields,
// the user's edits to them and the job name.

/** Create: pack values, drafts for the empty judgement fields, and the user's edits to them. */
export function createValues(payload: CreatePayload, request: ApplyRequest) {
  const { incoming, drafts } = payload
  const fields = { ...incoming.fields }
  const sources: ImportBaseline['sources'] = { ...incoming.sources }
  let glossary = incoming.glossary
  for (const key of incoming.missing) {
    const edit = request.edits?.[key]
    if (key === 'glossary') {
      const terms = edit !== undefined ? edit.split('\n') : (drafts.glossary ?? [])
      glossary = normalizeGlossary(terms).terms
      if (glossary.length) sources.glossary = 'drafted'
      continue
    }
    fields[key] = edit ?? drafts.text[key] ?? ''
    if (fields[key].trim()) sources[key] = 'drafted'
  }
  for (const key of Object.keys(request.edits ?? {}))
    if (!incoming.missing.includes(key as JudgementField))
      throw new Error('Only drafted fields can be edited before the job is created.')
  return { fields: fields as Record<JobTextField, string>, glossary, sources }
}

/** The edited name, or the proposal when it was not shortened (a shortened one must be
 *  accepted explicitly by sending it back). */
export function jobName(proposal: CreatePayload['name'], requested: string | undefined): string {
  if (requested === undefined && proposal.shortened)
    throw new Error('The proposed name was shortened. Accept or edit it first.')
  const name = (requested ?? proposal.proposed).trim()
  if (!name || name.length > JOB_NAME_MAX_CHARS)
    throw new Error(`Give the job a name of 1–${JOB_NAME_MAX_CHARS} characters.`)
  return name
}
