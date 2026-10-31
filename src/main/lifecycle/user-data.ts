import { app } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function configureUserData(smoke: boolean, argv = process.argv): string {
  app.setName('sanas')
  const smokePath = argv
    .find((arg) => arg.startsWith('--smoke-user-data='))
    ?.slice('--smoke-user-data='.length)
  const path = smoke
    ? smokePath || mkdtempSync(join(tmpdir(), 'sanas-smoke-'))
    : join(app.getPath('appData'), 'sanas')
  app.setPath('userData', path)
  return path
}
