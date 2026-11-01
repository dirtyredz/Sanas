import { app } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function flag(argv: string[], name: string): string | undefined {
  return argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) || undefined
}

/** Dev, installed and smoke identities. `--dev-user-data=<dir>` lets an unpackaged run (an
 *  agent's native check) use a throwaway profile instead of the owner's APPDATA/sanas; a
 *  packaged build ignores it. */
export function configureUserData(smoke: boolean, argv = process.argv): string {
  app.setName('sanas')
  const devPath = app.isPackaged ? undefined : flag(argv, '--dev-user-data')
  const path = smoke
    ? flag(argv, '--smoke-user-data') || mkdtempSync(join(tmpdir(), 'sanas-smoke-'))
    : devPath || join(app.getPath('appData'), 'sanas')
  app.setPath('userData', path)
  return path
}
