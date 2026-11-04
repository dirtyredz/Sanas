import { useRef } from 'react'
import { nextTabIndex } from '../../../lib/navigation/next-tab-index'
import {
  IconAnswer,
  IconAsk,
  IconContext,
  IconScreen,
  IconTranscript,
} from '../../controls/overlay-icons'
import { WORKSPACE_LABELS } from '../../../lib/overlay-workspaces'
import { WORKSPACES, panelId, tabId, type Workspace } from './overlay-navigation'
import { workspaceShortcut } from './overlay-shortcuts'
import { OverlayTip } from '../../controls/OverlayTip'

const ICONS: Record<Workspace, () => React.JSX.Element> = {
  answer: IconAnswer,
  ask: IconAsk,
  screen: IconScreen,
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
    const target = nextTabIndex(event.key, index, WORKSPACES.length, 'vertical')
    if (target === null) return
    event.preventDefault()
    move(WORKSPACES[target])
  }
  return (
    <nav className="overlay-rail" aria-label="Overlay workspaces">
      <div role="tablist" aria-orientation="vertical" onKeyDown={onKeyDown}>
        {WORKSPACES.map((id) => {
          const Icon = ICONS[id]
          const selected = id === workspace
          return (
            <OverlayTip
              key={id}
              text={`${WORKSPACE_LABELS[id]} (${workspaceShortcut(id)} while the overlay is focused)`}
            >
              <button
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
                onClick={() => onSelect(id)}
              >
                <Icon />
                <span className="rail-label">{WORKSPACE_LABELS[id]}</span>
              </button>
            </OverlayTip>
          )
        })}
      </div>
    </nav>
  )
}
