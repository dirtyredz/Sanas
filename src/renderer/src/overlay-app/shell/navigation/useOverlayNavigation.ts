import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  escapeEffect,
  initialNavigation,
  navigationReducer,
  type NavigationState,
  type Workspace,
} from './overlay-navigation'
import { overlayShortcut } from './overlay-shortcuts'

export interface OverlayNavigationModel {
  workspace: Workspace
  preferencesOpen: boolean
  select(workspace: Workspace): void
  openAsk(): void
  setPreferencesOpen(open: boolean): void
  /** The preferences button: Escape returns focus here when it closes the popover. */
  preferencesTriggerRef: React.RefObject<HTMLButtonElement | null>
}

/** Binds the pure navigation reducer to the meeting and to the overlay's local shortcuts. */
export function useOverlayNavigation(meetingId: number | null): OverlayNavigationModel {
  const [state, dispatch] = useReducer(navigationReducer, meetingId, initialNavigation)
  const stateRef = useRef<NavigationState>(state)
  stateRef.current = state
  const preferencesTriggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => dispatch({ type: 'meeting', meetingId }), [meetingId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const action = overlayShortcut(event)
      if (!action) return
      event.preventDefault()
      if (action.type === 'workspace') dispatch({ type: 'select', workspace: action.workspace })
      else if (action.type === 'preferences')
        dispatch({ type: 'preferences', open: !stateRef.current.preferencesOpen })
      else {
        const effect = escapeEffect(stateRef.current)
        dispatch({ type: 'escape' })
        if (effect === 'restore-trigger') preferencesTriggerRef.current?.focus()
        else void window.sanas.overlay.releaseFocus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return {
    workspace: state.workspace,
    preferencesOpen: state.preferencesOpen,
    select: useCallback((workspace) => dispatch({ type: 'select', workspace }), []),
    openAsk: useCallback(() => dispatch({ type: 'compose' }), []),
    setPreferencesOpen: useCallback((open) => dispatch({ type: 'preferences', open }), []),
    preferencesTriggerRef,
  }
}
