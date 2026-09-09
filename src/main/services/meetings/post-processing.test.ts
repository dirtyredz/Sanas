import { describe, expect, it } from 'vitest'
import {
  clearPostProcessing,
  isPostProcessing,
  markPostProcessing,
  whilePostProcessing,
} from './post-processing'

describe('post-processing', () => {
  it('holds a meeting until every rewrite that claimed it is done', () => {
    // a summary and a re-diarization can run at once; the first to finish must not
    // release the meeting to merge while the second is still writing
    markPostProcessing(1)
    markPostProcessing(1)
    clearPostProcessing(1)
    expect(isPostProcessing(1)).toBe(true)
    clearPostProcessing(1)
    expect(isPostProcessing(1)).toBe(false)
  })

  it('never goes negative, so a stray clear cannot mask a real claim', () => {
    clearPostProcessing(2)
    markPostProcessing(2)
    expect(isPostProcessing(2)).toBe(true)
    clearPostProcessing(2)
    expect(isPostProcessing(2)).toBe(false)
  })

  it('releases a meeting whose work threw', async () => {
    await expect(
      whilePostProcessing(3, () => Promise.reject(new Error('summary failed'))),
    ).rejects.toThrow('summary failed')
    expect(isPostProcessing(3)).toBe(false)
  })

  it('marks for the whole span of the work and returns its value', async () => {
    const seen: boolean[] = []
    const value = await whilePostProcessing(4, async () => {
      seen.push(isPostProcessing(4))
      await Promise.resolve()
      seen.push(isPostProcessing(4))
      return 'done'
    })
    expect(value).toBe('done')
    expect(seen).toEqual([true, true])
    expect(isPostProcessing(4)).toBe(false)
  })
})
