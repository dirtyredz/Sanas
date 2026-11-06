import { createHash } from 'node:crypto'
import {
  JOB_TEXT_FIELDS,
  JUDGEMENT_FIELDS,
  STALE_PREVIEW_MESSAGE,
  type ApplicationListing,
  type ApplicationPreview,
  type ApplicationSummary,
  type ApplyRequest,
  type ApplyResult,
  type ImportFieldKey,
  type JobTextField,
  type JudgementField,
  type PreviewField,
  type ValueSource,
} from '@shared/jobs/applications'
import { JOB_NAME_MAX_CHARS } from '@shared/jobs/limits'
import { loadSettings } from '../../../config/settings'
import {
  applyApplicationRefresh,
  createJobFromApplication,
  getApplicationLink,
  getLocalJobState,
  listApplicationLinks,
  type ApplicationLink,
  type ImportBaseline,
  type LocalJobState,
} from '../../../db/repos/job/applications'
import { createPreviewTokens } from '../preview-tokens'
import { draftJudgementFields, type DraftResult } from './draft-fields'
import { mapPack, normalizeGlossary, proposedJobName, type SourceValues } from './map-pack'
import {
  linkedStatus,
  nextBaseline,
  planRefresh,
  resolveRefresh,
  type PlanItem,
} from './merge-preview'
import { listPackFiles, readPackFile } from './source/pack-files'
import { refreshPacks } from './source/refresh-runner'
import { resolveSourceConfig, type SourceConfig } from './source/source-config'
import { packFingerprint, validatePack, type ValidPack } from './source/validate-pack'

// Composes the import workflow: list (refresh, then read packs), preview (create or
// three-way refresh, drafting empty judgement fields on create) and apply (re-read and
// re-check everything, then one repository transaction). Previews are main-owned tokens
// bound to the window, the source configuration, the pack fingerprint and — for a refresh —
// the job's saved state; any change returns "Changed since preview—review again."

interface PreviewPayload {
  mode: 'create' | 'refresh'
  applicationId: string
  jobId: number | null
  configKey: string
  fingerprint: string
  localAggregate: string | null
  incoming: SourceValues
  name: { proposed: string; shortened: boolean } | null
  drafts: DraftResult | null
  plan: PlanItem[]
}

const tokens = createPreviewTokens<PreviewPayload>()

const LABELS: Record<ImportFieldKey, string> = {
  companyInfo: 'Company info',
  projectScope: 'Project scope',
  notes: 'Notes (verified facts)',
  talkingPoints: 'Talking points',
  persona: 'Persona / tone',
  glossary: 'Glossary',
  resume: 'Resume (candidate material, separate from Notes)',
}

const isJudgement = (key: string): key is JudgementField =>
  (JUDGEMENT_FIELDS as readonly string[]).includes(key)

const resumeText = (r: { name: string; text: string } | null): string =>
  r ? `${r.name}\n\n${r.text}` : ''

/** Fingerprint of everything a refresh compares against or writes, link included. */
export function localAggregate(state: LocalJobState): string {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex')
}

// --- list ---

function invalidRow(stem: string, error: string, retryable: boolean): ApplicationSummary {
  return {
    applicationId: stem,
    company: '',
    role: '',
    stage: null,
    updatedAt: null,
    status: 'invalid',
    jobId: null,
    jobName: null,
    archived: false,
    error,
    retryable,
  }
}

function summarize(
  pack: ValidPack,
  link: ApplicationLink | undefined,
  root: string,
): ApplicationSummary {
  const base = {
    applicationId: pack.applicationId,
    company: pack.company,
    role: pack.role,
    stage: pack.stage,
    updatedAt: pack.updatedAt,
    error: null,
    retryable: false,
  }
  if (!link)
    return {
      ...base,
      status: pack.stage === 'closed' ? 'closed-unlinked' : 'new',
      jobId: null,
      jobName: null,
      archived: false,
    }
  return {
    ...base,
    jobId: link.jobId,
    jobName: link.jobName,
    archived: link.archived,
    status: linkedStatus({
      linkRoot: link.sourceRoot,
      currentRoot: root,
      linkHash: link.contentHash,
      linkFingerprint: link.fingerprint,
      linkStage: link.stage,
      archived: link.archived,
      packHash: pack.contentHash,
      packFingerprint: packFingerprint(pack),
      packStage: pack.stage,
    }),
  }
}

/** Runs the resumes pack command, then lists what is on disk either way. */
export async function listApplications(): Promise<ApplicationListing> {
  const settings = loadSettings()
  const resolved = await resolveSourceConfig(settings)
  if (!resolved.ok)
    return {
      sourceRoot: settings.resumesRoot,
      refresh: { ok: false, message: resolved.message },
      folder: 'invalid-settings',
      folderError: resolved.message,
      packs: [],
      limited: false,
    }
  const { root } = resolved.config
  const outcome = await refreshPacks(resolved.config)
  const folder = await listPackFiles(root)
  const links = new Map(listApplicationLinks().map((l) => [l.applicationId, l]))
  const packs = folder.files.map((file) => {
    if (!file.ok) return invalidRow(file.stem, file.error, file.retryable)
    const valid = validatePack(file.raw, file.stem)
    if (!valid.ok) return invalidRow(file.stem, valid.error, false)
    return summarize(valid.pack, links.get(valid.pack.applicationId), root)
  })
  packs.sort(
    (a, b) => a.company.localeCompare(b.company) || a.applicationId.localeCompare(b.applicationId),
  )
  return {
    sourceRoot: root,
    refresh: outcome.ok ? { ok: true } : { ok: false, message: outcome.reason },
    folder: folder.state,
    folderError: folder.error,
    packs,
    limited: folder.limited,
  }
}

// --- preview ---

async function loadPack(
  applicationId: string,
): Promise<{ config: SourceConfig; pack: ValidPack; fingerprint: string }> {
  const resolved = await resolveSourceConfig()
  if (!resolved.ok) throw new Error(resolved.message)
  const read = await readPackFile(resolved.config.root, applicationId)
  if (!read.ok) throw new Error(read.error)
  const valid = validatePack(read.raw, applicationId)
  if (!valid.ok) throw new Error(valid.error)
  return { config: resolved.config, pack: valid.pack, fingerprint: packFingerprint(valid.pack) }
}

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

function createFields(incoming: SourceValues, drafts: DraftResult): PreviewField[] {
  const keys: ImportFieldKey[] = [...JOB_TEXT_FIELDS, 'glossary', 'resume']
  return keys.map((key) => {
    const missing = isJudgement(key) && incoming.missing.includes(key)
    let value: string
    if (key === 'glossary')
      value = (missing ? (drafts.glossary ?? []) : incoming.glossary).join('\n')
    else if (key === 'resume') value = resumeText(incoming.resume)
    else
      value =
        missing && isJudgement(key)
          ? (drafts.text[key as Exclude<JudgementField, 'glossary'>] ?? '')
          : incoming.fields[key]
    return {
      key,
      label: LABELS[key],
      outcome: 'new',
      local: null,
      incoming: value,
      source: sourceOf(key, incoming, drafts),
      editable: missing,
      draftError: (missing && isJudgement(key) && drafts.errors[key]) || null,
    }
  })
}

function refreshFields(
  plan: PlanItem[],
  local: LocalJobState,
  incoming: SourceValues,
): PreviewField[] {
  return plan.map(({ key, outcome }) => ({
    key,
    label: LABELS[key],
    outcome,
    local:
      key === 'glossary'
        ? local.glossary.map((g) => (g.note ? `${g.term} — ${g.note}` : g.term)).join('\n')
        : key === 'resume'
          ? resumeText(local.resume)
          : local.fields[key],
    incoming:
      key === 'glossary'
        ? incoming.glossary.join('\n')
        : key === 'resume'
          ? resumeText(incoming.resume)
          : incoming.fields[key],
    source: sourceOf(key, incoming, null),
    editable: false,
    draftError: null,
  }))
}

/** A create or refresh preview for one listed application, with a confirmation token. */
export async function previewApplication(
  senderId: number,
  applicationId: string,
): Promise<ApplicationPreview> {
  const { config, pack, fingerprint } = await loadPack(applicationId)
  const incoming = mapPack(pack)
  const link = getApplicationLink(applicationId)
  const common = {
    applicationId,
    company: pack.company,
    role: pack.role,
    stage: pack.stage,
    jdUrl: pack.jdUrl,
    updatedAt: pack.updatedAt,
    glossaryExcluded: incoming.glossaryExcluded,
    normalized: pack.normalized,
  }
  if (!link) {
    if (pack.stage === 'closed')
      throw new Error('This application is closed, so it cannot create a new job.')
    const drafts = await draftJudgementFields(incoming.missing, {
      company: pack.company,
      role: pack.role,
      projectScope: pack.projectScope,
      notes: pack.notes,
      companyInfo: incoming.fields.companyInfo,
    })
    const name = proposedJobName(pack.company, pack.role)
    const payload: PreviewPayload = {
      mode: 'create',
      applicationId,
      jobId: null,
      configKey: config.key,
      fingerprint,
      localAggregate: null,
      incoming,
      name,
      drafts,
      plan: [],
    }
    return {
      ...common,
      token: tokens.issue(senderId, payload),
      mode: 'create',
      jobId: null,
      name,
      fields: createFields(incoming, drafts),
      stageChange: null,
      offerArchive: false,
      archived: false,
      hasChanges: true,
      draftNotice: drafts.notice,
    }
  }
  if (link.sourceRoot !== config.root)
    throw new Error(
      `This application was imported from another resumes folder (${link.sourceRoot}). Switch back to it to refresh this job.`,
    )
  const local = getLocalJobState(link.jobId)
  if (!local) throw new Error('The linked job no longer exists.')
  const plan = planRefresh(link.baseline, local, incoming)
  const stageChange = pack.stage !== link.stage ? { from: link.stage, to: pack.stage } : null
  const payload: PreviewPayload = {
    mode: 'refresh',
    applicationId,
    jobId: link.jobId,
    configKey: config.key,
    fingerprint,
    localAggregate: localAggregate(local),
    incoming,
    name: null,
    drafts: null,
    plan,
  }
  return {
    ...common,
    token: tokens.issue(senderId, payload),
    mode: 'refresh',
    jobId: link.jobId,
    name: null,
    fields: refreshFields(plan, local, incoming),
    stageChange,
    offerArchive: pack.stage === 'closed' && !local.archived,
    archived: local.archived,
    hasChanges:
      plan.some((i) => i.outcome === 'incoming' || i.outcome === 'conflict') ||
      !!stageChange ||
      fingerprint !== link.fingerprint ||
      pack.contentHash !== link.contentHash,
    draftNotice: null,
  }
}

// --- apply ---

const stale: ApplyResult = { status: 'stale', message: STALE_PREVIEW_MESSAGE }

/** Create: pack values, drafts for the empty judgement fields, and the user's edits to them. */
function createValues(payload: PreviewPayload, request: ApplyRequest) {
  const { incoming, drafts } = payload
  const fields = { ...incoming.fields }
  const sources: ImportBaseline['sources'] = { ...incoming.sources }
  let glossary = incoming.glossary
  for (const key of incoming.missing) {
    const edit = request.edits?.[key]
    if (key === 'glossary') {
      const terms = edit !== undefined ? edit.split('\n') : (drafts?.glossary ?? [])
      glossary = normalizeGlossary(terms).terms
      if (glossary.length) sources.glossary = 'drafted'
      continue
    }
    fields[key] = edit ?? drafts?.text[key] ?? ''
    if (fields[key].trim()) sources[key] = 'drafted'
  }
  for (const key of Object.keys(request.edits ?? {}))
    if (!incoming.missing.includes(key as JudgementField))
      throw new Error('Only drafted fields can be edited before the job is created.')
  return { fields: fields as Record<JobTextField, string>, glossary, sources }
}

/** The edited name, or the proposal when it was not shortened (a shortened one must be
 *  accepted explicitly by sending it back). */
function jobName(proposal: PreviewPayload['name'], requested: string | undefined): string {
  if (requested === undefined && proposal?.shortened)
    throw new Error('The proposed name was shortened. Accept or edit it first.')
  const name = (requested ?? proposal?.proposed ?? '').trim()
  if (!name || name.length > JOB_NAME_MAX_CHARS)
    throw new Error(`Give the job a name of 1–${JOB_NAME_MAX_CHARS} characters.`)
  return name
}

/** Applies a confirmed preview after re-reading and re-checking the pack and saved state. */
export async function applyApplication(
  senderId: number,
  request: ApplyRequest,
): Promise<ApplyResult> {
  const payload = tokens.take(request.token, senderId)
  if (!payload) return stale
  let loaded: Awaited<ReturnType<typeof loadPack>>
  try {
    loaded = await loadPack(payload.applicationId)
  } catch {
    return stale
  }
  if (loaded.config.key !== payload.configKey || loaded.fingerprint !== payload.fingerprint)
    return stale
  // synchronous from here: nothing can change the database in between
  const { pack, config } = loaded
  const link = (baseline: ImportBaseline) => ({
    applicationId: pack.applicationId,
    sourceRoot: config.root,
    contentHash: pack.contentHash,
    fingerprint: loaded.fingerprint,
    stage: pack.stage,
    sourceUpdatedAt: pack.updatedAt,
    baseline,
  })
  if (payload.mode === 'create') {
    if (getApplicationLink(payload.applicationId)) return stale
    const values = createValues(payload, request)
    const jobId = createJobFromApplication({
      name: jobName(payload.name, request.name),
      fields: values.fields,
      glossary: values.glossary,
      resume: payload.incoming.resume,
      link: link(nextBaseline(payload.incoming, values.sources)),
    })
    return { status: 'created', jobId }
  }
  const local = getLocalJobState(payload.jobId!)
  if (!local?.link || localAggregate(local) !== payload.localAggregate) return stale
  const resolved = resolveRefresh(
    payload.plan,
    payload.incoming,
    local.link.baseline.sources,
    request.choices,
  )
  const archive = !!request.archive && pack.stage === 'closed' && !local.archived
  applyApplicationRefresh({
    jobId: local.id,
    fields: resolved.fields,
    glossary: resolved.glossary,
    resume: resolved.resume,
    archive,
    link: link(nextBaseline(payload.incoming, resolved.sources)),
  })
  return { status: 'updated', jobId: local.id, archived: archive || local.archived }
}
