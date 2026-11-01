import { describe, expect, it } from 'vitest'
import { pageDirection } from './page-order'

const order = ['a', 'b', 'c', 'd'] as const

describe('pageDirection', () => {
  it('is forward going down the list, however far', () => {
    expect(pageDirection(order, 'a', 'b')).toBe('forward')
    expect(pageDirection(order, 'a', 'd')).toBe('forward')
  })

  it('is back going up the list', () => {
    expect(pageDirection(order, 'c', 'b')).toBe('back')
    expect(pageDirection(order, 'd', 'a')).toBe('back')
  })

  it('is none for the same page or an unknown one', () => {
    expect(pageDirection(order, 'b', 'b')).toBe('none')
    expect(pageDirection<string>(order, 'a', 'zzz')).toBe('none')
  })
})
