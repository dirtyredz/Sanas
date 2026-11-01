import type { ReactNode } from 'react'
import type { MeetingState } from '@shared/types'
import { OverlayButton } from '../controls/OverlayButton'
import { IconGhost } from '../controls/overlay-icons'
import type { OverlayWindowState } from './useOverlayWindowState'

const STATUS_LABEL: Record<MeetingState['status'], string> = {
  idle: 'Idle',
  live: 'Listening',
  paused: 'Paused',
  error: 'Error',
}

/** The drag strip: status, ghost control and any trailing controls. Interactive children are
 *  outside the drag region. */
export function OverlayHeader({
  status,
  windowState,
  children,
}: {
  status: MeetingState['status']
  windowState: OverlayWindowState
  children?: ReactNode
}): React.JSX.Element {
  const restore = windowState.shortcuts.overlay || 'the overlay shortcut'
  return (
    <header className="overlay-header">
      <span className={`dot ${status}`} aria-hidden="true" />
      <span className="title">SANAS</span>
      <span className="overlay-status-text" role="status">
        {windowState.ghost ? `Ghost — ${restore} restores` : STATUS_LABEL[status]}
      </span>
      <span className="overlay-header-actions">
        {children}
        <OverlayButton
          variant="icon"
          aria-label="Ghost mode"
          title={`Ghost mode: clicks pass through. Press ${restore} to restore.`}
          aria-pressed={windowState.ghost}
          onClick={() => void window.sanas.overlay.setClickThrough(true)}
        >
          <IconGhost />
        </OverlayButton>
      </span>
    </header>
  )
}
