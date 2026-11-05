import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
const windows = process.platform === 'win32' ? it : it.skip
const helper = resolve('scripts/rehearsal/credentials.ps1').replace(/'/g, "''")
function run(body: string): string {
  return execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `
    $ErrorActionPreference = 'Stop'
    . '${helper}'
    $env:ANTHROPIC_API_KEY = $null; $env:DEEPGRAM_API_KEY = $null
    function Write-Log([string]$s) { Write-Output $s }
    function Add-LogSecret([string]$s) {}
    function Read-VaultSecret([string]$Ref) { $script:calls += 1; 'stub-secret' }
    $script:calls = 0
    ${body}
  `,
    ],
    { encoding: 'utf8', timeout: 20000 },
  )
}
windows(
  'retired live credentials cannot read the vault',
  () => {
    const out = run(
      "try { Get-RehearsalCredentials live canned $false } catch { Write-Output $_.Exception.Message }; Write-Output ('calls=' + $script:calls)",
    )
    expect(out).toContain('Mock interview tab')
    expect(out).toContain('calls=0')
  },
  30000,
)
windows(
  'dry run names only needed references without reading the vault',
  () => {
    const out = run(
      "Get-RehearsalCredentials audio claude $true; Write-Output ('calls=' + $script:calls)",
    )
    expect(out).toContain('op://Sanas/Sanas - Claude/credential')
    expect(out).toContain('op://Sanas/Sanas - Deepgram/credential')
    expect(out).toContain('calls=0')
    expect(out).not.toContain('stub-secret')
  },
  30000,
)
windows(
  'fetches only missing selected credentials and clears them',
  () => {
    const out = run(`
    Get-RehearsalCredentials scripted canned $false
    if ($script:calls -ne 0) { throw 'Free run fetched credentials' }
    Get-RehearsalCredentials scripted claude $false
    if ($script:calls -ne 1 -or $env:DEEPGRAM_API_KEY -or -not $env:ANTHROPIC_API_KEY) { throw 'Wrong selection' }
    Get-RehearsalCredentials audio claude $false
    if ($script:calls -ne 2) { throw 'Existing key fetched again' }
    Clear-RehearsalCredentials
    if ($env:ANTHROPIC_API_KEY -or $env:DEEPGRAM_API_KEY) { throw 'Key retained' }
    'passed'
  `)
    expect(out.trim()).toBe('passed')
  },
  30000,
)
windows(
  'a vault-exec failure gives the error code and scope hint without exposing output',
  () => {
    const out = run(`
    function Read-VaultSecret([string]$Ref) { throw 'POLICY_DENIED' }
    try { Get-RehearsalCredentials audio canned $false; throw 'unexpected success' }
    catch { Write-Output $_.Exception.Message }
  `)
    expect(out).toContain('POLICY_DENIED')
    expect(out).toContain('Rotate')
    expect(out).not.toContain('stub-secret')
  },
  30000,
)
windows(
  'an unlocatable vault-exec gives a clear message',
  () => {
    const out = run(`
    $env:ONEPASSWORD_VAULT_MCP_DIR = 'C:\no\such\dir'
    function Read-VaultSecret([string]$Ref) { Get-VaultExecPath }
    try { Get-RehearsalCredentials scripted claude $false }
    catch { Write-Output $_.Exception.Message }
  `)
    expect(out).toContain('VAULT_EXEC_FAILED')
  },
  30000,
)
