import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANSWER_RATIO,
  DIVIDER_HEIGHT,
  MIN_PREVIEW_HEIGHT,
  MIN_WORKSPACE_HEIGHT,
  answerRatioFromHeight,
  overlaySplit,
} from './overlay-split'

describe('overlay split', () => {
  it('gives the default window a ~110 DIP answer preview', () => {
    const split = overlaySplit(418, DEFAULT_ANSWER_RATIO)
    expect(split.previewHeight).toBeGreaterThanOrEqual(105)
    expect(split.previewHeight).toBeLessThanOrEqual(130)
  })

  it('keeps the requested answer share as the window grows', () => {
    const initial = overlaySplit(420, 0.4)
    const grown = overlaySplit(720, initial.ratio)
    expect(initial.previewHeight + initial.workspaceHeight + DIVIDER_HEIGHT).toBe(420)
    expect(grown.previewHeight + grown.workspaceHeight + DIVIDER_HEIGHT).toBe(720)
    expect(grown.ratio).toBeCloseTo(initial.ratio, 2)
  })

  it('clamps both panes to their minimum heights', () => {
    expect(overlaySplit(500, 0).previewHeight).toBe(MIN_PREVIEW_HEIGHT)
    expect(overlaySplit(500, 1).workspaceHeight).toBe(MIN_WORKSPACE_HEIGHT)
    expect(overlaySplit(500, Number.NaN).ratio).toBeCloseTo(DEFAULT_ANSWER_RATIO, 1)
  })

  it('shares a minimum-size window proportionally, keeping a compact preview', () => {
    const tiny = overlaySplit(180, 0.9)
    expect(tiny.previewHeight + tiny.workspaceHeight + DIVIDER_HEIGHT).toBe(180)
    expect(tiny.previewHeight).toBeGreaterThan(70)
  })

  it('clamps dragged pixels and returns the effective ratio', () => {
    expect(answerRatioFromHeight(500, 10)).toBeCloseTo(MIN_PREVIEW_HEIGHT / (500 - DIVIDER_HEIGHT))
    expect(answerRatioFromHeight(500, 490)).toBeCloseTo(
      (500 - DIVIDER_HEIGHT - MIN_WORKSPACE_HEIGHT) / (500 - DIVIDER_HEIGHT),
    )
  })
})
