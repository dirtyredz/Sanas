import interview from './plans/interview.json'
import client from './plans/client-qa.json'
import architecture from './fixtures/architecture.png?asset'
import boundary from './fixtures/coding-boundary.png?asset'
import duplicates from './fixtures/coding-duplicates.png?asset'
import sql from './fixtures/coding-sql.png?asset'
import dashboard from './fixtures/dashboard.png?asset'
import type { MockPlanId } from '@shared/mock-interview/types'
import type { LivePlan } from './plan'
import { readFileSync } from 'node:fs'

const fixtures: Record<string, string> = {
  'architecture.png': architecture,
  'coding-boundary.png': boundary,
  'coding-duplicates.png': duplicates,
  'coding-sql.png': sql,
  'dashboard.png': dashboard,
}
export const plans: Record<MockPlanId, LivePlan> = {
  interview: interview as LivePlan,
  'client-qa': client as LivePlan,
}
export function fixtureData(name: string): string {
  const path = fixtures[name.replace('../fixtures/', '')]
  if (!path) throw new Error('Unknown mock interview screen')
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`
}
