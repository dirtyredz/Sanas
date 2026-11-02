import { afterEach, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => {
  const image = (value = 30): any => ({
    isEmpty: () => false,
    getSize: () => ({ width: 960, height: 540 }),
    resize: () => image(value),
    crop: () => image(value),
    toPNG: () => Buffer.from(`png-${value}`),
    toJPEG: () => Buffer.from(`jpeg-${value}`),
    toBitmap: () => Buffer.alloc(160 * 90 * 4, value),
  })
  const display = {
    id: 42,
    bounds: { x: -960, y: 0, width: 960, height: 540 },
    size: { width: 960, height: 540 },
    scaleFactor: 1,
  }
  const overlay = {
    getTitle: () => 'Sanas Overlay',
    isVisible: () => true,
    getBounds: () => ({ x: -930, y: 30, width: 380, height: 460 }),
    setBounds: () => {},
  }
  return { image, display, overlay, getSources: vi.fn(), destroy: vi.fn() }
})
vi.mock('electron', () => ({
  nativeImage: { createEmpty: () => fake.image(), createFromPath: () => fake.image() },
  screen: { getPrimaryDisplay: () => fake.display, getAllDisplays: () => [fake.display] },
  desktopCapturer: { getSources: fake.getSources },
  BrowserWindow: class {
    static getAllWindows(): unknown[] {
      return [fake.overlay]
    }
    webContents = { capturePage: async () => fake.image() }
    async loadURL(): Promise<void> {}
    showInactive(): void {}
    destroy(): void {
      fake.destroy()
    }
  },
}))
import { RehearsalScreens, imageDifference } from './desktop'
import { createScreenCapture } from '../../services/screen-capture'
import { captureDisplay } from '../../services/screen-capture/desktop'
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('routes fixtures by display ID and carries actual encoded bytes', async () => {
  const screens = new RehearsalScreens(() => 0)
  await screens.prepare({ id: 's', atMs: 0, kind: 'screen', image: 'fixture.png' })
  const capture = createScreenCapture(() => null, screens.desktop)
  const result = await capture.acquire(capture.target())
  expect(screens.captures[0].displayId).toBe(771)
  expect(result.image.base64).toBe(screens.captures[0].base64)
})
it('runs missing-display, acquisition deadline and oversize failures through production capture', async () => {
  vi.useFakeTimers()
  const screens = new RehearsalScreens(() => 0)
  const capture = createScreenCapture(() => null, screens.desktop)
  screens.inject('missing-display', 10000)
  await expect(capture.acquire(capture.target())).rejects.toThrow('no longer connected')
  screens.inject('oversize-image', 10000)
  await expect(capture.acquire(capture.target())).rejects.toThrow('too detailed')
  screens.inject('capture-timeout', 10000)
  const rejected = expect(capture.acquire(capture.target())).rejects.toThrow('too long')
  await vi.advanceTimersByTimeAsync(5000)
  await rejected
  expect(vi.getTimerCount()).toBe(0)
})
it('verifies real display pixels and overlay exclusion, rejecting a contaminated capture', async () => {
  vi.useFakeTimers()
  const screens = new RehearsalScreens(() => 1000)
  const prepare = screens.prepare({
    id: 'real',
    atMs: 0,
    kind: 'screen',
    image: 'scripts/rehearsal/fixtures/dashboard.png',
    real: true,
    displayId: 42,
  })
  await vi.advanceTimersByTimeAsync(500)
  await prepare
  fake.getSources.mockResolvedValue([{ display_id: '42', thumbnail: fake.image() }])
  const result = await captureDisplay(screens.desktop, fake.display)
  expect(result.image.isEmpty()).toBe(false)
  expect(screens.captures.at(-1)).toMatchObject({ real: true, displayId: 42, verified: true })
  fake.getSources.mockResolvedValue([{ display_id: '42', thumbnail: fake.image(200) }])
  await expect(captureDisplay(screens.desktop, fake.display)).rejects.toThrow(
    'overlay was not excluded',
  )
  screens.close()
  expect(fake.destroy).toHaveBeenCalledTimes(1)
})
it('does not pass absent or differently sized pixel buffers', () => {
  expect(imageDifference(new Uint8Array(), new Uint8Array())).toBe(Infinity)
  expect(imageDifference(new Uint8Array(4), new Uint8Array(8))).toBe(Infinity)
})
