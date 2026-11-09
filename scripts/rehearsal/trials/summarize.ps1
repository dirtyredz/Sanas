[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$LogCopy)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'owner-run.ps1')
Initialize-OwnerRun 'latency-summary'
try {
  $source = (Resolve-Path -LiteralPath $LogCopy).Path
  $code = Invoke-Native (Find-Tool 'node.exe') @((Join-Path $PSScriptRoot 'summarize.mjs'), $source) $script:RepoRoot
  Complete-OwnerRun $code
} catch { Complete-OwnerRun 1 $_.Exception.Message }
