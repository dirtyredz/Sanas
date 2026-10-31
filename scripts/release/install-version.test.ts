import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

it.skipIf(process.platform !== 'win32')(
  'accepts Windows four-part product versions but rejects a different release',
  () => {
    const script = fileURLToPath(new URL('./install-version.ps1', import.meta.url)).replaceAll(
      "'",
      "''",
    )
    const command = `. '${script}'; @(
    (Test-SanasInstalledVersion -InstalledVersion '0.1.1.0' -ReleaseVersion '0.1.1'),
    (Test-SanasInstalledVersion -InstalledVersion '0.1.1' -ReleaseVersion '0.1.1'),
    (Test-SanasInstalledVersion -InstalledVersion '0.1.2.0' -ReleaseVersion '0.1.1')
  ) | ConvertTo-Json -Compress`
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual([true, true, false])
  },
  20_000,
)
