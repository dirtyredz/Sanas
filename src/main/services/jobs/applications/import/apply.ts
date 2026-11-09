import {
  STALE_PREVIEW_MESSAGE,
  type ApplyRequest,
  type ApplyResult,
} from '@shared/jobs/applications'
import type { ImportBaseline } from '@shared/jobs/import-baseline'
import {
  applyApplicationRefresh,
  createJobFromApplication,
  getApplicationLink,
  getLocalJobState,
} from '../../../../db/repos/job/applications'
import { nextBaseline, resolveRefresh } from '../merge-preview'
import { createValues, jobName } from './apply-values'
import { loadPack, localAggregate, tokens } from './preview-session'

// Redeems a confirmed preview: re-read and re-check the pack and saved state, then one
// repository transaction. Anything that changed since the preview returns "stale".

const stale: ApplyResult = { status: 'stale', message: STALE_PREVIEW_MESSAGE }

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
  const local = getLocalJobState(payload.jobId)
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
