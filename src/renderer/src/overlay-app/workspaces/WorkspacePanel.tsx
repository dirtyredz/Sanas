import type { ReactNode } from 'react'
import { WORKSPACE_LABELS } from '../../lib/overlay-workspaces'
import {
  panelId,
  tabId,
  type SecondaryWorkspace,
  type Workspace,
} from '../shell/navigation/overlay-navigation'

/** One secondary workspace's frame. Every workspace stays mounted so drafts and scroll
 *  positions survive switching; inactive ones are hidden and inert (out of the tab order). */
export function WorkspacePanel({
  id,
  current,
  children,
}: {
  id: SecondaryWorkspace
  current: Workspace
  children: ReactNode
}): React.JSX.Element {
  const active = id === current
  return (
    <section
      role="tabpanel"
      id={panelId(id)}
      aria-labelledby={tabId(id)}
      className={`workspace ${active ? 'is-active' : ''}`}
      inert={!active}
      aria-hidden={!active}
    >
      <h2 className="workspace-title">{WORKSPACE_LABELS[id]}</h2>
      {children}
    </section>
  )
}

/** A workspace body that only says why there is nothing to show yet. */
export function Empty({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="workspace-body">
      <p className="ov-empty">{children}</p>
    </div>
  )
}
