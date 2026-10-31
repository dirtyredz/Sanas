import { app } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function configureUserData(smoke: boolean): string {
  app.setName('sanas')
  const path = smoke
    ? mkdtempSync(join(tmpdir(), 'sanas-smoke-'))
    : join(app.getPath('appData'), 'sanas')
  app.setPath('userData', path)
  return path
}
