// Browser-preview mock for New job from application / Refresh from application.
import { CLOSED_CREATE_MESSAGE, stageCapabilities } from '@shared/jobs/application-stage'
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
import { glossary, jobs, samplePacks } from '../mock-fixtures'

type SanasApi = Window['sanas']

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
          offerArchive: stageCapabilities(pack.stage, job).archive,
          archived: job.archived,
          hasChanges: true,
        }
      } else if (!stageCapabilities(pack.stage, null).create) {
        throw new Error(CLOSED_CREATE_MESSAGE)
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
      if (request.archive && preview.offerArchive) job.archived = true
      return { status: 'updated', jobId: job.id, archived: job.archived }
    },
  }
}
