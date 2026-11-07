import { expect, it } from 'vitest'
import type {
  ApplicationPreview,
  ApplicationSummary,
  PreviewField,
  PreviewValue,
} from '@shared/jobs/applications'
import { applyProblem, buildApplyRequest, initialChoices, retainChoices } from './apply-request'
import { formatUpdated, rowView, sourceLabel } from './picker-rows'

const text = (value: string): PreviewValue => ({ kind: 'text', text: value })
const field = (over: Partial<PreviewField>): PreviewField => ({
  key: 'notes',
  outcome: 'new',
  local: null,
  incoming: text(''),
  source: null,
  editable: false,
  draftError: null,
  ...over,
})
const preview = (over: Partial<ApplicationPreview> = {}): ApplicationPreview => ({
  token: 't',
  mode: 'create',
  applicationId: 'acme-1',
  jobId: null,
  company: 'Acme',
  role: 'SRE',
  stage: 'interview',
  jdUrl: '',
  updatedAt: null,
  name: { proposed: 'Acme — SRE', shortened: false },
  fields: [],
  glossaryExcluded: [],
  normalized: [],
  stageChange: null,
  offerArchive: false,
  archived: false,
  hasChanges: true,
  draftNotice: null,
  ...over,
})

it('creates with the proposed name and only the edits made', () => {
  const p = preview()
  const choices = initialChoices(p)
  expect(applyProblem(p, choices)).toBeNull()
  expect(buildApplyRequest(p, choices)).toEqual({ token: 't', name: 'Acme — SRE' })
  expect(
    buildApplyRequest(p, { ...choices, name: ' Edited ', edits: { persona: 'Calm' } }),
  ).toEqual({ token: 't', name: 'Edited', edits: { persona: 'Calm' } })
})

it('requires explicit acceptance of a shortened name', () => {
  const p = preview({ name: { proposed: 'x'.repeat(119) + '…', shortened: true } })
  const choices = initialChoices(p)
  expect(applyProblem(p, choices)).toMatch(/shortened/)
  expect(applyProblem(p, { ...choices, nameAccepted: true })).toBeNull()
  expect(applyProblem(p, { ...choices, nameAccepted: true, name: ' ' })).toMatch(/name/)
})

it('refreshes with Keep Sanas by default and archives only when chosen', () => {
  const p = preview({ mode: 'refresh', name: null, offerArchive: true })
  const choices = initialChoices(p)
  expect(buildApplyRequest(p, choices)).toEqual({ token: 't', archive: false })
  expect(
    buildApplyRequest(p, { ...choices, choices: { notes: 'incoming' }, archive: true }),
  ).toEqual({ token: 't', choices: { notes: 'incoming' }, archive: true })
  expect(buildApplyRequest(preview({ mode: 'refresh', name: null }), choices)).toEqual({
    token: 't',
  })
})

it('retains only choices that still apply after a stale preview', () => {
  const before = {
    name: 'Edited',
    nameAccepted: true,
    edits: { persona: 'Mine', talkingPoints: 'Gone' },
    choices: { notes: 'incoming', persona: 'incoming' } as const,
    archive: true,
  }
  const next = preview({
    mode: 'refresh',
    name: null,
    offerArchive: false,
    fields: [
      field({ key: 'notes', outcome: 'conflict' }),
      field({ key: 'persona', outcome: 'incoming' }),
    ],
  })
  expect(retainChoices(before, next)).toEqual({
    name: '',
    nameAccepted: true,
    edits: {},
    choices: { notes: 'incoming' },
    archive: false,
  })
  const create = preview({ fields: [field({ key: 'persona', editable: true })] })
  expect(retainChoices(before, create)).toMatchObject({
    name: 'Edited',
    edits: { persona: 'Mine' },
  })
})

const row = (over: Partial<ApplicationSummary>): ApplicationSummary => ({
  applicationId: 'acme-1',
  company: 'Acme',
  role: '',
  stage: 'interview',
  updatedAt: null,
  status: 'new',
  jobId: null,
  jobName: null,
  archived: false,
  error: null,
  retryable: false,
  ...over,
})

it('maps every picker state to its action and badge', () => {
  expect(rowView(row({}))).toMatchObject({ action: 'preview', label: 'Preview and create' })
  expect(rowView(row({ status: 'imported', jobId: 3 }))).toMatchObject({
    action: 'open',
    label: 'Open job',
  })
  expect(rowView(row({ status: 'refresh-available' })).label).toBe('Review changes')
  expect(rowView(row({ status: 'archive-available' })).hint).toMatch(/archive/)
  expect(rowView(row({ status: 'imported', archived: true })).badges.map((b) => b.label)).toContain(
    'Archived',
  )
  expect(rowView(row({ status: 'source-mismatch' })).hint).toMatch(/different resumes folder/)
  expect(rowView(row({ status: 'invalid', error: 'Bad JSON.', retryable: true }))).toMatchObject({
    action: 'none',
    hint: 'Bad JSON. Refresh to try again.',
  })
  expect(sourceLabel('drafted')).toBe('Drafted by Sanas')
  expect(sourceLabel('resumes')).toBe('From resumes')
  expect(sourceLabel(null)).toBeNull()
  expect(formatUpdated(null)).toBe('Unknown')
  expect(formatUpdated('nonsense')).toBe('Unknown')
})
