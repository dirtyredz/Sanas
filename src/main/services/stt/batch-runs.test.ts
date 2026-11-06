import { afterEach, expect, it, vi } from 'vitest'
import { splitBySpeaker, splitBatchWords } from './deepgram/deepgram-events'
import { deepgramProvider } from './deepgram/deepgram'

vi.mock('node:fs', () => ({ readFileSync: () => Buffer.alloc(44) }))
afterEach(() => vi.unstubAllGlobals())

it('preserves both batch channels and exact timestamps across separated utterances', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: {
          channels: [
            {
              alternatives: [
                {
                  words: [
                    { word: 'yes', start: 1, end: 2, speaker: 0 },
                    { word: 'done', start: 42, end: 43, speaker: 0 },
                  ],
                },
              ],
            },
            {
              alternatives: [
                {
                  words: [
                    { word: 'ready', punctuated_word: 'Ready?', start: 0, end: 0.9, speaker: 0 },
                    { word: 'next', start: 40, end: 41, speaker: 1 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    }),
  )
  expect(
    await deepgramProvider.transcribeFile('fixture.wav', {
      apiKey: 'stub',
      channels: 2,
      keyterms: [],
    }),
  ).toEqual([
    { channel: 1, speaker: 0, tStartMs: 0, tEndMs: 900, text: 'Ready?' },
    { channel: 0, speaker: 0, tStartMs: 1000, tEndMs: 2000, text: 'yes' },
    { channel: 1, speaker: 1, tStartMs: 40000, tEndMs: 41000, text: 'next' },
    { channel: 0, speaker: 0, tStartMs: 42000, tEndMs: 43000, text: 'done' },
  ])
})

it('preserves adjacent words, identities and times but splits a 40 second batch silence', () => {
  const words = [
    { word: 'one', start: 0, end: 1, speaker: 0 },
    { word: 'two', start: 1.2, end: 2, speaker: 0 },
    { word: 'three', start: 42, end: 43, speaker: 0 },
    { word: 'four', start: 43, end: 44, speaker: 1 },
  ]
  expect(splitBatchWords(words)).toEqual([words.slice(0, 2), [words[2]], [words[3]]])
  expect(splitBatchWords(words).flat()).toEqual(words)
  expect(splitBySpeaker(words)).toEqual([words.slice(0, 3), [words[3]]])
})
