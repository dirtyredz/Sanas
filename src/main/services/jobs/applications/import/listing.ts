import type { ApplicationListing, ApplicationSummary } from '@shared/jobs/applications'
import { loadSettings } from '../../../../config/settings'
import { listApplicationLinks, type ApplicationLink } from '../../../../db/repos/job/applications'
import { linkedStatus } from '../merge-preview'
import { listPackFiles } from '../source/pack-files'
import { refreshPacks } from '../source/refresh-runner'
import { resolveSourceConfig } from '../source/source-config'
import { packFingerprint, validatePack, type ValidPack } from '../source/validate-pack'

// The picker's list: refresh the packs, read what is on disk and project each pack to a row.

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
): ApplicationSummary | null {
  const base = {
    applicationId: pack.applicationId,
    company: pack.company,
    role: pack.role,
    stage: pack.stage,
    updatedAt: pack.updatedAt,
    error: null,
    retryable: false,
  }
  // A closed application means a failure notice: it is shown only while a job is linked to it
  // (so that job can be archived), never as something to start from.
  if (!link) {
    if (pack.stage === 'closed') return null
    return { ...base, status: 'new', jobId: null, jobName: null, archived: false }
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
  const packs: ApplicationSummary[] = []
  for (const file of folder.files) {
    if (!file.ok) {
      packs.push(invalidRow(file.stem, file.error, file.retryable))
      continue
    }
    const valid = validatePack(file.raw, file.stem)
    if (!valid.ok) {
      packs.push(invalidRow(file.stem, valid.error, false))
      continue
    }
    const row = summarize(valid.pack, links.get(valid.pack.applicationId), root)
    if (row) packs.push(row)
  }
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
