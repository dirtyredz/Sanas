param([int]$TimeoutSeconds = 60)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$exe = Join-Path $root 'release/win-unpacked/Sanas.exe'
$folder = Join-Path $root ('.tmp/smoke/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$report = Join-Path $folder 'report.json'
$userData = Join-Path $folder 'user-data'
$resolvedFolder = [IO.Path]::GetFullPath($folder).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$resolvedUserData = [IO.Path]::GetFullPath($userData)
if (-not $resolvedUserData.StartsWith($resolvedFolder, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid smoke userData path' }
$process = New-Object System.Diagnostics.Process
$process.StartInfo.FileName = $exe
$process.StartInfo.Arguments = '--smoke --smoke-report="' + $report + '" --smoke-user-data="' + $userData + '"'
$process.StartInfo.UseShellExecute = $false
$process.StartInfo.CreateNoWindow = $true
$process.StartInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$process.StartInfo.RedirectStandardOutput = $true
$process.StartInfo.RedirectStandardError = $true
$started = $false
try {
  $started = $process.Start()
  if (-not $started) { throw 'Could not start packaged smoke' }
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) { throw 'Packaged smoke timed out' }
  if (-not $stdout.Wait(5000) -or -not $stderr.Wait(5000)) { throw 'Packaged smoke output did not close' }
  [IO.File]::WriteAllText((Join-Path $folder 'stdout.log'), $stdout.Result)
  [IO.File]::WriteAllText((Join-Path $folder 'stderr.log'), $stderr.Result)
  if ($process.ExitCode -ne 0) { throw "Packaged smoke failed: exit $($process.ExitCode)" }
  if (-not (Test-Path -LiteralPath $report)) { throw 'Packaged smoke report missing' }
  $result = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
  $version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
  if ($result.result -ne 'ok' -or -not $result.packaged -or $result.version -ne $version -or $result.arch -ne 'x64' -or $result.schemaVersion -ne 7 -or -not $result.electron -or -not $result.abi -or $result.bindingPath -notmatch 'better_sqlite3.node$') { throw 'Invalid smoke report' }
  Write-Output "OK packaged smoke: $report"
} finally {
  if ($started -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
  $process.Dispose()
  # Electron must be stopped before its active Chromium profile is removed.
  if (Test-Path -LiteralPath $resolvedUserData) { Remove-Item -LiteralPath $resolvedUserData -Recurse -Force }
}
