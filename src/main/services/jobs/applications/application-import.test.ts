import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sqliteTestDatabase } from '../../../db/testing/sqlite-test-database'
const mock = vi.hoisted(() => ({
  db: null as unknown as Database,
  settings: {} as Record<string, unknown>,
  complete: vi.fn<(req: { system: string; userContent: string }) => Promise<string>>(),
  refresh: vi.fn(),
}))
vi.mock('../../../db/index', () => ({ getDb: () => mock.db }))
vi.mock('../../../config/settings', () => ({ loadSettings: () => mock.settings }))
vi.mock('../../assistant/provider/provider', () => ({
  assistantProvider: { complete: mock.complete },
}))
vi.mock('./source/refresh-runner', () => ({ refreshPacks: () => mock.refresh() }))
import { runMigrations } from '../../../db/migrations'
import { createJob, getJob, listJobs, setJobArchived, updateJob } from '../../../db/repos/job/jobs'
import { getLocalJobState } from '../../../db/repos/job/applications'
import { setJobResume } from '../../../db/repos/job/job-resume'
import { createMeeting } from '../../../db/repos/meeting/meeting-create'
import { getMeetingGrounding } from '../../../db/repos/meeting/meeting-grounding'
import { applyApplication, listApplications, previewApplication } from './application-import'

let sqlite: DatabaseSync
let root: string
let packs: string
beforeEach(() => {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
  createJob('Default') // ID 1
  root = mkdtempSync(join(tmpdir(), 'sanas-resumes-'))
  packs = join(root, 'job-hunt', 'sanas')
  mkdirSync(packs, { recursive: true })
  mock.settings = {
    resumesRoot: root,
    resumesNodeExecutable: 'node.exe',
    anthropicApiKey: 'key',
    anthropicWorkspaceId: '',
    answerModel: 'model',
  }
  mock.refresh.mockReset().mockResolvedValue({ ok: true })
  mock.complete.mockReset().mockResolvedValue(
    JSON.stringify({
      companyInfo: 'Acme builds rockets.',
      talkingPoints: '- Camunda migration',
      persona: 'Calm and senior.',
      glossary: ['Camunda', 'Kotlin'],
    }),
  )
})
afterEach(() => {
  sqlite.close()
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function pack(id: string, over: Record<string, unknown> = {}): void {
  writeFileSync(
    join(packs, `${id}.json`),
    JSON.stringify({
      schemaVersion: 1,
      applicationId: id,
      stage: 'interview',
      company: 'Acme',
      role: 'Platform engineer',
      projectScope: 'Build the platform',
      notes: 'Led a Camunda migration at ExampleCo.',
      resume: { name: 'CV', text: 'Claims ten years of Rust.', pdfPath: 'C:\\cv.pdf' },
      contentHash: 'h1',
      ...over,
    }),
  )
}

async function create(id: string, sender = 1): Promise<number> {
  const preview = await previewApplication(sender, id)
  const result = await applyApplication(sender, {
    token: preview.token,
    name: preview.name!.proposed,
  })
  if (result.status !== 'created') throw new Error(result.status)
  return result.jobId
}

it('lists packs with their state, and still lists them when the refresh fails', async () => {
  pack('acme-1')
  pack('globex-2', { company: 'Globex', stage: 'closed' })
  writeFileSync(join(packs, 'broken.json'), '{')
  mock.refresh.mockResolvedValue({ ok: false, reason: 'The resumes pack command is missing.' })
  const listing = await listApplications()
  expect(listing.refresh).toEqual({ ok: false, message: 'The resumes pack command is missing.' })
  // an invalid pack has no company, so it sorts first
  expect(listing.packs.map((p) => [p.applicationId, p.status])).toEqual([
    ['broken', 'invalid'],
    ['acme-1', 'new'],
  ])
  mock.settings.resumesRoot = 'relative\\path'
  expect((await listApplications()).folder).toBe('invalid-settings')
})

it('lists a closed pack only while a job is linked, and then only to archive it', async () => {
  pack('globex-2', { company: 'Globex', stage: 'closed' })
  expect((await listApplications()).packs).toEqual([])
  pack('acme-1')
  const jobId = await create('acme-1')
  pack('acme-1', { stage: 'closed' })
  const listed = (await listApplications()).packs
  expect(listed.map((p) => [p.applicationId, p.status, p.jobId])).toEqual([
    ['acme-1', 'archive-available', jobId],
  ])
})

it('drafts empty judgement fields from notes only, labels sources, and saves edits', async () => {
  pack('acme-1')
  const preview = await previewApplication(1, 'acme-1')
  const request = mock.complete.mock.calls[0][0]
  expect(request.system).toContain('Use ONLY facts stated in NOTES')
  expect(request.userContent).toContain('Led a Camunda migration')
  expect(JSON.stringify(request)).not.toContain('Rust') // the resume never reaches the draft
  const field = (key: string) => preview.fields.find((f) => f.key === key)!
  expect(field('persona')).toMatchObject({
    source: 'drafted',
    editable: true,
    incoming: { kind: 'text', text: 'Calm and senior.' },
  })
  expect(field('notes')).toMatchObject({ source: 'resumes', editable: false })
  expect(field('glossary').incoming).toEqual({
    kind: 'glossary',
    terms: [
      { term: 'Camunda', note: '' },
      { term: 'Kotlin', note: '' },
    ],
  })
  expect(JSON.stringify(field('notes').incoming)).not.toContain('Rust')
  const result = await applyApplication(1, {
    token: preview.token,
    name: preview.name!.proposed,
    edits: { persona: 'Edited persona' },
  })
  expect(result.status).toBe('created')
  const state = getLocalJobState((result as { jobId: number }).jobId)!
  expect(state.name).toBe('Acme — Platform engineer')
  expect(state.fields).toMatchObject({
    persona: 'Edited persona',
    talkingPoints: '- Camunda migration',
  })
  expect(state.fields.notes).toBe('Led a Camunda migration at ExampleCo.')
  expect(state.resume).toEqual({ name: 'CV', text: 'Claims ten years of Rust.' })
  expect(state.link!.baseline.sources).toMatchObject({ persona: 'drafted', glossary: 'drafted' })
  expect(state.link!.baseline.fields.persona).toBe('') // the pack's own value
  expect(JSON.stringify(state.link)).not.toContain('cv.pdf')
  expect((await listApplications()).packs[0].status).toBe('imported')
})

it('creates the job with empty fields when drafting fails', async () => {
  pack('acme-1')
  mock.complete.mockRejectedValue(new Error('500'))
  const preview = await previewApplication(1, 'acme-1')
  expect(preview.draftNotice).toMatch(/could not draft/)
  expect(preview.fields.find((f) => f.key === 'persona')).toMatchObject({
    incoming: { kind: 'text', text: '' },
    source: null,
  })
  const id = await create('acme-1')
  expect(getLocalJobState(id)!.fields.persona).toBe('')
})

it('rejects stale previews: wrong sender, reuse, expiry, changed file or settings', async () => {
  pack('acme-1')
  const a = await previewApplication(1, 'acme-1')
  expect((await applyApplication(2, { token: a.token, name: 'x' })).status).toBe('stale')
  const b = await previewApplication(1, 'acme-1')
  pack('acme-1', { notes: 'Changed' })
  expect((await applyApplication(1, { token: b.token, name: 'x' })).status).toBe('stale')
  const c = await previewApplication(1, 'acme-1')
  mock.settings.resumesNodeExecutable = 'node'
  expect((await applyApplication(1, { token: c.token, name: 'x' })).status).toBe('stale')
  mock.settings.resumesNodeExecutable = 'node.exe'
  const d = await previewApplication(1, 'acme-1')
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now + 11 * 60_000)
  expect((await applyApplication(1, { token: d.token, name: 'x' })).status).toBe('stale')
  vi.restoreAllMocks()
  const e = await previewApplication(1, 'acme-1')
  expect((await applyApplication(1, { token: e.token, name: 'Acme' })).status).toBe('created')
  expect((await applyApplication(1, { token: e.token, name: 'Acme' })).status).toBe('stale')
  expect(listJobs().filter((j) => j.applicationId === 'acme-1')).toHaveLength(1)
})

it('refuses closed packs for creation and a shortened name without acceptance', async () => {
  pack('closed-1', { stage: 'closed' })
  await expect(previewApplication(1, 'closed-1')).rejects.toThrow('closed')
  pack('long-1', { role: 'r'.repeat(200) })
  const preview = await previewApplication(1, 'long-1')
  expect(preview.name).toMatchObject({ shortened: true })
  await expect(applyApplication(1, { token: preview.token })).rejects.toThrow('shortened')
})

it('refreshes with three-way rules, keeps drafted values, and advances the baseline', async () => {
  pack('acme-1', {
    persona: null,
    talkingPoints: 'From prep',
    companyInfo: 'Info',
    glossary: ['Camunda'],
  })
  const id = await create('acme-1')
  const job = getJob(id)!
  updateJob({ ...job, notes: 'My own notes', projectScope: job.projectScope })
  pack('acme-1', {
    persona: null,
    talkingPoints: 'New prep',
    companyInfo: 'Info',
    glossary: ['Camunda'],
    notes: 'Producer notes v2',
    contentHash: 'h2',
  })
  expect((await listApplications()).packs[0].status).toBe('refresh-available')
  const preview = await previewApplication(1, 'acme-1')
  const outcome = (key: string) => preview.fields.find((f) => f.key === key)!.outcome
  expect(preview.mode).toBe('refresh')
  expect(outcome('notes')).toBe('conflict')
  expect(outcome('talkingPoints')).toBe('incoming')
  expect(outcome('persona')).toBe('keep-local') // drafted at import, the pack is still null
  expect(outcome('glossary')).toBe('unchanged')
  expect(await applyApplication(1, { token: preview.token })).toEqual({
    status: 'updated',
    jobId: id,
    archived: false,
  })
  let state = getLocalJobState(id)!
  expect(state.fields).toMatchObject({
    notes: 'My own notes',
    talkingPoints: 'New prep',
    persona: 'Calm and senior.',
  })
  expect(state.link!.baseline.fields.notes).toBe('Producer notes v2')
  expect(state.link!.baseline.sources.persona).toBe('drafted')
  expect((await listApplications()).packs[0].status).toBe('imported')
  const again = await previewApplication(1, 'acme-1')
  expect(again.hasChanges).toBe(false) // the kept local value is not challenged again

  pack('acme-1', {
    persona: null,
    talkingPoints: 'New prep',
    companyInfo: 'Info',
    glossary: ['Camunda'],
    notes: 'v3',
    contentHash: 'h3',
  })
  const third = await previewApplication(1, 'acme-1')
  await applyApplication(1, { token: third.token, choices: { notes: 'incoming' } })
  state = getLocalJobState(id)!
  expect(state.fields.notes).toBe('v3')
})

it('rejects a refresh when the job changed after the preview', async () => {
  pack('acme-1')
  const id = await create('acme-1')
  pack('acme-1', { notes: 'v2', contentHash: 'h2' })
  const preview = await previewApplication(1, 'acme-1')
  sqlite.prepare("INSERT INTO glossary (job_id, term, note) VALUES (?, 'Local', '')").run(id)
  expect((await applyApplication(1, { token: preview.token })).status).toBe('stale')
})

it('offers archiving for a closed application and never unarchives', async () => {
  pack('acme-1')
  const id = await create('acme-1')
  pack('acme-1', { stage: 'closed' })
  expect((await listApplications()).packs[0].status).toBe('archive-available')
  const declined = await previewApplication(1, 'acme-1')
  expect(declined).toMatchObject({
    offerArchive: true,
    stageChange: { from: 'interview', to: 'closed' },
  })
  await applyApplication(1, { token: declined.token, archive: false })
  expect((await listApplications()).packs[0].status).toBe('archive-available') // still offered
  const accepted = await previewApplication(1, 'acme-1')
  expect(await applyApplication(1, { token: accepted.token, archive: true })).toMatchObject({
    archived: true,
  })
  expect(getJob(id)!.archived).toBe(true)
  expect((await listApplications()).packs[0]).toMatchObject({ status: 'imported', archived: true })
  pack('acme-1', { stage: 'offer' })
  const reopened = await previewApplication(1, 'acme-1')
  await applyApplication(1, { token: reopened.token })
  expect(getJob(id)!.archived).toBe(true)
  setJobArchived(id, false)
})

it('refuses to rebind an application imported from another resumes folder', async () => {
  pack('acme-1')
  await create('acme-1')
  const other = mkdtempSync(join(tmpdir(), 'sanas-other-'))
  mkdirSync(join(other, 'job-hunt', 'sanas'), { recursive: true })
  writeFileSync(
    join(other, 'job-hunt', 'sanas', 'acme-1.json'),
    JSON.stringify({
      schemaVersion: 1,
      applicationId: 'acme-1',
      stage: 'interview',
      company: 'Acme',
    }),
  )
  mock.settings.resumesRoot = other
  try {
    expect((await listApplications()).packs[0].status).toBe('source-mismatch')
    await expect(previewApplication(1, 'acme-1')).rejects.toThrow('another resumes folder')
  } finally {
    rmSync(other, { recursive: true, force: true })
  }
})

it('leaves meeting resume snapshots unchanged when a refresh replaces the job resume', async () => {
  pack('acme-1')
  const id = await create('acme-1')
  const meeting = createMeeting(id, 'Interview', {
    resume: { name: 'CV', text: 'Claims ten years of Rust.' },
  })
  pack('acme-1', { resume: { name: 'CV v2', text: 'Rewritten' }, contentHash: 'h2' })
  const preview = await previewApplication(1, 'acme-1')
  await applyApplication(1, { token: preview.token })
  expect(getLocalJobState(id)!.resume).toEqual({ name: 'CV v2', text: 'Rewritten' })
  expect(getMeetingGrounding(meeting).resume).toEqual({
    name: 'CV',
    text: 'Claims ten years of Rust.',
  })
  setJobResume(id, null)
  expect(getMeetingGrounding(meeting).resume).toEqual({
    name: 'CV',
    text: 'Claims ten years of Rust.',
  })
})
