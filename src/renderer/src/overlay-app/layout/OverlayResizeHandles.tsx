import { useOverlayResize } from './useOverlayResize'

/** Right, bottom and corner grips. Transparent windows have no native resize border on
 *  Windows, so these are the only way to resize the overlay (see GOTCHAS). */
export function OverlayResizeHandles(): React.JSX.Element {
  const { startResize, continueResize, stopResize } = useOverlayResize()
  return (
    <>
      {(['right', 'bottom', 'corner'] as const).map((axis) => (
        <div
          key={axis}
          className={`resize-handle ${axis}`}
          aria-hidden="true"
          onPointerDown={(event) => startResize(axis, event)}
          onPointerMove={continueResize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
        />
      ))}
    </>
  )
}
