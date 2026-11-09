import { describe, expect, it, vi } from 'vitest'
import type { DiscardReason } from '../../observation/diagnostics'
import type { CompletedTurn } from '../../../turns/types'
import type { SuggestionRequest } from '../suggestion/suggestion-runner'
import { discardCategory, SpeculativeAnswer } from './speculative-answer'

describe('SpeculativeAnswer.admit', () => {
  const turn = { id: 1 } as CompletedTurn
  const request = { model: 'm' } as SuggestionRequest
  function setup(opts: { free: boolean; promotes?: boolean }) {
    const handle = { id: 7, promote: vi.fn(() => opts.promotes ?? true), cancel: vi.fn() }
    let free = opts.free
    const runner = { canStart: vi.fn(() => free), speculate: vi.fn(() => handle) }
    return {
      spec: new SpeculativeAnswer(runner as never),
      handle,
      setFree: (v: boolean) => (free = v),
    }
  }

  it('is busy without a speculation when the ambient lane is taken', () => {
    const { spec } = setup({ free: false })
    expect(spec.admit(turn, request)).toEqual({ lane: 'busy' })
  })

  it('is ordinary without a speculation when the lane is free', () => {
    const { spec } = setup({ free: true })
    expect(spec.admit(turn, request)).toEqual({ lane: 'ordinary' })
  })

  it('promotes the same request even though its own run holds the lane', () => {
    const { spec, handle, setFree } = setup({ free: true })
    spec.begin(turn, request)
    setFree(false)
    expect(spec.admit(turn, request)).toEqual({ lane: 'promoted', handle })
  })

  it('discards a changed prompt and goes ordinary once the lane is free', () => {
    const { spec, handle } = setup({ free: true })
    spec.begin(turn, request)
    expect(spec.admit(turn, { model: 'other' } as SuggestionRequest)).toEqual({ lane: 'ordinary' })
    expect(handle.cancel).toHaveBeenCalled()
  })

  it('discards for no meeting and reports ordinary with nothing to start', () => {
    const { spec, handle } = setup({ free: true })
    spec.begin(turn, request)
    expect(spec.admit(turn, null)).toEqual({ lane: 'ordinary' })
    expect(handle.cancel).toHaveBeenCalled()
  })

  it('is busy when the speculation ended unpublished and the lane is still taken', () => {
    const { spec, setFree } = setup({ free: true, promotes: false })
    spec.begin(turn, request)
    setFree(false)
    expect(spec.admit(turn, request)).toEqual({ lane: 'busy' })
  })
})

describe('discardCategory', () => {
  it.each<[DiscardReason, string]>([
    ['prompt-changed', 'prompt-changed'],
    ['verdict none', 'rejected'],
    ['verdict question other', 'rejected'],
    ['verdict timeout', 'classifier-failed'],
    ['verdict cancelled', 'classifier-failed'],
    ['verdict malformed', 'classifier-failed'],
    ['verdict provider', 'classifier-failed'],
    ['new-final', 'overtaken'],
    ['user-final', 'overtaken'],
    ['stop-or-pause', 'invalidated'],
    ['identity-change', 'invalidated'],
    ['ended-before-verdict', 'ended-before-verdict'],
    ['not-generated', 'not-generated'],
    ['no-snapshot', 'no-snapshot'],
  ])('discard reason %j is category %j', (reason, category) => {
    expect(discardCategory(reason)).toBe(category)
  })
})
