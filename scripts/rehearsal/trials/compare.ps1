[CmdletBinding()]
param([switch]$RealProvider)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'owner-run.ps1')
Initialize-OwnerRun 'profile-comparison'
Add-LogSecret $env:ANTHROPIC_API_KEY
Add-LogSecret $env:ANTHROPIC_WORKSPACE_ID
try {
  $arguments = @((Join-Path $PSScriptRoot 'compare.mjs'))
  if ($RealProvider) { $arguments += '--real-provider' }
  $code = Invoke-Native (Find-Tool 'node.exe') $arguments $script:RepoRoot
  Complete-OwnerRun $code
} catch { Complete-OwnerRun 1 $_.Exception.Message }
