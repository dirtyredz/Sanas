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
  // Closed means archive-only: never offer a refresh for a closed application.
  if (input.packStage === 'closed') return input.archived ? 'imported' : 'archive-available'
  const changed =
    input.packHash !== input.linkHash ||
    input.packFingerprint !== input.linkFingerprint ||
    input.packStage !== input.linkStage
  return changed ? 'refresh-available' : 'imported'
}
