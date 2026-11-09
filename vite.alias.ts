import { resolve } from 'path'

// The one runtime definition of the @shared alias, imported by electron.vite.config.ts,
// vite.renderer.config.ts and vitest.config.ts. tsconfig.node.json / tsconfig.web.json keep
// their own `paths` entry because TypeScript resolves it independently of the bundlers.
export const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') }
