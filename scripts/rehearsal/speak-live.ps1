# Private child of the explicit live rehearsal. Text arrives as base64 UTF-8 on stdin,
# never as PowerShell source or command-line text. Synthesis uses the default output.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))
  $speech.SetOutputToDefaultAudioDevice()
  $speech.Speak($text)
} finally { $speech.Dispose() }
