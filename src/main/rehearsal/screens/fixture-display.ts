import { BrowserWindow, nativeImage, screen, type NativeImage } from 'electron'
import { readFileSync } from 'node:fs'
import {
  captureDisplay,
  electronDesktop,
  type DesktopDeps,
  type CaptureDisplay,
} from '../../services/screen-capture/desktop'
import type { EncodableImage } from '../../services/screen-capture/encode'
import { encodeForAssistant } from '../../services/screen-capture/encode'
import type { Fault, Step } from '../scenario/scenario'
import { mapRectangle, type Rectangle } from './geometry'

const fixtureDisplay: CaptureDisplay = {
  id: 771,
  bounds: { x: 0, y: 0, width: 960, height: 540 },
  size: { width: 960, height: 540 },
  scaleFactor: 1,
  label: 'Rehearsal fixture',
}

/** Pixel comparison covers the whole display AND the protected overlay rectangle. */
export function imageDifference(actual: Uint8Array, expected: Uint8Array): number {
  if (!actual.length || actual.length !== expected.length) return Infinity
  let sum = 0
  for (let i = 0; i < actual.length; i++) if (i % 4 !== 3) sum += Math.abs(actual[i] - expected[i])
  return sum / (actual.length * 0.75)
}

class OversizeImage implements EncodableImage {
  isEmpty(): boolean {
    return false
  }
  getSize(): { width: number; height: number } {
    return { width: 960, height: 540 }
  }
  resize(): this {
    return this
  }
  toPNG(): Buffer {
    return Buffer.alloc(2 * 1024 * 1024 + 1)
  }
  toJPEG(): Buffer {
    return this.toPNG()
  }
}

export class RehearsalScreens {
  private image: EncodableImage = nativeImage.createEmpty()
  private target = fixtureDisplay
  private real = false
  private fixtureWindow: BrowserWindow | null = null
  private expected: NativeImage | null = null
  private contentBounds: Rectangle | null = null
  private restoreOverlay?: () => void
  private fault: Fault | null = null
  private faultUntil = 0
  readonly captures: {
    atMs: number
    real: boolean
    displayId: number
    verified: boolean
    base64: string
    contentError?: number
    overlayError?: number
    reason?: string
    contentBounds?: Rectangle
  }[] = []
  constructor(private readonly now: () => number) {}
  inject(fault: Fault, durationMs: number): void {
    this.fault = fault
    this.faultUntil = this.now() + durationMs
  }
  private activeFault(): Fault | null {
    return this.now() < this.faultUntil ? this.fault : null
  }
  readonly desktop: DesktopDeps = {
    overlayBounds: () => this.target.bounds,
    cursorPoint: () => ({ x: this.target.bounds.x, y: this.target.bounds.y }),
    displayMatching: () => this.target,
    displayNearestPoint: () => this.target,
    allDisplays: () =>
      this.activeFault() === 'missing-display'
        ? []
        : this.real
          ? screen.getAllDisplays()
          : [fixtureDisplay],
    getSources: async (options) => {
      if (this.activeFault() === 'capture-timeout') return new Promise(() => {})
      if (this.activeFault() === 'oversize-image')
        return [{ display_id: String(this.target.id), thumbnail: new OversizeImage() }]
      if (!this.real) {
        this.captures.push({
          atMs: this.now(),
          real: false,
          displayId: this.target.id,
          verified: true,
          base64: encodeForAssistant(this.image).image.base64,
        })
        return [
          { display_id: 'wrong-display', thumbnail: nativeImage.createEmpty() },
          { display_id: String(this.target.id), thumbnail: this.image },
        ]
      }
      const sources = await electronDesktop(() => this.target.bounds).getSources(options)
      const actual = sources.find((s) => s.display_id === String(this.target.id))?.thumbnail
      if (!actual || !this.expected || !this.contentBounds)
        throw new Error('Real capture missed the target display')
      const expected = this.expected
      const content = mapRectangle(this.contentBounds, this.target.bounds, actual.getSize())
      const actualContent = actual.crop(content)
      const diff = imageDifference(
        actualContent.resize({ width: 160, height: 90 }).toBitmap(),
        expected.resize({ width: 160, height: 90 }).toBitmap(),
      )
      // The actual Sanas overlay must be visible on the target for exclusion to be tested.
      const overlay = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Sanas Overlay')
      if (!overlay?.isVisible())
        throw new Error('Real capture requires the visible protected overlay')
      const b = overlay.getBounds()
      const crop = mapRectangle(b, this.contentBounds, actualContent.getSize())
      const expectedSized = expected.resize(actualContent.getSize())
      const overlayDiff = imageDifference(
        actualContent.crop(crop).resize({ width: 80, height: 60 }).toBitmap(),
        expectedSized.crop(crop).resize({ width: 80, height: 60 }).toBitmap(),
      )
      const verified = diff < 12 && overlayDiff < 12
      this.captures.push({
        atMs: this.now(),
        real: true,
        displayId: this.target.id,
        verified,
        base64: encodeForAssistant(actual).image.base64,
        contentError: diff,
        overlayError: overlayDiff,
        contentBounds: this.contentBounds,
        reason:
          diff >= 12
            ? 'fixture-obstructed-or-mismatched'
            : overlayDiff >= 12
              ? 'overlay-not-excluded'
              : 'valid',
      })
      if (!verified)
        throw new Error('Real screen pixels differ from fixture or overlay was not excluded')
      return sources
    },
  }
  async prepare(step: Extract<Step, { kind: 'screen' }>): Promise<void> {
    this.close()
    this.real = !!step.real
    this.image = nativeImage.createFromPath(step.image)
    if (this.image.isEmpty()) throw new Error('Fixture image could not be loaded')
    if (!this.real) {
      this.target = fixtureDisplay
      return
    }
    const display =
      step.displayId === undefined
        ? screen.getPrimaryDisplay()
        : screen.getAllDisplays().find((d) => d.id === step.displayId)
    if (!display) throw new Error('Requested real display is missing')
    this.target = display
    this.fixtureWindow = new BrowserWindow({
      ...display.workArea,
      frame: false,
      show: false,
      skipTaskbar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    const encoded = readFileSync(step.image).toString('base64')
    await this.fixtureWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;background:#152438;overflow:hidden"><img style="width:100vw;height:100vh;object-fit:fill" src="data:image/png;base64,${encoded}"></body></html>`)}`,
    )
    // Explicit owner rehearsal: raise the fixture above ordinary windows, below the
    // production screen-saver-level protected overlay. Do not change its protection.
    this.fixtureWindow.setAlwaysOnTop(true, 'floating')
    this.fixtureWindow.show()
    this.fixtureWindow.moveTop()
    this.contentBounds = this.fixtureWindow.getContentBounds()
    mapRectangle(this.contentBounds, display.bounds, display.size)
    const overlay = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Sanas Overlay')
    if (overlay) {
      const original = overlay.getBounds()
      this.restoreOverlay = () => {
        if (!overlay.isDestroyed()) overlay.setBounds(original)
      }
    }
    overlay?.setBounds({
      x: display.bounds.x + 30,
      y: display.bounds.y + 30,
      width: 380,
      height: 460,
    })
    await new Promise((resolve) => setTimeout(resolve, 500))
    this.expected = await this.fixtureWindow.webContents.capturePage()
  }
  close(): void {
    this.restoreOverlay?.()
    this.restoreOverlay = undefined
    this.fixtureWindow?.destroy()
    this.fixtureWindow = null
    this.expected = null
    this.contentBounds = null
  }
}

// Keep the production deadline behavior testable without an Electron desktop.
export { captureDisplay }
