param([switch]$DryRun)
. (Join-Path $PSScriptRoot '../owner/owner-run.ps1')
Invoke-OwnerRun 'release-start' {
  if ($DryRun) { Write-OwnerLog 'DRY RUN: resolve main SHA, dispatch release.yml with unique correlation ID, wait for its run. No dispatch performed.'; return }
  $head = Invoke-GhJson @('api', 'repos/dirtyredz/Sanas/commits/main')
  $sha = $head.sha
  $request = [guid]::NewGuid().ToString('N')
  Write-OwnerLog "Source SHA: $sha; request: $request"
  & gh workflow run release.yml --repo dirtyredz/Sanas --ref main -f "request_id=$request" -f "expected_sha=$sha" 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Release dispatch failed.' }
  $run = $null
  for ($i = 0; $i -lt 60; $i++) {
    $runs = Invoke-GhJson @('run', 'list', '--repo', 'dirtyredz/Sanas', '--workflow', 'release.yml', '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,displayTitle,headSha,url')
    $matches = @($runs | Where-Object { $_.displayTitle -eq "Release $request" -and $_.headSha -eq $sha })
    if ($matches.Count -gt 1) { throw 'Ambiguous dispatch identity.' }
    if ($matches.Count -eq 1) { $run = $matches[0]; break }
    Start-Sleep -Seconds 5
  }
  if (-not $run) { throw 'Dispatch accepted but run not found. Inspect Actions before retrying.' }
  Write-OwnerLog $run.url
  & gh run watch $run.databaseId --repo dirtyredz/Sanas --exit-status 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Release run failed. Inspect the recorded run URL.' }
  Write-OwnerLog 'Release run succeeded.'
}
