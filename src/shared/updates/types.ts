export interface UpdateState {
  revision: number
  currentVersion: string
  phase:
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error'
  availableVersion: string | null
  progress: number | null
  error: string | null
  canRestart: boolean
  blockReason: string | null
}
