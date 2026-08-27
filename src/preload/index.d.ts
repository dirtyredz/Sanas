import type { SanasApi } from './index'

declare global {
  interface Window {
    sanas: SanasApi
  }
}

export {}
