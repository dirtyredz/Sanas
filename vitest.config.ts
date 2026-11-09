import { defineConfig } from 'vitest/config'
import { sharedAlias } from './vite.alias'

// Runtime imports of shared modules (e.g. '@shared/settings-limits') resolve like the builds do.
export default defineConfig({
  resolve: { alias: sharedAlias },
})
