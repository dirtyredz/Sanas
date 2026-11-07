import { createHash } from 'node:crypto'
import type { LocalJobState } from '../../../../db/repos/job/applications'
import { createPreviewTokens } from '../../preview-tokens'
import type { DraftResult } from '../draft-fields'
import type { SourceValues } from '../map-pack'
import type { PlanItem } from '../merge-preview'
import { readPackFile } from '../source/pack-files'
import { resolveSourceConfig, type SourceConfig } from '../source/source-config'
import { packFingerprint, validatePack, type ValidPack } from '../source/validate-pack'

// What a confirmed preview remembers. Previews are main-owned tokens bound to the window,
// the source configuration, the pack fingerprint and — for a refresh — the job's saved
// state; any change returns "Changed since preview—review again."

export interface PreviewPayload {
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

export const tokens = createPreviewTokens<PreviewPayload>()

/** Fingerprint of everything a refresh compares against or writes, link included. */
export function localAggregate(state: LocalJobState): string {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex')
}

/** Re-reads and validates one application's pack under the current source settings. */
export async function loadPack(
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
