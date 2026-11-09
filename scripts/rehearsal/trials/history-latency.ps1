<#
.SYNOPSIS
Measure live same-job history evidence latency against fixture data.
.DESCRIPTION
Bundles src/main/rehearsal/runner/history-latency.ts and runs it under the local Electron binary
in Node mode against fixtures it generates under <repo>\.tmp\history-latency. Fixture-only: no
credentials, no downloads, no network, no real user data. Build first with npm run build.
Exit codes: the exit code of the measurement run (0 success).
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\rehearsal\trials\history-latency.ps1
#>
$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'history-latency.mjs')
exit $LASTEXITCODE
