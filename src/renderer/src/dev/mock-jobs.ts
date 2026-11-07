// Browser-preview mocks for job deletion and New job from application.
import type { MeetingResume } from '@shared/meeting-resume'
import {
  STALE_PREVIEW_MESSAGE,
  type ApplicationListing,
  type ApplicationPreview,
  type ApplicationRowStatus,
  type ApplicationSummary,
  type ApplyResult,
  type FieldOutcome,
  type ImportFieldKey,
  type JobTextField,
  type PreviewField,
  type PreviewValue,
} from '@shared/jobs/applications'
import type {
  JobDeletionCounts,
  JobDeletionPreview,
  JobDeletionResult,
} from '@shared/jobs/deletion'
import { glossary, jobs, meetings, samplePacks, segments, suggestions } from './mock-fixtures'

type SanasApi = Window['sanas']

const deletionTokens = new Map<string, { jobId: number; counts: JobDeletionCounts }>()
const previewTokens = new Map<string, ApplicationPreview>()

/** A typed preview value built from the mock's plain strings. */
function previewValue(key: ImportFieldKey, value: string): PreviewValue {
  if (key === 'glossary')
    return {
      kind: 'glossary',
      terms: value
        .split('\n')
        .filter(Boolean)
        .map((term) => ({ term, note: '' })),
    }
  if (key === 'resume')
    return { kind: 'resume', resume: value ? { name: 'Resume', text: value } : null }
  return { kind: 'text', text: value }
}

/** The plain string a typed preview value stands for in the mock's store. */
function plainValue(value: PreviewValue): string {
  if (value.kind === 'glossary') return value.terms.map((g) => g.term).join('\n')
  if (value.kind === 'resume') return value.resume?.text ?? ''
  return value.text
}

function removeFrom<T>(items: T[], match: (item: T) => boolean): void {
  for (let i = items.length - 1; i >= 0; i--) if (match(items[i])) items.splice(i, 1)
}

function countJobDeletion(
  jobId: number,
  jobResumes: Map<number, MeetingResume>,
): JobDeletionCounts {
  const own = meetings.filter((m) => m.jobId === jobId)
  const ids = new Set(own.map((m) => m.id))
  return {
    meetings: own.filter((m) => !m.practice).length,
    practiceSessions: own.filter((m) => m.practice).length,
    transcriptSegments: segments.filter((s) => ids.has(s.meetingId)).length,
    summaries: own.filter((m) => !!m.summary).length,
    suggestions: suggestions.filter((s) => ids.has(s.meetingId)).length,
    recordings: own.filter((m) => !!m.audioPath).length,
    glossaryTerms: glossary.filter((g) => g.jobId === jobId).length,
    resumes: jobResumes.has(jobId) ? 1 : 0,
    applicationLinks: jobs.find((j) => j.id === jobId)?.applicationId ? 1 : 0,
    legacySlides: 0,
  }
}

/** One listing row for a sample pack, linked to whichever job carries its application ID. */
function applicationRow(applicationId: string, status: ApplicationRowStatus): ApplicationSummary {
  const pack = samplePacks[applicationId]
  const job = jobs.find((j) => j.applicationId === applicationId)
  return {
    applicationId,
    company: pack.company,
    role: pack.role,
    stage: pack.stage,
    updatedAt: pack.updatedAt,
    status,
    jobId: job?.id ?? null,
    jobName: job?.name ?? null,
    archived: job?.archived ?? false,
    error: null,
    retryable: false,
  }
}

export function mockJobDeletion(
  jobResumes: Map<number, MeetingResume>,
): Pick<SanasApi['jobs'], 'deletePreview' | 'delete'> {
  return {
    deletePreview: async (jobId): Promise<JobDeletionPreview> => {
      const job = jobs.find((j) => j.id === jobId)
      const counts = countJobDeletion(jobId, jobResumes)
      if (!job) {
        return {
          jobId,
          jobName: '',
          counts,
          blocked: { reason: 'missing', message: 'That job no longer exists.' },
          token: null,
        }
      }
      if (job.id === 1 || job.name === 'Unsorted') {
        return {
          jobId,
          jobName: job.name,
          counts,
          blocked: {
            reason: 'protected',
            message: 'Unsorted holds meetings started without a job, so it cannot be deleted.',
          },
          token: null,
        }
      }
      const token = crypto.randomUUID()
      deletionTokens.set(token, { jobId, counts })
      return { jobId, jobName: job.name, counts, blocked: null, token }
    },
    delete: async (token): Promise<JobDeletionResult> => {
      const pending = deletionTokens.get(token)
      deletionTokens.delete(token)
      if (!pending) {
        return {
          status: 'stale',
          message: 'This job changed since you confirmed — review the counts again.',
        }
      }
      const { jobId, counts } = pending
      removeFrom(jobs, (j) => j.id === jobId)
      removeFrom(meetings, (m) => m.jobId === jobId)
      removeFrom(glossary, (g) => g.jobId === jobId)
      jobResumes.delete(jobId)
      return {
        status: 'deleted',
        backupPath:
          'C:\\Users\\you\\AppData\\Roaming\\sanas\\backups\\before-job-delete-preview.db',
        removed: counts,
      }
    },
  }
}

export function mockJobApplications(
  jobResumes: Map<number, MeetingResume>,
): SanasApi['jobApplications'] {
  return {
    list: async (): Promise<ApplicationListing> => ({
      sourceRoot: 'C:\\Users\\dirty\\projects\\resumes',
      refresh: {
        ok: false,
        message: 'The resumes pack command is missing (_hunt/cli/sanas-packs.js).',
      },
      folder: 'ok',
      folderError: null,
      limited: false,
      packs: [
        applicationRow('initech-sre', 'new'),
        applicationRow('acme-platform', 'imported'),
        applicationRow('globex-closed', 'imported'),
        applicationRow('umbrella-closed', 'closed-unlinked'),
        {
          applicationId: 'broken-pack',
          company: '',
          role: '',
          stage: null,
          updatedAt: null,
          status: 'invalid',
          jobId: null,
          jobName: null,
          archived: false,
          error: 'The pack is not valid JSON.',
          retryable: false,
        },
      ],
    }),
    preview: async (applicationId): Promise<ApplicationPreview> => {
      const pack = samplePacks[applicationId]
      const job = jobs.find((j) => j.applicationId === applicationId)
      if (!pack) throw new Error('That application is not in the resumes folder.')
      const base = {
        token: crypto.randomUUID(),
        applicationId,
        company: pack.company,
        role: pack.role,
        stage: pack.stage,
        jdUrl: pack.jdUrl,
        updatedAt: pack.updatedAt,
        glossaryExcluded: [],
        normalized: [],
        draftNotice: null,
      }
      let preview: ApplicationPreview
      if (job) {
        const closedActive = pack.stage === 'closed' && !job.archived
        const local = (key: JobTextField): string => job[key]
        const field = (key: ImportFieldKey, outcome: FieldOutcome, from: string, to: string) => ({
          key,
          outcome,
          local: previewValue(key, from),
          incoming: previewValue(key, to),
          source: 'resumes' as const,
          editable: false,
          draftError: null,
        })
        const terms = glossary
          .filter((g) => g.jobId === job.id)
          .map((g) => g.term)
          .join('\n')
        const savedResume = jobResumes.get(job.id)?.text ?? ''
        preview = {
          ...base,
          mode: 'refresh',
          jobId: job.id,
          name: null,
          fields: [
            field('companyInfo', 'unchanged', local('companyInfo'), local('companyInfo')),
            field('projectScope', 'unchanged', local('projectScope'), local('projectScope')),
            field('notes', 'conflict', local('notes') || 'Edited in Sanas.', pack.notes),
            field('talkingPoints', 'incoming', local('talkingPoints'), pack.talkingPoints),
            field('persona', 'unchanged', local('persona'), local('persona')),
            field('glossary', 'unchanged', terms, terms),
            field('resume', 'unchanged', savedResume, savedResume),
          ],
          stageChange: pack.stage === 'closed' ? { from: 'interview', to: 'closed' } : null,
          offerArchive: closedActive,
          archived: job.archived,
          hasChanges: true,
        }
      } else if (pack.stage === 'closed') {
        throw new Error('This application is closed, so it cannot create a new job.')
      } else {
        const drafted = (key: ImportFieldKey, text: string): PreviewField => ({
          key,
          outcome: 'new',
          local: null,
          incoming: previewValue(key, text),
          source: 'drafted',
          editable: true,
          draftError: null,
        })
        const fromPack = (key: ImportFieldKey, text: string): PreviewField => ({
          ...drafted(key, text),
          source: 'resumes',
          editable: false,
        })
        preview = {
          ...base,
          mode: 'create',
          jobId: null,
          name: { proposed: `${pack.company} — ${pack.role}`, shortened: false },
          fields: [
            {
              ...drafted('companyInfo', ''),
              source: null,
              draftError: 'Sanas had nothing grounded to draft here.',
            },
            fromPack('projectScope', pack.projectScope),
            fromPack('notes', pack.notes),
            drafted(
              'talkingPoints',
              'Reliability wins: lower paging load, error budgets. Ask how on-call is shared.',
            ),
            drafted('persona', 'Calm and methodical; lead with measurements.'),
            drafted('glossary', 'Kubernetes\nTerraform'),
            fromPack('resume', pack.resume),
          ],
          stageChange: null,
          offerArchive: false,
          archived: false,
          hasChanges: true,
          draftNotice: 'Some empty fields could not be drafted. Fill them in, or leave them empty.',
        }
      }
      previewTokens.set(preview.token, preview)
      return preview
    },
    apply: async (request): Promise<ApplyResult> => {
      const preview = previewTokens.get(request.token)
      previewTokens.delete(request.token)
      if (!preview) return { status: 'stale', message: STALE_PREVIEW_MESSAGE }
      const value = (key: ImportFieldKey): string => {
        const f = preview.fields.find((x) => x.key === key)
        const edited = key === 'resume' ? undefined : request.edits?.[key]
        return edited ?? (f ? plainValue(f.incoming) : '')
      }
      if (preview.mode === 'create') {
        const id = Date.now()
        jobs.push({
          id,
          name: request.name ?? preview.name?.proposed ?? preview.company,
          companyInfo: value('companyInfo'),
          projectScope: value('projectScope'),
          notes: value('notes'),
          talkingPoints: value('talkingPoints'),
          persona: value('persona'),
          summaryEmail: '',
          createdAt: new Date().toISOString(),
          archived: false,
          applicationId: preview.applicationId,
        })
        value('glossary')
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean)
          .forEach((term, i) => glossary.push({ id: id + i, jobId: id, term, note: '' }))
        if (value('resume')) jobResumes.set(id, { name: 'Resume', text: value('resume') })
        return { status: 'created', jobId: id }
      }
      const job = jobs.find((j) => j.id === preview.jobId)
      if (!job) return { status: 'stale', message: STALE_PREVIEW_MESSAGE }
      for (const f of preview.fields) {
        const takeIncoming =
          f.outcome === 'incoming' ||
          (f.outcome === 'conflict' && request.choices?.[f.key] === 'incoming')
        if (takeIncoming && f.key !== 'glossary' && f.key !== 'resume')
          job[f.key] = plainValue(f.incoming)
      }
      if (request.archive) job.archived = true
      return { status: 'updated', jobId: job.id, archived: job.archived }
    },
  }
}
