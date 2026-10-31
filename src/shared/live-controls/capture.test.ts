import { describe, expect, it } from 'vitest'
import { CAPTURE_REQUEST_MARKER, readManualKind, storedManualKind } from './capture'

describe('capture answer storage without a schema change', () => {
  it('stores a direct capture as typed with the marker and reads it back', () => {
    const stored = storedManualKind('capture', null)
    expect(stored).toEqual({ manualKind: 'typed', requestText: CAPTURE_REQUEST_MARKER })
    expect(readManualKind(stored.manualKind, stored.requestText)).toEqual({
      manualKind: 'capture',
      requestText: null,
    })
  })

  it('keeps the typed question of a capture-with-question', () => {
    const stored = storedManualKind('capture', "what's wrong here?")
    expect(stored.requestText).toBe(`${CAPTURE_REQUEST_MARKER} what's wrong here?`)
    expect(readManualKind(stored.manualKind, stored.requestText)).toEqual({
      manualKind: 'capture',
      requestText: "what's wrong here?",
    })
  })

  it('leaves every other kind untouched', () => {
    expect(storedManualKind('typed', 'hi')).toEqual({ manualKind: 'typed', requestText: 'hi' })
    expect(storedManualKind(undefined, undefined)).toEqual({ manualKind: null, requestText: null })
    expect(readManualKind('typed', 'hi')).toEqual({ manualKind: 'typed', requestText: 'hi' })
    expect(readManualKind('detail', null)).toEqual({ manualKind: 'detail', requestText: null })
  })
})
