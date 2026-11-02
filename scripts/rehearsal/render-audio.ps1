<#
.SYNOPSIS
Render version 1 scenario utterances to a stereo 16 kHz WAV with offline Windows speech.
.DESCRIPTION
Channel 0 is Me, channel 1 is Them. Throws if speech exceeds its declared duration.
Exit 0 means OK; exit 1 means failure. No network or installed third-party voices required.
.PARAMETER Scenario
Scenario JSON path relative to the repository or absolute.
.PARAMETER Output
Output WAV path relative to the repository or absolute.
.PARAMETER DryRun
Describe the output without synthesizing speech.
#>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Scenario, [Parameter(Mandatory=$true)][string]$Output, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'owner-run.ps1')
Initialize-OwnerRun 'rehearsal-audio'
$voice = $null
try {
  if (-not [IO.Path]::IsPathRooted($Scenario)) { $Scenario = Join-Path $script:RepoRoot $Scenario }
  if (-not [IO.Path]::IsPathRooted($Output)) { $Output = Join-Path $script:RepoRoot $Output }
  $s = Get-Content -LiteralPath $Scenario -Raw | ConvertFrom-Json
  if ($s.version -ne 1 -or $s.durationMs -le 0 -or $s.durationMs -gt 600000) { throw 'Invalid scenario version or duration.' }
  if ($DryRun) { Complete-OwnerRun 0 'Dry run: no speech synthesized.' }
  Add-Type -AssemblyName System.Speech
  $voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $voice.Rate = 2
  $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $pcm = New-Object byte[] ([int]$s.durationMs * 64)
  foreach ($step in $s.steps) {
    if ($step.kind -ne 'utterance') { continue }
    if ($step.channel -notin @('me','them') -or $step.atMs -lt 0 -or $step.durationMs -le 0 -or ($step.atMs + $step.durationMs) -gt $s.durationMs) { throw 'Invalid utterance timing/channel.' }
    $stream = New-Object IO.MemoryStream
    try {
      # Raw linear16 stream: no WAV-header guessing or network TTS.
      $voice.SetOutputToAudioStream($stream, $format)
      $voice.Speak([string]$step.text)
      $clip = $stream.ToArray()
    } finally { $voice.SetOutputToNull(); $stream.Dispose() }
    if ($clip.Length -gt ([int]$step.durationMs * 32)) { throw "Speech exceeds duration for step $($step.id); enlarge duration and move following steps." }
    $channel = if ($step.channel -eq 'me') { 0 } else { 1 }
    for ($i = 0; $i -lt $clip.Length; $i += 2) {
      $at = ([int]$step.atMs * 16 + $i / 2) * 4 + $channel * 2
      $sum = [int][BitConverter]::ToInt16($pcm, $at) + [int][BitConverter]::ToInt16($clip, $i)
      $value = [int16][Math]::Max(-32768, [Math]::Min(32767, $sum))
      [BitConverter]::GetBytes($value).CopyTo($pcm, $at)
    }
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $Output) | Out-Null
  $file = [IO.File]::Create($Output)
  $writer = New-Object IO.BinaryWriter($file)
  try {
    $writer.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $writer.Write([int](36 + $pcm.Length))
    $writer.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt ')); $writer.Write([int]16)
    $writer.Write([int16]1); $writer.Write([int16]2); $writer.Write([int]16000); $writer.Write([int]64000)
    $writer.Write([int16]4); $writer.Write([int16]16); $writer.Write([Text.Encoding]::ASCII.GetBytes('data'))
    $writer.Write([int]$pcm.Length); $writer.Write($pcm)
  } finally { $writer.Dispose(); $file.Dispose() }
  Write-Log "Rendered WAV: $Output"
  Complete-OwnerRun 0
} catch { Complete-OwnerRun 1 $_.Exception.Message }
finally { if ($voice) { $voice.Dispose() } }
