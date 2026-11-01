import { useEffect, useRef, useState } from 'react'

type ComposeBridge = Pick<Window['sanas']['overlay'], 'onCompose' | 'composerReady'>

/** Installs the compose listener, then tells main the overlay is ready. The order matters:
 *  main holds a cold-start Ask intent until `composerReady` and delivers it at once. */
export function connectComposerActivation(bridge: ComposeBridge, activate: () => void): () => void {
  const remove = bridge.onCompose(activate)
  void bridge.composerReady().catch(() => {})
  return remove
}

/** The Ask shortcut's handshake, mounted above every workspace so it never depends on which
 *  view is showing. An activation opens Ask (via `open`) and focuses the textarea once it is
 *  mounted and available; until then the intent waits. */
export function useComposerActivation(
  open: () => void,
  input: React.RefObject<HTMLTextAreaElement | null>,
  available: boolean,
): void {
  const [pendingFocus, setPendingFocus] = useState(false)
  const openRef = useRef(open)
  openRef.current = open
  useEffect(
    () =>
      connectComposerActivation(window.sanas.overlay, () => {
        openRef.current()
        setPendingFocus(true)
      }),
    [],
  )
  useEffect(() => {
    if (!pendingFocus || !available) return
    const frame = requestAnimationFrame(() => {
      input.current?.focus()
      setPendingFocus(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [pendingFocus, available, input])
}
