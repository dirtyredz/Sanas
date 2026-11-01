export type SaveState =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }

/** The page's one Save: always in reach at the bottom, saying whether anything is unsaved,
 *  why Save is waiting, or that it worked. */
export function SettingsSaveBar({
  dirty,
  problemCount,
  save,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  problemCount: number
  save: SaveState
  onSave: () => void
  onDiscard: () => void
}): React.JSX.Element | null {
  // Nothing to say and nothing to do: stay out of the way of the last cards.
  if (!dirty && problemCount === 0 && save.kind === 'idle') return null

  const message =
    save.kind === 'error'
      ? { tone: 'warn', text: `Not saved: ${save.message}` }
      : save.kind === 'saving'
        ? { tone: 'muted', text: 'Saving…' }
        : problemCount > 0
          ? {
              tone: 'warn',
              text: `Fix ${problemCount === 1 ? 'the highlighted field' : `${problemCount} highlighted fields`} to save.`,
            }
          : dirty
            ? { tone: 'accent', text: 'Unsaved changes' }
            : { tone: 'ok', text: 'Saved' }

  return (
    <div className={`settings-save-bar${dirty ? ' dirty' : ''}`}>
      <span className={`settings-save-status ${message.tone}`} role="status">
        <span className="settings-save-dot" aria-hidden="true" />
        {message.text}
      </span>
      <div className="settings-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!dirty || save.kind === 'saving'}
          onClick={onDiscard}
        >
          Discard
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!dirty || problemCount > 0 || save.kind === 'saving'}
          onClick={onSave}
        >
          Save changes
        </button>
      </div>
    </div>
  )
}
