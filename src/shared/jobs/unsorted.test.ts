import { expect, it } from 'vitest'
import { isUnsortedJob, reservedNameError } from './unsorted'

it('identifies the bucket by its reserved name only', () => {
  expect(isUnsortedJob({ name: 'Unsorted' })).toBe(true)
  expect(isUnsortedJob({ name: 'Unsorted call' })).toBe(false)
})

it('reserves the name for the bucket and keeps the bucket from being renamed', () => {
  expect(reservedNameError('Acme', null)).toBeNull()
  expect(reservedNameError(' Unsorted ', null)).toMatch(/reserved/)
  expect(reservedNameError('Unsorted', { name: 'Acme' })).toMatch(/reserved/)
  expect(reservedNameError('Acme 2', { name: 'Acme' })).toBeNull()
  expect(reservedNameError('Unsorted', { name: 'Unsorted' })).toBeNull()
  expect(reservedNameError('Other', { name: 'Unsorted' })).toMatch(/cannot be renamed/)
})
