import interview from './plans/interview.json'
import client from './plans/client-qa.json'
import architecture from './fixtures/architecture.png?asset'
import boundary from './fixtures/coding-boundary.png?asset'
import duplicates from './fixtures/coding-duplicates.png?asset'
import sql from './fixtures/coding-sql.png?asset'
import dashboard from './fixtures/dashboard.png?asset'
import type { MockPlanId } from '@shared/mock-interview/types'
import { validatePlan, type LivePlan, type FixtureId } from './plan'
import { readFileSync } from 'node:fs'

const fixtures: Record<FixtureId, string> = {
  architecture: architecture,
  'coding-boundary': boundary,
  'coding-duplicates': duplicates,
  'coding-sql': sql,
  dashboard: dashboard,
}
export const plans: Record<MockPlanId, LivePlan> = {
  interview: validatePlan(interview),
  'client-qa': validatePlan(client),
}
export function fixtureData(name: string): string {
  const path = fixtures[name as FixtureId]
  if (!path) throw new Error('Unknown mock interview screen')
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`
}
