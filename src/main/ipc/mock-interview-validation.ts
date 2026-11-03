import type { MockPlanId } from '@shared/mock-interview/types'
import { requireId } from './validate'
import type { MeetingResume } from '@shared/meeting-resume'
import { validateResume } from '../services/meetings/context/resume/resume'
export function mockStartInput(
  plan: unknown,
  job: unknown,
  channels: unknown,
  resume?: unknown,
): { plan: MockPlanId; job: number; channels: 2; resume: MeetingResume | null } {
  if (plan !== 'interview' && plan !== 'client-qa') throw new Error('Unknown mock interview plan')
  if (channels !== 2)
    throw new Error('Mock interviews require microphone and system audio (This PC).')
  return { plan, job: requireId(job, 'job id'), channels, resume: validateResume(resume) }
}
