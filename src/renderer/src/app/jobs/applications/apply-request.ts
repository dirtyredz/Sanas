import type {
  ApplicationPreview,
  ApplyRequest,
  ConflictChoice,
  ImportFieldKey,
  JobTextField,
} from '@shared/jobs/applications'

// The preview's local choices (name, draft edits, conflict choices, archive) and the apply
// request built from them. Pure, so defaults (Keep Sanas, no archive) and the "retain what is
// still safe after a stale preview" rule are tested.

export interface PreviewChoices {
  name: string
  /** A shortened proposal must be accepted (or edited) explicitly. */
  nameAccepted: boolean
  edits: Partial<Record<JobTextField | 'glossary', string>>
  choices: Partial<Record<ImportFieldKey, ConflictChoice>>
  archive: boolean
}

export function initialChoices(preview: ApplicationPreview): PreviewChoices {
  return {
    name: preview.name?.proposed ?? '',
    nameAccepted: !preview.name?.shortened,
    edits: {},
    choices: {},
    archive: false,
  }
}

/** After "review again": keep choices only for fields that are still conflicts, edits only
 *  for fields that are still editable, and the name/archive decision when it still applies. */
export function retainChoices(previous: PreviewChoices, next: ApplicationPreview): PreviewChoices {
  const base = initialChoices(next)
  const conflicts = new Set(next.fields.filter((f) => f.outcome === 'conflict').map((f) => f.key))
  const editable = new Set(next.fields.filter((f) => f.editable).map((f) => f.key))
  return {
    name: next.name ? previous.name || base.name : '',
    nameAccepted: next.name ? previous.nameAccepted || base.nameAccepted : true,
    edits: Object.fromEntries(
      Object.entries(previous.edits).filter(([k]) => editable.has(k as ImportFieldKey)),
    ),
    choices: Object.fromEntries(
      Object.entries(previous.choices).filter(([k]) => conflicts.has(k as ImportFieldKey)),
    ),
    archive: next.offerArchive && previous.archive,
  }
}

/** Why Apply is not available yet, or null. */
export function applyProblem(preview: ApplicationPreview, choices: PreviewChoices): string | null {
  if (preview.mode === 'create') {
    const name = choices.name.trim()
    if (!name || name.length > 120) return 'Give the job a name of 1–120 characters.'
    if (!choices.nameAccepted) return 'The proposed name was shortened. Accept or edit it.'
  }
  return null
}

export function buildApplyRequest(
  preview: ApplicationPreview,
  choices: PreviewChoices,
): ApplyRequest {
  if (preview.mode === 'create') {
    const request: ApplyRequest = { token: preview.token, name: choices.name.trim() }
    if (Object.keys(choices.edits).length) request.edits = choices.edits
    return request
  }
  const request: ApplyRequest = { token: preview.token }
  if (Object.keys(choices.choices).length) request.choices = choices.choices
  if (preview.offerArchive) request.archive = choices.archive
  return request
}
