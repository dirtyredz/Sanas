import { createHash } from 'node:crypto'
import {
  APPLICATION_STAGES,
  JUDGEMENT_FIELDS,
  type ApplicationStage,
  type JudgementField,
} from '@shared/jobs/applications'
import { RESUME_MAX_CHARS } from '@shared/meeting-resume'

// Pure validation of one untrusted resumes interview pack (schema v1). Only allowlisted
// properties are projected; wrong types are errors, never silently absent values. Text is
// normalized (line endings, NUL and control characters) and every normalization is reported.

export const PACK_SCHEMA_VERSION = 1
export const PACK_TEXT_MAX_CHARS = 20_000
export const PACK_RESUME_NAME_MAX_CHARS = 255
export const PACK_GLOSSARY_MAX_ENTRIES = 1_000
export const PACK_ID_MAX_CHARS = 128
export const PACK_HASH_MAX_CHARS = 256
const SOURCE_LABEL_MAX_CHARS = 40

/** A validated, normalized pack. Judgement fields are null when the producer left them
 *  for Sanas to draft. `pdfPath` is validated, then discarded: Sanas never opens it. */
export interface ValidPack {
  applicationId: string
  stage: ApplicationStage
  company: string
  role: string
  projectScope: string
  notes: string
  jdUrl: string
  companyInfo: string | null
  talkingPoints: string | null
  persona: string | null
  glossary: string[] | null
  resume: { name: string; text: string } | null
  contentHash: string | null
  updatedAt: string | null
  fieldSources: Partial<Record<JudgementField, string | null>>
  /** What normalization changed, for the preview. */
  normalized: string[]
}

export type PackValidation = { ok: true; pack: ValidPack } | { ok: false; error: string }

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

/** A bounded, safe single file-name component: also how a pack file is named. */
export function isSafeApplicationId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length <= PACK_ID_MAX_CHARS &&
    SAFE_ID.test(id) &&
    !id.endsWith('.') &&
    !id.includes('..') &&
    !RESERVED_NAME.test(id)
  )
}

class PackError extends Error {}

// eslint-disable-next-line no-control-regex
const DISALLOWED = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

function normalizeText(value: string, field: string, notes: string[]): string {
  const out = value.replace(/\r\n?/g, '\n').replace(DISALLOWED, '')
  if (out !== value) notes.push(`${field}: line endings or control characters normalized`)
  return out
}

function text(
  raw: Record<string, unknown>,
  key: string,
  max: number,
  notes: string[],
  label = key,
): string {
  const v = raw[key]
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') throw new PackError(`${label} must be text.`)
  if (v.length > max)
    throw new PackError(`${label} exceeds ${max.toLocaleString('en-US')} characters.`)
  return normalizeText(v, label, notes)
}

function nullableText(raw: Record<string, unknown>, key: string, notes: string[]): string | null {
  if (raw[key] === undefined || raw[key] === null) return null
  const v = text(raw, key, PACK_TEXT_MAX_CHARS, notes)
  return v.trim() ? v : null
}

function glossary(raw: Record<string, unknown>, notes: string[]): string[] | null {
  const v = raw.glossary
  if (v === undefined || v === null) return null
  if (!Array.isArray(v)) throw new PackError('glossary must be a list of terms.')
  if (v.length > PACK_GLOSSARY_MAX_ENTRIES)
    throw new PackError(`glossary has more than ${PACK_GLOSSARY_MAX_ENTRIES} entries.`)
  const terms = v.map((term, i) => {
    if (typeof term !== 'string') throw new PackError(`glossary entry ${i + 1} must be text.`)
    if (term.length > PACK_TEXT_MAX_CHARS)
      throw new PackError(`glossary entry ${i + 1} is too long.`)
    return normalizeText(term, 'glossary', notes)
  })
  return terms.some((t) => t.trim()) ? terms : null
}

function resume(raw: Record<string, unknown>, notes: string[]): ValidPack['resume'] {
  const v = raw.resume
  if (v === undefined || v === null) return null
  if (typeof v !== 'object' || Array.isArray(v)) throw new PackError('resume must be an object.')
  const r = v as Record<string, unknown>
  const name = text(r, 'name', PACK_RESUME_NAME_MAX_CHARS, notes, 'resume name')
  const body = text(r, 'text', RESUME_MAX_CHARS, notes, 'resume text')
  text(r, 'pdfPath', PACK_TEXT_MAX_CHARS, [], 'resume pdfPath') // validated, then discarded
  return body.trim() ? { name: name.trim(), text: body } : null
}

function safeUrl(value: string, notes: string[]): string {
  if (!value.trim()) return ''
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString()
  } catch {
    // falls through
  }
  notes.push('jdUrl: not an http(s) link, dropped')
  return ''
}

function fieldSources(raw: Record<string, unknown>): ValidPack['fieldSources'] {
  const v = raw.fieldSources
  if (v === undefined || v === null) return {}
  if (typeof v !== 'object' || Array.isArray(v))
    throw new PackError('fieldSources must be an object.')
  const out: ValidPack['fieldSources'] = {}
  for (const key of JUDGEMENT_FIELDS) {
    const s = (v as Record<string, unknown>)[key]
    if (s === undefined || s === null) out[key] = null
    else if (typeof s === 'string' && s.length <= SOURCE_LABEL_MAX_CHARS) out[key] = s
    else throw new PackError(`fieldSources.${key} must be a short label.`)
  }
  return out
}

function updatedAt(raw: Record<string, unknown>): string | null {
  const v = raw.updatedAt
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || v.length > 64 || Number.isNaN(Date.parse(v)))
    throw new PackError('updatedAt must be an ISO date and time.')
  return new Date(v).toISOString()
}

/** Validates a parsed pack read from `<stem>.json`. The payload's ID must match the stem. */
export function validatePack(raw: unknown, stem: string): PackValidation {
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      throw new PackError('The pack is not a JSON object.')
    const r = raw as Record<string, unknown>
    if (r.schemaVersion !== PACK_SCHEMA_VERSION)
      throw new PackError(
        `Unsupported pack version ${JSON.stringify(r.schemaVersion ?? null).slice(0, 20)}.`,
      )
    if (!isSafeApplicationId(r.applicationId))
      throw new PackError('applicationId is missing or unsafe.')
    if (r.applicationId !== stem) throw new PackError('applicationId does not match the file name.')
    if (!APPLICATION_STAGES.includes(r.stage as ApplicationStage))
      throw new PackError('stage must be interview, offer or closed.')
    const notes: string[] = []
    const company = text(r, 'company', PACK_TEXT_MAX_CHARS, notes).trim()
    if (!company) throw new PackError('company is required.')
    const contentHash = r.contentHash
    if (
      contentHash !== undefined &&
      contentHash !== null &&
      (typeof contentHash !== 'string' || contentHash.length > PACK_HASH_MAX_CHARS)
    )
      throw new PackError('contentHash must be short text.')
    const pack: ValidPack = {
      applicationId: r.applicationId,
      stage: r.stage as ApplicationStage,
      company,
      role: text(r, 'role', PACK_TEXT_MAX_CHARS, notes).trim(),
      projectScope: text(r, 'projectScope', PACK_TEXT_MAX_CHARS, notes),
      notes: text(r, 'notes', PACK_TEXT_MAX_CHARS, notes),
      jdUrl: safeUrl(text(r, 'jdUrl', PACK_TEXT_MAX_CHARS, notes), notes),
      companyInfo: nullableText(r, 'companyInfo', notes),
      talkingPoints: nullableText(r, 'talkingPoints', notes),
      persona: nullableText(r, 'persona', notes),
      glossary: glossary(r, notes),
      resume: resume(r, notes),
      contentHash: typeof contentHash === 'string' && contentHash ? contentHash : null,
      updatedAt: updatedAt(r),
      fieldSources: fieldSources(r),
      normalized: [...new Set(notes)],
    }
    return { ok: true, pack }
  } catch (e) {
    if (e instanceof PackError) return { ok: false, error: e.message }
    throw e
  }
}

/** Local fingerprint of the normalized content, independent of the producer's contentHash
 *  (which may be missing or reused): any change to what Sanas would import changes it. */
export function packFingerprint(pack: ValidPack): string {
  const { contentHash: _hash, updatedAt: _at, normalized: _n, ...content } = pack
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}
