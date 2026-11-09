$ErrorActionPreference = 'Stop'
function Invoke-OwnerRun {
  param([string]$Name, [scriptblock]$Work)
  $script:OwnerRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
  $folder = Join-Path $script:OwnerRoot '.tmp/owner-runs'
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  $script:OwnerLog = Join-Path $folder ($Name + '-' + [guid]::NewGuid().ToString('N') + '.log')
  try {
    & $Work
    Write-OwnerLog 'OK'
  } catch {
    # Avoid emitting native output, settings, tokens or credentials.
    Write-OwnerLog ('Operation failed: ' + $_.Exception.Message)
    Write-OwnerLog 'FAILED'
    exit 1
  }
}
function Write-OwnerLog([string]$Message) {
  Add-Content -LiteralPath $script:OwnerLog -Value $Message
  Write-Output $Message
}
# owner/repo that releases publish to, from electron-builder.yml (single source: scripts/release/publish/repo.mjs).
function Get-ReleaseRepo {
  $slug = (& node (Join-Path $PSScriptRoot '../release/publish/repo.mjs') 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $slug) { throw 'Could not read the release repo from electron-builder.yml.' }
  return $slug.Trim()
}
function Invoke-GhJson {
  param([string[]]$Arguments)
  $output = & gh @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI operation failed.' }
  return ($output | ConvertFrom-Json)
}
