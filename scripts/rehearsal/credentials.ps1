# Dot-sourced by the owner wrapper. Never send op output/errors to logs.
function Get-RehearsalCredentials([string]$Tier, [string]$Assistant, [bool]$DryRun) {
  $needed = @{}
  if ($Tier -notin @('audio','scripted')) { throw 'Use the Mock interview tab in Sanas for live practice.' }
  if ($Tier -eq 'audio') { $needed.DEEPGRAM_API_KEY = 'op://Sanas/Sanas - Deepgram/credential' }
  if ($Assistant -eq 'claude') { $needed.ANTHROPIC_API_KEY = 'op://Sanas/Sanas - Claude/credential' }
  foreach ($name in ($needed.Keys | Sort-Object)) {
    if ([Environment]::GetEnvironmentVariable($name, 'Process')) { continue }
    if ($DryRun) { Write-Log "Would fetch $name from $($needed[$name]) via op (Windows Hello may prompt)."; continue }
    $op = Get-Command op -ErrorAction SilentlyContinue
    if (-not $op) { throw '1Password CLI (op) is missing. Install/sign in yourself, or supply the required environment variable, then rerun.' }
    $secret = $null
    try {
      $secret = & $op read $needed[$name] 2>$null
      if ($LASTEXITCODE -ne 0 -or -not $secret -or $secret -is [array]) {
        throw 'unavailable'
      }
      [Environment]::SetEnvironmentVariable($name, [string]$secret, 'Process')
      Add-LogSecret ([string]$secret)
    } catch {
      throw "1Password could not read $name. Unlock/sign in to 1Password, enable CLI integration, and approve Windows Hello; then rerun."
    } finally { $secret = $null }
  }
}

function Clear-RehearsalCredentials {
  foreach ($name in @('ANTHROPIC_API_KEY', 'DEEPGRAM_API_KEY')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
}
