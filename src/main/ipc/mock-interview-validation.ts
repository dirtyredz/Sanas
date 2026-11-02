import type { MockPlanId } from '@shared/mock-interview/types'
import { requireId } from './validate'
export function mockStartInput(
  plan: unknown,
  job: unknown,
  channels: unknown,
): { plan: MockPlanId; job: number; channels: 2 } {
  if (plan !== 'interview' && plan !== 'client-qa') throw new Error('Unknown mock interview plan')
  if (channels !== 2)
    throw new Error('Mock interviews require microphone and system audio (This PC).')
  return { plan, job: requireId(job, 'job id'), channels }
}
