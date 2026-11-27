import { resolve } from 'path'
import { configDefaults, defineConfig } from 'vitest/config'
import { sharedAlias } from './vite.alias'

// Runtime imports of shared modules (e.g. '@shared/settings-limits') resolve like the builds do.
// `electron` resolves to a throwing stub so local runs fail like CI does (no Electron binary).
export default defineConfig({
  resolve: {
    alias: {
      ...sharedAlias,
      electron: resolve(__dirname, 'src/main/test-support/electron-stub.ts'),
    },
  },
  test: { exclude: [...configDefaults.exclude, '.tmp/**'] },
})
