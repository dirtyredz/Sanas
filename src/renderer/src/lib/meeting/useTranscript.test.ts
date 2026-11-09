import { expect, it, vi } from 'vitest'
import type { MeetingState } from '@shared/types'
import { useTranscript, type TranscriptLine } from '../useTranscript'
const h = vi.hoisted(() => ({
  state: { meetingId: 7, status: 'live' } as MeetingState,
  lines: [] as TranscriptLine[],
  shown: { current: 7 as number | null },
  effects: [] as (() => void)[],
}))
vi.mock('../useMeetingState', () => ({ useMeetingState: () => h.state }))
vi.mock('react', () => ({
  useRef: () => h.shown,
  useEffect: (fn: () => void) => h.effects.push(fn),
  useState: () => [
    h.lines,
    (update: TranscriptLine[] | ((lines: TranscriptLine[]) => TranscriptLine[])) => {
      h.lines = typeof update === 'function' ? update(h.lines) : update
    },
  ],
}))
function update() {
  h.effects = []
  useTranscript()
  h.effects.at(-1)!()
}
it('both transcript consumers retain confirmed historical labels and apply corrections through Stop', () => {
  h.lines = [0, 1].map((speaker) => ({
    speaker,
    text: 'Speech',
    isUser: false,
    interim: false,
    tStartMs: speaker * 1000,
  }))
  h.state.speakerIdentity = {
    identityNeedsConfirmation: true,
    currentSpeakerIds: [1],
    selectedSpeakerIds: [0],
  }
  update()
  expect(h.lines.map((line) => line.isUser)).toEqual([true, false])
  h.state.speakerIdentity = {
    identityNeedsConfirmation: false,
    currentSpeakerIds: [1],
    selectedSpeakerIds: [0, 1],
  }
  update()
  expect(h.lines.map((line) => line.isUser)).toEqual([true, true])
  h.state.speakerIdentity.selectedSpeakerIds = [1]
  update()
  h.state = { meetingId: null, status: 'idle' }
  update()
  expect(h.lines.map((line) => line.isUser)).toEqual([false, true])
})
