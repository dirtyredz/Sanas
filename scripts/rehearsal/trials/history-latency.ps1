# Fixture-only. Build first with npm run build. No credentials or downloads.
$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'history-latency.mjs')
exit $LASTEXITCODE
