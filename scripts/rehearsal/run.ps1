<#
.SYNOPSIS
Run an isolated Sanas meeting rehearsal from any directory.
.DESCRIPTION
Builds local sources, launches explicit rehearsal mode, prints each assertion and exits
with 0 on success or 1 on failure. No downloads. Logs are redacted and timestamped.
Audio and Claude incur provider charges; missing credentials come from 1Password via op.
.PARAMETER Scenario
Starter name (client-checkin, meeting-context, standup) or JSON path relative to the repository.
.PARAMETER Tier
scripted or audio. The retired live tier points to the Mock interview tab.
.PARAMETER Assistant
canned or claude.
.PARAMETER Visible
Show the real overlay while the scenario runs.
.PARAMETER Audio
Existing 16 kHz linear16 mono/stereo Sanas WAV, relative to the repository or absolute.
.PARAMETER RealCapture
Use the actual desktop for screen steps. Opens a fixture and protected overlay.
.PARAMETER DryRun
Validate paths and describe the run without building, launching or calling providers.
.EXAMPLE
& ./scripts/rehearsal/run.ps1 -Scenario client-checkin -Tier scripted -Assistant canned
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Scenario,
  [ValidateSet('scripted','audio','live')][string]$Tier = 'scripted',
  [ValidateSet('canned','claude')][string]$Assistant = 'canned',
  [switch]$Visible, [string]$Audio, [switch]$RealCapture, [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'owner-run.ps1')
. (Join-Path $PSScriptRoot 'credentials.ps1')
Initialize-OwnerRun 'rehearsal'
Add-LogSecret $env:DEEPGRAM_API_KEY
Add-LogSecret $env:ANTHROPIC_API_KEY
Add-LogSecret $env:ANTHROPIC_WORKSPACE_ID
$child = $null
try {
  if ($Tier -eq 'live') { throw 'Live rehearsals moved to the Mock interview tab in Sanas. Open the app and use its saved keys.' }
  $scenarioPath = if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "scenarios/$Scenario.json")) {
    Join-Path $PSScriptRoot "scenarios/$Scenario.json"
  } elseif ([IO.Path]::IsPathRooted($Scenario)) { $Scenario } else { Join-Path $script:RepoRoot $Scenario }
  $scenarioPath = (Resolve-Path -LiteralPath $scenarioPath).Path
  $spec = Get-Content -LiteralPath $scenarioPath -Raw | ConvertFrom-Json
  if ($spec.version -ne 1) { throw 'Unsupported scenario version.' }
  if ($spec.mode -eq 'live') { throw 'Use the Mock interview tab in Sanas for live plans.' }
  if ($Audio -and -not [IO.Path]::IsPathRooted($Audio)) { $Audio = Join-Path $script:RepoRoot $Audio }
  if (-not $Audio -and $spec.audio) { $Audio = [IO.Path]::GetFullPath((Join-Path (Split-Path $scenarioPath) $spec.audio)) }
  if ($Audio -and -not (Test-Path -LiteralPath $Audio)) { throw 'Audio input is missing.' }
  Write-Log "Scenario: $($spec.name); tier: $Tier; assistant: $Assistant; isolated profile under .tmp/rehearsal"
  Get-RehearsalCredentials $Tier $Assistant ([bool]$DryRun)
  if ($DryRun) { Complete-OwnerRun 0 'Dry run: no build, audio synthesis, capture or provider calls.' }
  $electron = Join-Path $script:RepoRoot 'node_modules/electron/dist/electron.exe'
  if (-not (Test-Path -LiteralPath $electron)) { throw 'Local Electron dependencies are missing; no downloads attempted.' }
  # Respect other builds/editors; this wrapper never terminates another checkout.
  $deadline = (Get-Date).AddMinutes(45)
  do {
    $busy = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'electron-vite.*build') })
    if (-not $busy.Count) { break }
    if ((Get-Date) -ge $deadline) { throw 'Another Electron/build process remained active for 45 minutes.' }
    Write-Log 'Waiting for another Electron/build process to finish.'
    Start-Sleep -Seconds 60
  } while ($true)
  $code = Invoke-Native (Find-Tool 'npm.cmd') @('run','build') $script:RepoRoot
  if ($code -ne 0) { throw 'Local build failed.' }
  if ($Tier -eq 'audio' -and -not $Audio) {
    $Audio = Join-Path $script:RepoRoot ('.tmp/owner-runs/rehearsal-' + $PID + '.wav')
    $code = Invoke-Native (Find-Tool 'powershell.exe') @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'render-audio.ps1'),'-Scenario',$scenarioPath,'-Output',$Audio) $script:RepoRoot
    if ($code -ne 0) { throw 'Offline speech rendering failed.' }
  }
  $report = Join-Path $script:RepoRoot ('.tmp/owner-runs/rehearsal-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID + '.json')
  $arguments = @((Join-Path $script:RepoRoot 'out/main/index.js'),'--rehearsal',"--rehearsal-root=$($script:RepoRoot)","--scenario=$scenarioPath","--tier=$Tier","--assistant=$Assistant","--rehearsal-report=$report")
  if ($Visible) { $arguments += '--visible' }
  if ($RealCapture) { $arguments += '--real-capture' }
  if ($Audio) { $arguments += "--audio=$Audio" }
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $electron
  $info.Arguments = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $info.WorkingDirectory = $script:RepoRoot
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $child = New-Object Diagnostics.Process
  $child.StartInfo = $info
  if (-not $child.Start()) { throw 'Electron did not start.' }
  $stdout = $child.StandardOutput.ReadToEndAsync()
  $stderr = $child.StandardError.ReadToEndAsync()
  $timeout = (Get-Date).AddMilliseconds([Math]::Max(600000, [double]$spec.durationMs + 420000))
  while (-not $child.WaitForExit(1000)) {
    if ((Get-Date) -ge $timeout) { throw 'Rehearsal timed out.' }
  }
  # Provider output is intentionally not copied to logs; report results are the public diagnostics.
  $null = $stdout.GetAwaiter().GetResult()
  $null = $stderr.GetAwaiter().GetResult()
  if (-not (Test-Path -LiteralPath $report)) { throw 'Rehearsal did not produce a report.' }
  $result = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
  foreach ($check in $result.checks) { Write-Log (('{0}: {1} - {2}' -f $(if ($check.passed) { 'PASS' } else { 'FAIL' }), $check.id, $check.reason)) }
  Write-Log "Report: $report"
  if ($result.error) { Write-Log $result.error }
  if ($child.ExitCode -ne 0 -or -not $result.passed) { throw 'Rehearsal failed.' }
  Complete-OwnerRun 0
} catch {
  Complete-OwnerRun 1 $_.Exception.Message
} finally {
  Clear-RehearsalCredentials
  if ($child) {
    if (-not $child.HasExited) { & taskkill.exe /PID $child.Id /T /F 2>$null | Out-Null; $child.WaitForExit() }
    $child.Dispose()
  }
}
