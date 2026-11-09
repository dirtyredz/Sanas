<#
.SYNOPSIS
Compare the Full and Smart answer profiles on matched scripted trials.
.DESCRIPTION
Builds the rehearsal comparison runner with esbuild and runs matched Full/Smart trials through
the real request builder and runner, then writes a JSON report under <repo>\.tmp\owner-runs\.
By default the assistant is the scripted rehearsal provider: no network, no charges.
With -RealProvider the trials call the Anthropic API and COST MONEY; ANTHROPIC_API_KEY (and
optionally ANTHROPIC_WORKSPACE_ID) must already be in the environment, and both are redacted
from the log. The run is logged under <repo>\.tmp\owner-runs\ and ends with one OK or FAILED line.
Exit codes: 0 every matched sample finished; 1 a sample did not finish, or setup failed.
.PARAMETER RealProvider
Use the real Anthropic provider instead of the scripted one (spends money).
.PARAMETER DryRun
Describe what would run (provider, credentials, Node) and stop: no build, no trials, no
provider call, no spend.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\rehearsal\trials\compare.ps1 -DryRun -RealProvider
#>
[CmdletBinding()]
param([switch]$RealProvider, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'owner-run.ps1')
Initialize-OwnerRun 'profile-comparison'
Add-LogSecret $env:ANTHROPIC_API_KEY
Add-LogSecret $env:ANTHROPIC_WORKSPACE_ID
try {
  $node = Find-Tool 'node.exe'
  if (-not $node) { throw 'node.exe was not found on PATH.' }
  $arguments = @((Join-Path $PSScriptRoot 'compare.mjs'))
  if ($RealProvider) { $arguments += '--real-provider' }
  if ($DryRun) {
    $provider = if ($RealProvider) { 'REAL Anthropic provider (spends money)' } else { 'scripted rehearsal provider (free)' }
    Write-Log "Would run: $node $($arguments -join ' ')"
    Write-Log "Provider: $provider"
    if ($RealProvider -and -not $env:ANTHROPIC_API_KEY) { Write-Log 'Note: ANTHROPIC_API_KEY is not set; a real run would fail.' }
    Complete-OwnerRun 0 'Dry run: no build, trials or provider calls.'
  }
  $code = Invoke-Native $node $arguments $script:RepoRoot
  Complete-OwnerRun $code
} catch { Complete-OwnerRun 1 $_.Exception.Message }
