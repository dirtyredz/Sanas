import { useRef } from 'react'
import {
  IconAnswer,
  IconAsk,
  IconContext,
  IconScreen,
  IconSlide,
  IconTranscript,
} from '../../controls/overlay-icons'
import { WORKSPACE_LABELS } from '../../../lib/overlay-workspaces'
import { WORKSPACES, panelId, tabId, type Workspace } from './overlay-navigation'
import { workspaceShortcut } from './overlay-shortcuts'

const ICONS: Record<Workspace, () => React.JSX.Element> = {
  answer: IconAnswer,
  ask: IconAsk,
  screen: IconScreen,
  slide: IconSlide,
  transcript: IconTranscript,
  context: IconContext,
}

/** The vertical rail: one tab per workspace, roving focus with arrows and Home/End. It only
 *  navigates — it is never a second row of actions. */
export function OverlayNavigation({
  workspace,
  onSelect,
}: {
  workspace: Workspace
  onSelect: (workspace: Workspace) => void
}): React.JSX.Element {
  const refs = useRef<Partial<Record<Workspace, HTMLButtonElement | null>>>({})
  const move = (to: Workspace): void => {
    onSelect(to)
    refs.current[to]?.focus()
  }
  const onKeyDown = (event: React.KeyboardEvent): void => {
    const index = WORKSPACES.indexOf(workspace)
    const last = WORKSPACES.length - 1
    const target =
      event.key === 'ArrowDown'
        ? WORKSPACES[index === last ? 0 : index + 1]
        : event.key === 'ArrowUp'
          ? WORKSPACES[index === 0 ? last : index - 1]
          : event.key === 'Home'
            ? WORKSPACES[0]
            : event.key === 'End'
              ? WORKSPACES[last]
              : null
    if (!target) return
    event.preventDefault()
    move(target)
  }
  return (
    <nav className="overlay-rail" aria-label="Overlay workspaces">
      <div role="tablist" aria-orientation="vertical" onKeyDown={onKeyDown}>
        {WORKSPACES.map((id) => {
          const Icon = ICONS[id]
          const selected = id === workspace
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[id] = el
              }}
              type="button"
              role="tab"
              id={tabId(id)}
              className="rail-item"
              aria-selected={selected}
              aria-controls={panelId(id)}
              tabIndex={selected ? 0 : -1}
              title={`${WORKSPACE_LABELS[id]} (${workspaceShortcut(id)} while the overlay is focused)`}
              onClick={() => onSelect(id)}
            >
              <Icon />
              <span className="rail-label">{WORKSPACE_LABELS[id]}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
