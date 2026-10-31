import { describe, expect, it } from 'vitest'
import {
  MAX_AREA,
  MAX_BYTES,
  MAX_EDGE,
  THUMB_BYTES,
  THUMB_EDGE,
  encodeForAssistant,
  fitSize,
  thumbnailDataUrl,
  type EncodableImage,
} from './encode'

/** A fake image whose encoded size is bytes-per-pixel × area, per format. */
class FakeImage implements EncodableImage {
  resizes: { width: number; height: number }[] = []
  constructor(
    private width: number,
    private height: number,
    private bytes: { png: number; jpeg: (q: number) => number },
    private log: { width: number; height: number }[] = [],
  ) {}
  getSize() {
    return { width: this.width, height: this.height }
  }
  isEmpty() {
    return this.width === 0 || this.height === 0
  }
  resize(o: { width: number; height: number }): this {
    this.log.push({ width: o.width, height: o.height })
    return new FakeImage(o.width, o.height, this.bytes, this.log) as this
  }
  toPNG() {
    return Buffer.alloc(Math.ceil(this.width * this.height * this.bytes.png))
  }
  toJPEG(q: number) {
    return Buffer.alloc(Math.ceil(this.width * this.height * this.bytes.jpeg(q)))
  }
  get resizeLog() {
    return this.log
  }
}

describe('fitSize', () => {
  it('never upscales and keeps small images as they are', () => {
    expect(fitSize({ width: 800, height: 600 }, MAX_EDGE, MAX_AREA)).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('caps the long edge and the area while keeping the aspect ratio', () => {
    const wide = fitSize({ width: 3840, height: 2160 }, MAX_EDGE, MAX_AREA)
    expect(Math.max(wide.width, wide.height)).toBeLessThanOrEqual(MAX_EDGE)
    expect(wide.width * wide.height).toBeLessThanOrEqual(MAX_AREA)
    expect(wide.width / wide.height).toBeCloseTo(16 / 9, 1)
  })

  it('handles portrait displays', () => {
    const tall = fitSize({ width: 1440, height: 2560 }, MAX_EDGE, MAX_AREA)
    expect(tall.height).toBeGreaterThan(tall.width)
    expect(tall.height).toBeLessThanOrEqual(MAX_EDGE)
    expect(tall.width * tall.height).toBeLessThanOrEqual(MAX_AREA)
  })

  it('rejects an empty size', () => {
    expect(() => fitSize({ width: 0, height: 10 }, MAX_EDGE)).toThrow('empty')
  })
})

describe('encodeForAssistant', () => {
  it('prefers PNG when it fits under the byte ceiling', () => {
    const img = new FakeImage(1200, 800, { png: 1, jpeg: () => 0.5 })
    const out = encodeForAssistant(img)
    expect(out.image.mediaType).toBe('image/png')
    expect(out).toMatchObject({ width: 1200, height: 800, bytes: 960_000 })
    expect(img.resizeLog).toEqual([]) // within limits: no resize at all
  })

  it('falls back to JPEG 85, then 75', () => {
    const seen: number[] = []
    const img = new FakeImage(1200, 800, {
      png: 4,
      jpeg: (q) => {
        seen.push(q)
        return q === 85 ? 3 : 1
      },
    })
    const out = encodeForAssistant(img)
    expect(out.image.mediaType).toBe('image/jpeg')
    expect(seen).toEqual([85, 75])
    expect(out.bytes).toBeLessThanOrEqual(MAX_BYTES)
  })

  it('downscales a bounded number of times, then rejects', () => {
    const shrinks = new FakeImage(1200, 800, { png: 10, jpeg: () => 3 })
    const out = encodeForAssistant(shrinks)
    expect(out.width).toBe(900) // the first extra step (0.75)
    const hopeless = new FakeImage(1200, 800, { png: 50, jpeg: () => 40 })
    expect(() => encodeForAssistant(hopeless)).toThrow('too detailed')
  })

  it('sizes from the actual image, not the size that was requested', () => {
    const img = new FakeImage(5120, 2880, { png: 1, jpeg: () => 1 })
    const out = encodeForAssistant(img)
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(MAX_EDGE)
    expect(out.width * out.height).toBeLessThanOrEqual(MAX_AREA)
  })

  it('rejects an empty capture', () => {
    expect(() => encodeForAssistant(new FakeImage(0, 0, { png: 1, jpeg: () => 1 }))).toThrow(
      'empty',
    )
  })
})

describe('thumbnailDataUrl', () => {
  it('is a bounded local data URL', () => {
    const url = thumbnailDataUrl(new FakeImage(2560, 1440, { png: 0.5, jpeg: () => 0.2 }))
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    const bytes = Buffer.from(url.split(',')[1], 'base64').length
    expect(bytes).toBeLessThanOrEqual(THUMB_BYTES)
  })

  it('switches to JPEG to stay under the byte cap', () => {
    const img = new FakeImage(2560, 1440, { png: 3, jpeg: (q) => (q >= 80 ? 2 : 1) })
    const url = thumbnailDataUrl(img)
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(img.resizeLog[0].width).toBe(THUMB_EDGE)
  })
})
