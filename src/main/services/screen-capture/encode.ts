import type { AssistImage } from '../assistant/types'

// Sizing and encoding of one captured screen: what is sent to the assistant, and the bounded
// thumbnail the overlay may show. Pure apart from the image methods it is handed, so it is
// tested without Electron (Electron's NativeImage satisfies EncodableImage structurally).
// Limits are in actual image PIXELS — Electron does not promise the size it was asked for.

export interface EncodableImage {
  getSize(): { width: number; height: number }
  isEmpty(): boolean
  resize(options: { width: number; height: number; quality?: 'good' | 'better' | 'best' }): this
  toPNG(): Buffer
  toJPEG(quality: number): Buffer
}

/** Long edge and area the assistant receives; never upscaled. */
export const MAX_EDGE = 1568
export const MAX_AREA = 1_150_000
/** Encoded-bytes ceiling for the assistant image. */
export const MAX_BYTES = 2 * 1024 * 1024
export const THUMB_EDGE = 320
export const THUMB_BYTES = 96 * 1024
const JPEG_QUALITIES = [85, 75]
/** Bounded further downscale steps tried before giving up. */
const EXTRA_SCALES = [0.75, 0.5]

export interface Size {
  width: number
  height: number
}

/** The largest size within `maxEdge`/`maxArea` that keeps the aspect ratio and never grows. */
export function fitSize(size: Size, maxEdge: number, maxArea = Infinity): Size {
  const { width, height } = size
  if (!(width > 0) || !(height > 0)) throw new Error('The captured screen was empty.')
  const scale = Math.min(
    1,
    maxEdge / Math.max(width, height),
    Math.sqrt(maxArea / (width * height)),
  )
  if (scale >= 1) return { width, height }
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

function resized<T extends EncodableImage>(image: T, target: Size): T {
  const { width, height } = image.getSize()
  return width === target.width && height === target.height
    ? image
    : image.resize({ ...target, quality: 'best' })
}

export interface EncodedScreen {
  image: AssistImage
  width: number
  height: number
  bytes: number
}

/** PNG first (sharpest for code and text), then JPEG 85/75, then a bounded downscale. */
export function encodeForAssistant<T extends EncodableImage>(source: T): EncodedScreen {
  if (source.isEmpty()) throw new Error('The captured screen was empty — try again.')
  const fitted = resized(source, fitSize(source.getSize(), MAX_EDGE, MAX_AREA))
  const attempt = (img: T): EncodedScreen | null => {
    const size = img.getSize()
    const png = img.toPNG()
    if (png.length <= MAX_BYTES) return encoded('image/png', png, size)
    for (const quality of JPEG_QUALITIES) {
      const jpeg = img.toJPEG(quality)
      if (jpeg.length <= MAX_BYTES) return encoded('image/jpeg', jpeg, size)
    }
    return null
  }
  const first = attempt(fitted)
  if (first) return first
  const base = fitted.getSize()
  for (const scale of EXTRA_SCALES) {
    const smaller = resized(fitted, {
      width: Math.max(1, Math.floor(base.width * scale)),
      height: Math.max(1, Math.floor(base.height * scale)),
    })
    const result = attempt(smaller)
    if (result) return result
  }
  throw new Error(
    'The captured screen is too detailed to send — enlarge the relevant part and try again.',
  )
}

function encoded(mediaType: AssistImage['mediaType'], data: Buffer, size: Size): EncodedScreen {
  return { image: { mediaType, base64: data.toString('base64') }, ...size, bytes: data.length }
}

/** A small preview for the overlay as a data URL, at most THUMB_EDGE px and THUMB_BYTES. */
export function thumbnailDataUrl<T extends EncodableImage>(source: T): string {
  const thumb = resized(source, fitSize(source.getSize(), THUMB_EDGE))
  const png = thumb.toPNG()
  if (png.length <= THUMB_BYTES) return `data:image/png;base64,${png.toString('base64')}`
  for (const quality of [80, 60, 40]) {
    const jpeg = thumb.toJPEG(quality)
    if (jpeg.length <= THUMB_BYTES) return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  }
  throw new Error('Could not build a preview of the captured screen.')
}
