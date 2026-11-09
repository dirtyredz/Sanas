<#
.SYNOPSIS
Summarize answer-latency stage timings from copied Sanas app logs.
.DESCRIPTION
Reads the "[sanas] latency {...}" lines from the .log files in a folder you copied out of the
app's log directory and prints stage distributions (median, p90, missing counts), delivery and
discard tallies. The delivered-answer rule, medians and stage lists come from the in-app
latency-summary rules, bundled by esbuild at run time, so this report matches the app.
Local only: no network, no credentials, no downloads, nothing in the app is touched.
The run is logged and redacted under <repo>\.tmp\owner-runs\ and ends with one OK or FAILED line.
Exit codes: 0 summary produced; 1 no latency records, malformed records, missing folder or Node.
.PARAMETER LogCopy
Folder containing the copied *.log files (and rotated *.log.N files). Must already exist.
.PARAMETER DryRun
Check the folder and Node, count the log files, and change or read nothing else.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\rehearsal\trials\summarize.ps1 -LogCopy C:\Temp\sanas-logs
#>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$LogCopy, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'owner-run.ps1')
Initialize-OwnerRun 'latency-summary'
try {
  $source = (Resolve-Path -LiteralPath $LogCopy).Path
  $node = Find-Tool 'node.exe'
  if (-not $node) { throw 'node.exe was not found on PATH.' }
  $arguments = @((Join-Path $PSScriptRoot 'summarize.mjs'), $source)
  if ($DryRun) { $arguments += '--dry-run' }
  $code = Invoke-Native $node $arguments $script:RepoRoot
  Complete-OwnerRun $code
} catch { Complete-OwnerRun 1 $_.Exception.Message }
