param([int]$TimeoutSeconds = 60)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$exe = Join-Path $root 'release/win-unpacked/Sanas.exe'
$folder = Join-Path $root ('.tmp/smoke/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$report = Join-Path $folder 'report.json'
$process = $null
try {
  $process = Start-Process -FilePath $exe -ArgumentList @('--smoke', ('--smoke-report="' + $report + '"')) -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $folder 'stdout.log') -RedirectStandardError (Join-Path $folder 'stderr.log')
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) { throw 'Packaged smoke timed out' }
  $process.Refresh()
  if ($process.ExitCode -ne 0) { throw "Packaged smoke failed: exit $($process.ExitCode)" }
  if (-not (Test-Path -LiteralPath $report)) { throw 'Packaged smoke report missing' }
  $result = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
  $version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
  if ($result.result -ne 'ok' -or -not $result.packaged -or $result.version -ne $version -or $result.arch -ne 'x64' -or $result.schemaVersion -ne 7 -or -not $result.electron -or -not $result.abi -or $result.bindingPath -notmatch 'better_sqlite3.node$') { throw 'Invalid smoke report' }
  Write-Output "OK packaged smoke: $report"
} finally {
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force; $process.WaitForExit() }
}
