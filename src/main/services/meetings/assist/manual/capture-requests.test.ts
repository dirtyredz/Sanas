import { describe, expect, it, vi } from 'vitest'
import type { Admission } from '@shared/live-controls/types'
import type { CaptureStatus } from '@shared/live-controls/capture'
import { CaptureDrafts } from './capture-drafts'
import { CaptureRequests, type AcquiredCapture, type CaptureRequestDeps } from './capture-requests'
import type { AssistInput } from './manual-requests'

const shot = (n = 1): AcquiredCapture => ({
  image: { mediaType: 'image/png', base64: `img${n}` },
  thumbnail: `data:image/png;base64,thumb${n}`,
  display: 'Laptop (2560×1440)',
  width: 1568,
  height: 882,
})

function harness(over: Partial<CaptureRequestDeps<string>> = {}) {
  let live: number | null = 1
  let token = 0
  const statuses: CaptureStatus[] = []
  const requests: AssistInput[] = []
  const drafts = new CaptureDrafts(() => `t${++token}`)
  let release: (c: AcquiredCapture) => void = () => undefined
  let fail: (e: Error) => void = () => undefined
  const acquire = vi.fn(
    () =>
      new Promise<AcquiredCapture>((resolve, reject) => {
        release = resolve
        fail = reject
      }),
  )
  const deps: CaptureRequestDeps<string> = {
    serialize: (fn) => fn(),
    liveMeetingId: () => live,
    canRequest: () => true,
    apiKeySet: () => true,
    target: () => 'display-1',
    acquire,
    request: (input) => {
      requests.push(input)
      return { accepted: true }
    },
    status: (s) => statuses.push(s),
    drafts,
    ...over,
  }
  const coordinator = new CaptureRequests(deps)
  return {
    coordinator,
    statuses,
    requests,
    drafts,
    acquire,
    release: (c = shot()) => release(c),
    fail: (e: Error) => fail(e),
    end: () => (live = null),
  }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('Capture screen', () => {
  it('captures, then admits one image request against the same meeting', async () => {
    const h = harness()
    const pending = h.coordinator.capture()
    expect(h.statuses.at(-1)).toMatchObject({ phase: 'capturing', message: 'Capturing…' })
    h.release()
    await expect(pending).resolves.toEqual({ accepted: true })
    expect(h.requests).toEqual([
      { meetingId: 1, kind: 'capture', image: { mediaType: 'image/png', base64: 'img1' } },
    ])
    expect(h.statuses.at(-1)).toMatchObject({ phase: 'analyzing' })
    expect(h.statuses.at(-1)?.message).toContain('Laptop (2560×1440)')
  })

  it('refuses before acquisition when an answer is running, a capture is preparing, or no key', async () => {
    const busy = harness({ canRequest: () => false })
    await expect(busy.coordinator.capture()).resolves.toMatchObject({ reason: 'busy' })
    expect(busy.acquire).not.toHaveBeenCalled()

    const twice = harness()
    const first = twice.coordinator.capture()
    await expect(twice.coordinator.capture()).resolves.toMatchObject({
      reason: 'busy',
      message: 'A screen capture is already in progress.',
    })
    expect(twice.acquire).toHaveBeenCalledOnce()
    twice.release()
    await first

    const nokey = harness({ apiKeySet: () => false })
    await expect(nokey.coordinator.capture()).resolves.toMatchObject({ reason: 'unavailable' })
    expect(nokey.acquire).not.toHaveBeenCalled()
  })

  it('reports no meeting as a readable failure (shortcut with nothing running)', async () => {
    const h = harness()
    h.end()
    await expect(h.coordinator.capture()).resolves.toMatchObject({ accepted: false })
    expect(h.statuses.at(-1)).toMatchObject({
      phase: 'failed',
      message: expect.stringContaining('Start a meeting'),
    })
  })

  it('discards the image when the meeting stops while it is being captured', async () => {
    const h = harness()
    const pending = h.coordinator.capture()
    h.end()
    h.coordinator.meetingChanged()
    h.release()
    await expect(pending).resolves.toMatchObject({ accepted: false })
    expect(h.requests).toEqual([])
    expect(h.statuses.at(-1)).toMatchObject({ phase: 'idle' })
  })

  it('surfaces acquisition failures and frees the slot for the next try', async () => {
    const h = harness()
    const pending = h.coordinator.capture()
    h.fail(new Error('Capturing the screen took too long — try again.'))
    await expect(pending).resolves.toMatchObject({ accepted: false, reason: 'unavailable' })
    expect(h.statuses.at(-1)).toMatchObject({
      phase: 'failed',
      message: expect.stringContaining('too long'),
    })
    const again = h.coordinator.capture()
    h.release()
    await expect(again).resolves.toEqual({ accepted: true })
  })

  it('reports a rejected admission (another answer took the lane meanwhile)', async () => {
    const busy: Admission = {
      accepted: false,
      reason: 'busy',
      message: 'A requested answer is already running.',
    }
    const h = harness({ request: () => busy })
    const pending = h.coordinator.capture()
    h.release()
    await expect(pending).resolves.toEqual(busy)
    expect(h.statuses.at(-1)).toMatchObject({ phase: 'failed' })
  })
})

describe('Attach screen', () => {
  it('keeps one draft per meeting and replaces it', async () => {
    const h = harness()
    const first = h.coordinator.attach(1)
    h.release(shot(1))
    const a = await first
    expect(a).toMatchObject({
      ok: true,
      draft: { token: 't1', thumbnail: expect.stringContaining('thumb1') },
    })
    const second = h.coordinator.attach(1)
    h.release(shot(2))
    await second
    expect(h.drafts.size).toBe(1)
    expect(h.drafts.get(1, 't1')).toBeUndefined()
    expect(h.drafts.get(1, 't2')?.image.base64).toBe('img2')
    expect(h.requests).toEqual([]) // attaching never calls the assistant
  })

  it('keeps the previous draft when a replacement fails', async () => {
    const h = harness()
    const first = h.coordinator.attach(1)
    h.release()
    await first
    const second = h.coordinator.attach(1)
    h.fail(new Error('That screen is no longer connected'))
    await expect(second).resolves.toMatchObject({ ok: false })
    expect(h.drafts.get(1, 't1')).toBeDefined()
  })

  it('sends the exact attached image with the typed question and consumes the draft', async () => {
    const h = harness()
    const attached = h.coordinator.attach(1)
    h.release(shot(7))
    await attached
    const result = h.coordinator.sendWithDraft({ meetingId: 1, kind: 'typed', text: 'why?' }, 't1')
    expect(result).toEqual({ accepted: true })
    expect(h.requests[0]).toEqual({
      meetingId: 1,
      kind: 'capture',
      text: 'why?',
      image: { mediaType: 'image/png', base64: 'img7' },
    })
    expect(h.drafts.size).toBe(0)
  })

  it('keeps the draft when admission is refused, and refuses stale tokens explicitly', async () => {
    const h = harness({ request: () => ({ accepted: false, reason: 'busy', message: 'busy' }) })
    const attached = h.coordinator.attach(1)
    h.release()
    await attached
    expect(
      h.coordinator.sendWithDraft({ meetingId: 1, kind: 'typed', text: 'q' }, 't1'),
    ).toMatchObject({
      reason: 'busy',
    })
    expect(h.drafts.size).toBe(1)
    expect(
      h.coordinator.sendWithDraft({ meetingId: 1, kind: 'typed', text: 'q' }, 'old'),
    ).toMatchObject({
      accepted: false,
      reason: 'attachment-expired',
    })
    expect(
      h.coordinator.sendWithDraft({ meetingId: 2, kind: 'typed', text: 'q' }, 't1'),
    ).toMatchObject({
      reason: 'attachment-expired',
    })
  })

  it('drops drafts when the meeting changes or the overlay goes away', async () => {
    const h = harness()
    const attached = h.coordinator.attach(1)
    h.release()
    await attached
    h.coordinator.meetingChanged()
    expect(h.drafts.size).toBe(0)
    const again = h.coordinator.attach(1)
    h.release()
    await again
    h.coordinator.rendererGone()
    expect(h.drafts.size).toBe(0)
  })

  it('discards an attachment captured for a meeting that ended meanwhile', async () => {
    const h = harness()
    const attached = h.coordinator.attach(1)
    h.end()
    h.release()
    await expect(attached).resolves.toMatchObject({ ok: false })
    expect(h.drafts.size).toBe(0)
    await flush()
  })
})
