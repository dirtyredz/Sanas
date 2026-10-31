import { app } from 'electron'
import { writeFileSync } from 'node:fs'
import { openDb, closeDb } from '../db'
import { diagnosticProbe } from '../db/repos/diagnostics'

export async function runSmoke(): Promise<void> {
  const reportPath = process.argv
    .find((arg) => arg.startsWith('--smoke-report='))
    ?.slice('--smoke-report='.length)
  let code = 1
  const report: Record<string, unknown> = {
    packaged: app.isPackaged,
    version: app.getVersion(),
    arch: process.arch,
    electron: process.versions.electron,
    abi: process.versions.modules,
    result: 'failed',
  }
  try {
    if (!reportPath) throw new Error('Missing report path')
    await app.whenReady()
    const db = await openDb()
    diagnosticProbe()
    report.schemaVersion = db.pragma('user_version', { simple: true })
    report.bindingPath = Object.keys(require.cache).find((path) =>
      path.endsWith('better_sqlite3.node'),
    )
    if (!report.bindingPath) throw new Error('Binding was not loaded')
    report.result = 'ok'
    code = 0
  } catch {
    report.result = 'failed'
  } finally {
    try {
      closeDb()
    } catch {
      code = 1
      report.result = 'failed'
    }
    try {
      if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2))
    } catch {
      code = 1
    }
    // Let the readiness continuation return before forcing Chromium's services to stop.
    setImmediate(() => app.exit(code))
  }
}
