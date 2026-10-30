import { expect, it, vi } from 'vitest'
import type { AssistRequest } from '../../assistant/types'
const f = vi.hoisted(() => ({
  request: null as AssistRequest | null,
  history: {
    slides: [
      {
        title: 'Recorded title',
        talkingPoint: 'prepared',
        script: 'UNSPOKEN_SCRIPT',
        keyFacts: '',
      },
    ],
    events: [{ ordinal: 0, revision: 1, tMs: 0 }],
  },
}))
vi.mock('../../../config/settings', () => ({
  loadSettings: () => ({ anthropicApiKey: 'key', answerModel: 'model' }),
}))
vi.mock('../../../db/repos/meetings', () => ({
  getMeeting: () => ({ id: 1, jobId: 2 }),
  updateMeetingSummary: vi.fn(),
}))
vi.mock('../../../db/repos/segments', () => ({
  listSegments: () =>
    Array.from({ length: 5 }, (_, i) => ({
      speaker: 0,
      isUser: true,
      text: `Actual statement ${i}`,
      tStartMs: i * 1000,
      tEndMs: i * 1000 + 500,
    })),
}))
vi.mock('../../../db/repos/jobs', () => ({ getJob: () => null, listGlossary: () => [] }))
vi.mock('../../../db/repos/speakers', () => ({ speakerNameMap: () => new Map() }))
vi.mock('../../../db/repos/meeting-presentation', () => ({
  getPresentationHistory: () => f.history,
}))
vi.mock('../status/post-processing', () => ({
  whilePostProcessing: (_id: number, run: () => Promise<unknown>) => run(),
}))
vi.mock('../../assistant/claude', () => ({
  claudeProvider: {
    complete: async (request: AssistRequest) => {
      f.request = request
      return 'Summary'
    },
  },
}))
import { summarizeStoredMeeting } from './summarize'

it('regenerates using recorded titles and actual timestamped speech, never prepared scripts', async () => {
  await summarizeStoredMeeting(1)
  expect(f.request?.userContent).toContain('Slide 1 — Recorded title')
  expect(f.request?.userContent).toContain('[0:04] Me: Actual statement 4')
  expect(f.request?.userContent).toContain('not spoken statements')
  expect((f.request?.system ?? '') + f.request?.userContent).not.toContain('UNSPOKEN_SCRIPT')
})
