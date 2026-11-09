import { stageCapabilities } from '@shared/jobs/application-stage'
import type { ApplicationRowStatus, ApplicationStage } from '@shared/jobs/applications'

// The picker row status of an application that already has a job linked to it.

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
  const can = stageCapabilities(input.packStage, { archived: input.archived })
  if (can.archive) return 'archive-available'
  if (!can.refresh) return 'imported' // closed and archived: nothing left to offer
  const changed =
    input.packHash !== input.linkHash ||
    input.packFingerprint !== input.linkFingerprint ||
    input.packStage !== input.linkStage
  return changed ? 'refresh-available' : 'imported'
}
