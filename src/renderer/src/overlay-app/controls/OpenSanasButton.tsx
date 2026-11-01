import { OverlayButton } from './OverlayButton'

/** Reveals the main window on whatever page it is showing — never a reload or a new route,
 *  so the Live page and its microphone session are untouched. */
export function OpenSanasButton({
  variant = 'quiet',
}: {
  variant?: 'quiet' | 'secondary'
}): React.JSX.Element {
  return (
    <OverlayButton
      size="sm"
      variant={variant}
      className="open-sanas"
      onClick={() => void window.sanas.app.showMain().catch(() => {})}
    >
      Open Sanas
    </OverlayButton>
  )
}
