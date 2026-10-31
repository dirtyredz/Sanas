import type { UpdateState } from '@shared/updates/types'
const state: UpdateState = {
  revision: 0,
  currentVersion: '0.1.0-preview',
  phase: 'idle',
  availableVersion: null,
  progress: null,
  error: null,
  canRestart: false,
  blockReason: 'No update downloaded.',
}
export const mockUpdates: Window['sanas']['updates'] = {
  get: async () => ({ ...state }),
  check: async () => ({ ...state, revision: ++state.revision }),
  restart: async () => ({ ...state }),
  onChanged: () => () => {},
}
