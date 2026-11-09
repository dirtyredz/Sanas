import { expect, it } from 'vitest'
import { comparisonPlan, compareProfiles } from './comparison'

it('matches every question and alternates profile order for at least three repeats', () => {
  const plan = comparisonPlan()
  expect(plan).toHaveLength(24)
  for (let i = 0; i < plan.length; i += 2) {
    expect(plan[i].text).toBe(plan[i + 1].text)
    expect(plan[i].profile).not.toBe(plan[i + 1].profile)
  }
  expect(plan[0].profile).not.toBe(plan[8].profile)
  expect(() => comparisonPlan(2)).toThrow('Repeats must be 3..10')
})

it('runs all matched requests through the canned rehearsal provider with effective profiles', async () => {
  const report = await compareProfiles()
  expect(report.assistant).toBe('canned')
  expect(report.samples).toHaveLength(24)
  expect(report.samples[0]).toMatchObject({
    profile: 'full',
    outcome: 'done',
    cacheObserved: 'unknown',
    timing: {
      effective: { profile: 'full', model: 'claude-opus-5-5', maxTokens: 1200, effort: 'medium' },
    },
  })
  expect(report.samples[1]).toMatchObject({
    profile: 'smart',
    timing: { effective: { profile: 'smart', maxTokens: 500, effort: 'low' } },
  })
})
