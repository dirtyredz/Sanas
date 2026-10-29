import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WHISPER_RATIO,
  MIN_TRANSCRIPT_HEIGHT,
  MIN_WHISPER_HEIGHT,
  SPLITTER_HEIGHT,
  overlaySplit,
  whisperRatioFromHeight,
} from './overlay-split'

describe('overlay split', () => {
  it('keeps the requested whisper share as the window grows', () => {
    const initial = overlaySplit(420, DEFAULT_WHISPER_RATIO)
    const grown = overlaySplit(720, initial.ratio)

    expect(initial.transcriptHeight + initial.whisperHeight + SPLITTER_HEIGHT).toBe(420)
    expect(grown.transcriptHeight + grown.whisperHeight + SPLITTER_HEIGHT).toBe(720)
    expect(grown.ratio).toBeCloseTo(initial.ratio, 2)
  })

  it('clamps both panels to their minimum heights', () => {
    const whisperSmall = overlaySplit(500, 0)
    expect(whisperSmall.whisperHeight).toBe(MIN_WHISPER_HEIGHT)

    const transcriptSmall = overlaySplit(500, 1)
    expect(transcriptSmall.transcriptHeight).toBe(MIN_TRANSCRIPT_HEIGHT)
  })

  it('clamps dragged pixels and returns the effective ratio', () => {
    expect(whisperRatioFromHeight(500, 10)).toBeCloseTo(
      MIN_WHISPER_HEIGHT / (500 - SPLITTER_HEIGHT),
    )
    expect(whisperRatioFromHeight(500, 490)).toBeCloseTo(
      (500 - SPLITTER_HEIGHT - MIN_TRANSCRIPT_HEIGHT) / (500 - SPLITTER_HEIGHT),
    )
  })
})
