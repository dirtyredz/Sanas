# Dot-sourced by the owner wrapper. Never send vault output/errors to logs.
# Secrets come from the 1Password vault broker via vault-exec.mjs (service account, no prompt), never from op.
function Get-VaultExecPath {
  $dir = if ($env:ONEPASSWORD_VAULT_MCP_DIR) { $env:ONEPASSWORD_VAULT_MCP_DIR } else { Join-Path $HOME 'projects\mcp-servers\onepassword-vault-mcp' }
  $exe = Join-Path $dir 'vault-exec.mjs'
  if (-not (Test-Path -LiteralPath $exe)) { throw "vault-exec.mjs not found at $exe (set ONEPASSWORD_VAULT_MCP_DIR), or supply the required environment variable, then rerun." }
  return $exe
}

# Returns the secret for one op:// reference. Throws the vault-exec error code (never the secret or raw output).
function Read-VaultSecret([string]$Ref) {
  $vaultExec = Get-VaultExecPath
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { throw 'NODE_MISSING' }
  $errFile = [IO.Path]::GetTempFileName()
  try {
    # vault-exec puts the secret only in the child's environment; the child just echoes it back to us.
    $secret = & $node.Source $vaultExec --env "VE_VALUE=$Ref" -- $node.Source -e 'process.stdout.write(process.env.VE_VALUE)' 2>$errFile
    if ($LASTEXITCODE -ne 0 -or -not $secret -or $secret -is [array]) {
      $why = ((Get-Content -LiteralPath $errFile -ErrorAction SilentlyContinue) -join ' ')
      if ($why -match 'vault-exec:\s+([A-Z_]+):') { throw $Matches[1] }
      throw 'NO_ERROR_CODE'
    }
    return [string]$secret
  } finally { Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue }
}

function Get-RehearsalCredentials([string]$Tier, [string]$Assistant, [bool]$DryRun) {
  $needed = @{}
  if ($Tier -notin @('audio','scripted')) { throw 'Use the Mock interview tab in Sanas for live practice.' }
  if ($Tier -eq 'audio') { $needed.DEEPGRAM_API_KEY = 'op://Sanas/Sanas - Deepgram/credential' }
  if ($Assistant -eq 'claude') { $needed.ANTHROPIC_API_KEY = 'op://Sanas/Sanas - Claude/credential' }
  foreach ($name in ($needed.Keys | Sort-Object)) {
    if ([Environment]::GetEnvironmentVariable($name, 'Process')) { continue }
    if ($DryRun) { Write-Log "Would fetch $name from $($needed[$name]) via the vault broker (vault-exec; no prompt)."; continue }
    $secret = $null
    try {
      $secret = Read-VaultSecret $needed[$name]
      [Environment]::SetEnvironmentVariable($name, $secret, 'Process')
      Add-LogSecret $secret
    } catch {
      $code = $_.Exception.Message
      if ($code -notmatch '^[A-Z_]+$') { $code = 'VAULT_EXEC_FAILED' }
      throw "The vault broker could not read $name ($code). POLICY_DENIED means the agent service account's scope does not include the Sanas vault yet (owner: widen the scope with Rotate in onepassword-vault-mcp); BROKER_UNAVAILABLE or CREDENTIAL_* means the broker is not provisioned; NODE_MISSING means Node is not on PATH. Or supply $name in the environment, then rerun."
    } finally { $secret = $null }
  }
}

function Clear-RehearsalCredentials {
  foreach ($name in @('ANTHROPIC_API_KEY', 'DEEPGRAM_API_KEY')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
}
