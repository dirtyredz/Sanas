import type { ApplicationPreview } from '@shared/jobs/applications'
import { getApplicationLink, getLocalJobState } from '../../../../db/repos/job/applications'
import { draftJudgementFields } from '../draft-fields'
import { mapPack, proposedJobName } from '../map-pack'
import { planRefresh } from '../merge-preview'
import { createFields, refreshFields } from './preview-fields'
import { loadPack, localAggregate, tokens, type PreviewPayload } from './preview-session'

// Builds the create or three-way refresh preview for one listed application and issues the
// confirmation token that apply later redeems.

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
