import { expect, it } from 'vitest'
import { PcmBacklog } from './pcm-backlog'

it('owns bytes, preserves positions and rejects overflow without dropping a slice', () => {
  const queue = new PcmBacklog(6)
  const input = Buffer.from([1, 2, 3, 4])
  expect(queue.push(input, 17)).toBe(true)
  input.fill(9)
  expect(queue.push(Buffer.from([5, 6]), 21)).toBe(true)
  expect(queue.push(Buffer.from([7]), 23)).toBe(false)
  expect(queue.peek()).toEqual({ start: 17, pcm: Buffer.from([1, 2, 3, 4]) })
  queue.shift()
  expect(queue.peek()).toEqual({ start: 21, pcm: Buffer.from([5, 6]) })
  queue.clear()
  expect(queue.peek()).toBeUndefined()
  expect(queue.push(Buffer.alloc(6), 24)).toBe(true)
})
