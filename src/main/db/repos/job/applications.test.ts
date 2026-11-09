import { afterEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../../migrations'
import { createJob, listJobs, setJobArchived } from './jobs'
import {
  applyApplicationRefresh,
  createJobFromApplication,
  emptyBaseline,
  getApplicationLink,
  getLocalJobState,
  listApplicationLinks,
  parseBaseline,
  type CreateFromApplication,
  type LinkWrite,
} from './applications'

let sqlite: DatabaseSync
function database(): void {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
}
afterEach(() => sqlite?.close())

const fields = {
  companyInfo: 'Acme builds rockets',
  projectScope: 'Platform engineer',
  notes: 'Led a Camunda migration at ExampleCo',
  talkingPoints: '',
  persona: 'Calm',
}
function linkWrite(over: Partial<LinkWrite> = {}): LinkWrite {
  return {
    applicationId: 'acme-1',
    sourceRoot: '/resumes',
    contentHash: 'h1',
    fingerprint: 'f1',
    stage: 'interview',
    sourceUpdatedAt: '2026-11-01T00:00:00Z',
    baseline: { ...emptyBaseline(), fields: { ...fields }, glossary: ['Camunda'] },
    ...over,
  }
}
function input(over: Partial<CreateFromApplication> = {}): CreateFromApplication {
  return {
    name: 'Acme — Platform engineer',
    fields,
    glossary: ['Camunda', 'Kotlin'],
    resume: { name: 'CV', text: 'Resume text' },
    link: linkWrite(),
    ...over,
  }
}
const count = (table: string): number =>
  (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

it('creates the job, glossary, resume, link and baseline together', () => {
  database()
  const id = createJobFromApplication(input())
  const state = getLocalJobState(id)!
  expect(state.name).toBe('Acme — Platform engineer')
  expect(state.fields).toEqual(fields)
  expect(state.glossary.map((g) => g.term)).toEqual(['Camunda', 'Kotlin'])
  expect(state.resume).toEqual({ name: 'CV', text: 'Resume text' })
  expect(state.link).toMatchObject({
    applicationId: 'acme-1',
    sourceRoot: '/resumes',
    stage: 'interview',
  })
  expect(state.link!.baseline.glossary).toEqual(['Camunda'])
  expect(listJobs().find((j) => j.id === id)?.applicationId).toBe('acme-1')
})

it('rolls back everything when the glossary or resume write fails', () => {
  database()
  expect(() =>
    createJobFromApplication(input({ resume: { name: 'CV', text: 'x'.repeat(40_001) } })),
  ).toThrow()
  expect(() => createJobFromApplication(input({ glossary: [null as unknown as string] }))).toThrow()
  for (const table of ['jobs', 'glossary', 'job_resumes', 'job_applications'])
    expect(count(table)).toBe(0)
})

it('refuses a duplicate import, archived jobs included', () => {
  database()
  const id = createJobFromApplication(input())
  setJobArchived(id, true)
  expect(() => createJobFromApplication(input())).toThrow('already been imported')
  expect(count('jobs')).toBe(1)
  expect(getApplicationLink('acme-1')).toMatchObject({ jobId: id, archived: true })
  expect(listApplicationLinks()).toHaveLength(1)
})

it('applies a refresh atomically and advances the baseline; archive never unarchives', () => {
  database()
  const id = createJobFromApplication(input())
  sqlite.prepare("UPDATE glossary SET note = 'mine' WHERE term = 'Kotlin'").run()
  const next = linkWrite({
    contentHash: 'h2',
    fingerprint: 'f2',
    stage: 'closed',
    baseline: { ...emptyBaseline(), fields: { ...fields, notes: 'New notes' } },
  })
  applyApplicationRefresh({
    jobId: id,
    fields: { notes: 'New notes' },
    glossary: ['Camunda'],
    resume: null,
    archive: true,
    link: next,
  })
  const state = getLocalJobState(id)!
  expect(state.fields.notes).toBe('New notes')
  expect(state.fields.persona).toBe('Calm')
  expect(state.glossary).toEqual([{ term: 'Camunda', note: '' }])
  expect(state.resume).toBeNull()
  expect(state.archived).toBe(true)
  expect(state.link).toMatchObject({ contentHash: 'h2', fingerprint: 'f2', stage: 'closed' })
  expect(state.link!.baseline.fields.notes).toBe('New notes')
})

it('rolls a failed refresh back and refuses an unlinked job', () => {
  database()
  const id = createJobFromApplication(input())
  expect(() =>
    applyApplicationRefresh({
      jobId: id,
      fields: { notes: 'Changed' },
      resume: { name: 'CV', text: 'x'.repeat(40_001) },
      archive: false,
      link: linkWrite({ fingerprint: 'f2' }),
    }),
  ).toThrow()
  expect(getLocalJobState(id)!.fields.notes).toBe(fields.notes)
  expect(getLocalJobState(id)!.link!.fingerprint).toBe('f1')
  const plain = createJob('Plain').id
  expect(() =>
    applyApplicationRefresh({ jobId: plain, fields: {}, archive: false, link: linkWrite() }),
  ).toThrow('not linked')
})

it('reads a malformed stored baseline as empty rather than failing', () => {
  database()
  expect(parseBaseline('not json')).toEqual(emptyBaseline())
  expect(parseBaseline('{"version":2}')).toEqual(emptyBaseline())
  expect(
    parseBaseline(
      '{"version":1,"fields":{"notes":"n"},"glossary":["a",3],"sources":{"persona":"drafted","x":"y"}}',
    ),
  ).toMatchObject({ fields: { notes: 'n' }, glossary: ['a'], sources: { persona: 'drafted' } })
})
