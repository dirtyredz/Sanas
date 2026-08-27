// Typed IPC channel names. Renderer invokes; main handles.
// Keep this the single source of truth for channel strings.

export const IPC = {
  // settings
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  // overlay
  OverlayToggle: 'overlay:toggle',
  // db smoke-test (Phase 0 only; replaced by real repos in later phases)
  DbPing: 'db:ping'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
