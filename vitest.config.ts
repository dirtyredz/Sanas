import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Runtime imports of shared modules (e.g. '@shared/settings-limits') resolve like the builds do.
export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
})
