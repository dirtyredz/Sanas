import type { CaptureStatus } from '@shared/live-controls/capture'
type SanasApi = Window['sanas']

// Browser-preview Capture screen / Attach screen: a fixed thumbnail and a canned diagnosis,
// so the overlay's capture UI can be exercised without Electron or a real screen.

const THUMBNAIL =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#1e1e2e"/>' +
      '<text x="8" y="40" fill="#f38ba8" font-family="monospace" font-size="10">TypeError: x is undefined</text>' +
      '<text x="8" y="58" fill="#a6adc8" font-family="monospace" font-size="9">at load (app.ts:42)</text></svg>',
  )

const DIAGNOSIS = `**\`user\` is undefined when \`load()\` runs before login**

The visible error is \`TypeError: Cannot read properties of undefined (reading 'id')\` at \`app.ts:42\`.

Likely cause (inferred): \`load()\` is called before the session resolves, so \`user\` is still undefined.

\`\`\`ts
const id = user?.id
if (!id) return
\`\`\`

Verify: reload the page and confirm the error is gone from the console.`

export function mockScreenCapture(
  getMeetingId: () => number | null,
  emit: Parameters<SanasApi['assist']['onSuggestion']>[0],
): SanasApi['screenCapture'] {
  const listeners = new Set<(status: CaptureStatus) => void>()
  let status: CaptureStatus = { meetingId: null, phase: 'idle', message: '', seq: 0 }
  let seq = 20000
  let token = 0
  const set = (next: Omit<CaptureStatus, 'seq'>): void => {
    status = { ...next, seq: status.seq + 1 }
    listeners.forEach((cb) => cb(status))
  }
  return {
    capture: async (meetingId) => {
      if (meetingId !== getMeetingId()) {
        set({ meetingId, phase: 'failed', message: 'This meeting is no longer active.' })
        return {
          accepted: false,
          reason: 'unavailable',
          message: 'This meeting is no longer active.',
        }
      }
      set({ meetingId, phase: 'capturing', message: 'Capturing…' })
      await new Promise((r) => setTimeout(r, 400))
      const event = {
        suggestionId: ++seq,
        meetingId,
        trigger: 'hotkey' as const,
        purpose: 'answer' as const,
        manualKind: 'capture' as const,
        groundingContextId: 1,
      }
      emit({ ...event, kind: 'start', text: '' })
      set({
        meetingId,
        phase: 'analyzing',
        message: 'Screen captured: Preview (1920×1080) — analyzing…',
      })
      setTimeout(
        () => emit({ ...event, kind: 'done', storedSuggestionId: seq, text: DIAGNOSIS }),
        900,
      )
      return { accepted: true }
    },
    attach: async (meetingId) => {
      await new Promise((r) => setTimeout(r, 300))
      return {
        ok: true,
        draft: {
          meetingId,
          token: `00000000-0000-4000-8000-${String(++token).padStart(12, '0')}`,
          thumbnail: THUMBNAIL,
          display: 'Preview (1920×1080)',
          width: 1568,
          height: 882,
        },
      }
    },
    discard: async () => {},
    getStatus: async () => status,
    onStatus: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}
