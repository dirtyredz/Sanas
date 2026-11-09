import { expect, it } from 'vitest'
import { stageCapabilities } from './application-stage'

it('an open application with no job can be created and listed', () =>
  expect(stageCapabilities('interview', null)).toEqual({
    visible: true,
    create: true,
    refresh: false,
    archive: false,
  }))

it('an open application with a job refreshes and never archives', () =>
  expect(stageCapabilities('offer', { archived: false })).toEqual({
    visible: true,
    create: false,
    refresh: true,
    archive: false,
  }))

it('a closed application with no job is hidden and cannot create', () =>
  expect(stageCapabilities('closed', null)).toEqual({
    visible: false,
    create: false,
    refresh: false,
    archive: false,
  }))

it('a closed application archives its job once, then offers nothing', () => {
  expect(stageCapabilities('closed', { archived: false })).toEqual({
    visible: true,
    create: false,
    refresh: false,
    archive: true,
  })
  expect(stageCapabilities('closed', { archived: true }).archive).toBe(false)
})
