function Test-SanasInstalledVersion {
  param(
    [Parameter(Mandatory)][string]$InstalledVersion,
    [Parameter(Mandatory)][string]$ReleaseVersion
  )
  $actual = $InstalledVersion.Trim()
  $expected = $ReleaseVersion.Trim()
  return $actual -eq $expected -or $actual -eq ($expected + '.0')
}
