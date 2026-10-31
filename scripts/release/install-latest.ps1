param([switch]$DryRun)
. (Join-Path $PSScriptRoot '../owner/owner-run.ps1')
. (Join-Path $PSScriptRoot 'install-version.ps1')
function Assert-SanasExited {
  $active = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -ieq 'Sanas.exe' -or
    ($_.Name -ieq 'electron.exe' -and ($_.ExecutablePath -match '[\\/]sanas[\\/]' -or $_.CommandLine -match '(?i)sanas|out[\\/]main[\\/]index.js'))
  })
  if ($active.Count) { throw 'Exit dev and installed Sanas before installing. No processes were stopped.' }
}
Invoke-OwnerRun 'install-latest' {
  if ($DryRun) { Write-OwnerLog 'DRY RUN: validate latest stable installer, require Sanas exited, cold-backup and hash all user data, install and verify version. No download, backup or installation performed.'; return }
  Assert-SanasExited
  $release = Invoke-GhJson @('api', 'repos/dirtyredz/Sanas/releases/latest')
  if ($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { throw 'Invalid stable release.' }
  $version = $release.tag_name.Substring(1)
  $folder = Join-Path $script:OwnerRoot ('.tmp/install/' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
  & gh release download $release.tag_name --repo dirtyredz/Sanas --dir $folder --pattern "Sanas-$version-x64-Setup.exe" --pattern "Sanas-$version-x64-Setup.exe.blockmap" --pattern 'latest.yml' 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Release download failed.' }
  & node (Join-Path $PSScriptRoot 'validate-download.mjs') $folder $version 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Installer metadata verification failed.' }
  Assert-SanasExited
  $source = Join-Path $env:APPDATA 'sanas'
  if (Test-Path -LiteralPath $source) {
    if ((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'User data root is a reparse point; backup needs manual inspection.' }
    $backup = Join-Path $env:APPDATA ('sanas-backups/' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    $manifest = @()
    foreach ($file in Get-ChildItem -LiteralPath $source -Recurse -Force) {
      if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'User data contains a reparse point; backup needs manual inspection.' }
      $relative = $file.FullName.Substring($source.Length + 1)
      $target = Join-Path $backup $relative
      if ($file.PSIsContainer) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
      New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
      $before = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
      Copy-Item -LiteralPath $file.FullName -Destination $target
      $after = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
      if ($before -ne $after -or $before -ne (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw 'Cold backup verification failed.' }
      $manifest += @{ path = $relative; sha256 = $before }
    }
    if (@(Get-ChildItem -LiteralPath $source -File -Recurse -Force).Count -ne $manifest.Count) { throw 'User data changed during backup.' }
    Assert-SanasExited
    foreach ($entry in $manifest) {
      if ((Get-FileHash -LiteralPath (Join-Path $source $entry.path) -Algorithm SHA256).Hash -ne $entry.sha256 -or (Get-FileHash -LiteralPath (Join-Path $backup $entry.path) -Algorithm SHA256).Hash -ne $entry.sha256) { throw 'Backup manifest verification failed.' }
    }
    ConvertTo-Json -InputObject $manifest -Depth 3 | Set-Content -LiteralPath ($backup + '.manifest.json')
    Write-OwnerLog "Verified cold backup: $backup"
  }
  Assert-SanasExited
  $installer = Join-Path $folder "Sanas-$version-x64-Setup.exe"
  $process = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw 'Installer failed.' }
  $installed = Join-Path $env:LOCALAPPDATA 'Programs/sanas/Sanas.exe'
  if (-not (Test-Path -LiteralPath $installed)) { throw 'Installed executable not found at expected per-user path.' }
  $installedVersion = (Get-Item -LiteralPath $installed).VersionInfo.ProductVersion
  if (-not (Test-SanasInstalledVersion -InstalledVersion $installedVersion -ReleaseVersion $version)) { throw 'Installed version mismatch.' }
  Write-OwnerLog "Installed $version. Launch Sanas and confirm existing jobs, meetings, transcripts and recordings."
}
