<#
.SYNOPSIS
Old-vs-new answer prompt eval on the invented topic-switch interview ("broken record").
.DESCRIPTION
Extracts the prompt builders from an older git ref into .tmp/eval/old-<sha>, then runs
scripts/eval/topic-switch.eval.ts through vitest: each version answers the same invented
interview (6 exchanges, an automatic answer and an Answer now each = 12 calls per version per
sample) and a side-by-side Markdown report lands in .tmp/eval/. Scoring is deterministic:
earlier-topic terms carried into a later answer, the asked term missing, factual answers over
40 words. Uses only the fixture in src/main/services/assistant/answer-context/topic-switch-fixture.ts; it
never opens the Sanas database or any meeting data. Runs from any directory and logs to
.tmp/owner-runs/. Live runs call the Anthropic API (paid); -DryRun makes no calls.
.PARAMETER OldRef
Git ref of the "old" prompt builders. Default 9ea28c9, the commit before the 2026-11-04 change.
.PARAMETER Samples
Passes per version (default 1 = 24 calls in total; the review suggests 3).
.PARAMETER AutoModel
Model for automatic answers (default claude-sonnet-5-5, the app's nudge model).
.PARAMETER NowModel
Model for Answer now (default claude-opus-5-5, the app's answer model).
.PARAMETER DumpPrompts
Also write every first-sample prompt (system + user) to .tmp/eval/prompts/ for inspection.
.PARAMETER DryRun
Build every prompt with canned answers and report prompt sizes only. No provider calls.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\dirty\projects\sanas\scripts\eval\topic-switch.ps1 -DryRun
.EXAMPLE
$env:ANTHROPIC_API_KEY = '<key>'; powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\dirty\projects\sanas\scripts\eval\topic-switch.ps1 -Samples 3
.NOTES
Exit codes: 0 report written; 1 any failure (missing key, git/tar/vitest error).
#>
[CmdletBinding()]
param(
  [string]$OldRef = '9ea28c9',
  [ValidateRange(1, 10)][int]$Samples = 1,
  [string]$AutoModel = '',
  [string]$NowModel = '',
  [switch]$DumpPrompts,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../rehearsal/owner-run.ps1')
Initialize-OwnerRun 'eval-topic-switch'
Add-LogSecret $env:ANTHROPIC_API_KEY
Add-LogSecret $env:ANTHROPIC_WORKSPACE_ID
$saved = @{}
try {
  if (-not $DryRun -and -not $env:ANTHROPIC_API_KEY) { throw 'ANTHROPIC_API_KEY is not set. Set it in this shell, or use -DryRun.' }
  $git = Find-Tool 'git.exe'
  $tar = Find-Tool 'tar.exe'
  $npx = Find-Tool 'npx.cmd'
  if (-not $git -or -not $tar -or -not $npx) { throw 'git, tar and npx must be on PATH.' }
  $sha = (& $git -C $script:RepoRoot rev-parse --short=12 "$OldRef^{commit}" 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $sha) { throw "Unknown git ref: $OldRef" }
  $sha = "$sha".Trim()
  $evalDir = Join-Path $script:RepoRoot '.tmp/eval'
  $oldRoot = Join-Path $evalDir "old-$sha"
  if (-not (Test-Path -LiteralPath (Join-Path $oldRoot 'src'))) {
    New-Item -ItemType Directory -Path $oldRoot -Force | Out-Null
    $archive = Join-Path $evalDir "old-$sha.tar"
    if ((Invoke-Native $git @('archive', '--format=tar', "--output=$archive", $sha, 'src') $script:RepoRoot) -ne 0) { throw 'git archive failed.' }
    if ((Invoke-Native $tar @('-xf', $archive, '-C', $oldRoot) $script:RepoRoot) -ne 0) { throw 'tar extract failed.' }
    Remove-Item -LiteralPath $archive -Force
  }
  $report = Join-Path $evalDir ('topic-switch-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + $(if ($DryRun) { '-dry' } else { '' }) + '.md')
  Write-Log "Old builders: $OldRef ($sha) from $oldRoot; samples: $Samples; dry run: $([bool]$DryRun)"
  $vars = @{
    EVAL_OLD_ROOT = $oldRoot; EVAL_OLD_REF = "$OldRef ($sha)"; EVAL_OUT = $report
    EVAL_SAMPLES = "$Samples"; EVAL_DRY = $(if ($DryRun) { '1' } else { '0' })
    EVAL_AUTO_MODEL = $AutoModel; EVAL_NOW_MODEL = $NowModel
    EVAL_DUMP = $(if ($DumpPrompts) { '1' } else { '0' })
  }
  foreach ($k in $vars.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $vars[$k]) }
  $code = Invoke-Native $npx @('vitest', 'run', '--config', 'scripts/eval/vitest.config.mts') $script:RepoRoot
  if ($code -ne 0) { throw "Eval run failed (vitest exit $code)." }
  if (-not (Test-Path -LiteralPath $report)) { throw 'The eval did not write a report.' }
  Write-Log "Report: $report"
  Complete-OwnerRun 0
} catch {
  Complete-OwnerRun 1 $_.Exception.Message
} finally {
  foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
}
