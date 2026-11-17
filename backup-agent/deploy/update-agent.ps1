<#
.SYNOPSIS
  Updates the Nile Link Backup Agent on the Windows Server to a new release (adds /v1/mail/status).

.DESCRIPTION
  Run from an elevated PowerShell INSIDE the extracted release folder (the one containing dist\, package.json
  and this deploy\ folder). It will:
    1. locate the installed service and its install directory
    2. back up the current dist\ (dist.bak-<timestamp>)
    3. stop the service, replace dist\ (and package files), start the service
    4. verify locally (signed request) that /v1/health reports mail-monitoring and /v1/mail/status returns data
    5. roll back automatically if verification fails

  It never touches .env, the backup root (C:\NileLink\Backups), backups, logs, scheduler state or cloudflared.

.PARAMETER InstallDir  Agent folder (contains dist\ and node_modules\). Auto-detected from the service if omitted.
.PARAMETER ServiceName Windows service name. Auto-detected (*nilelinkbackupagent*) if omitted.
.PARAMETER SkipVerify  Skip the post-update verification (not recommended).
#>
[CmdletBinding()]
param(
  [string]$InstallDir,
  [string]$ServiceName,
  [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
$release = Split-Path $PSScriptRoot -Parent

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Fail "Run this script from an elevated (Administrator) PowerShell."
}
if (-not (Test-Path (Join-Path $release "dist\src\index.js"))) { Fail "dist\src\index.js not found in release folder '$release'." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "node.exe not found in PATH." }

# ---- 1. locate service + install dir ----
Step "Locating the Backup Agent service"
if (-not $ServiceName) {
  $svc = Get-CimInstance Win32_Service | Where-Object { $_.Name -like "*nilelinkbackupagent*" -or $_.DisplayName -like "*NileLinkBackupAgent*" } | Select-Object -First 1
  if (-not $svc) { Fail "Service not found. Pass -ServiceName (see: Get-Service | ? Name -like '*nile*')." }
  $ServiceName = $svc.Name
  if (-not $InstallDir) {
    $exe = ($svc.PathName -replace '^"([^"]+)".*$', '$1')
    $daemon = Split-Path $exe -Parent
    if ((Split-Path $daemon -Leaf) -eq "daemon") { $InstallDir = Split-Path $daemon -Parent }
  }
}
if (-not $InstallDir -or -not (Test-Path (Join-Path $InstallDir "dist"))) { Fail "Could not detect InstallDir. Pass -InstallDir 'C:\path\to\backup-agent'." }
Write-Host "Service    : $ServiceName"
Write-Host "InstallDir : $InstallDir"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $InstallDir "dist.bak-$stamp"
$dist = Join-Path $InstallDir "dist"

function Stop-Agent {
  Step "Stopping service $ServiceName"
  if ((Get-Service $ServiceName).Status -ne "Stopped") { Stop-Service $ServiceName -Force }
  (Get-Service $ServiceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(60))
  # node-windows can leave the child node.exe behind; stop only the agent's own process
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*dist\src\index.js*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
function Start-Agent {
  Step "Starting service $ServiceName"
  Start-Service $ServiceName
  (Get-Service $ServiceName).WaitForStatus("Running", [TimeSpan]::FromSeconds(60))
  Start-Sleep -Seconds 6
}

# ---- 2. backup current dist ----
Step "Backing up current dist -> $backupDir"
Copy-Item $dist $backupDir -Recurse -Force

# ---- 3. replace ----
Stop-Agent
try {
  Step "Replacing dist\"
  robocopy (Join-Path $release "dist") $dist /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
  foreach ($f in "package.json", "package-lock.json") {
    if (Test-Path (Join-Path $release $f)) { Copy-Item (Join-Path $release $f) (Join-Path $InstallDir $f) -Force }
  }
  $scriptsDir = Join-Path $InstallDir "scripts"
  New-Item -ItemType Directory -Force $scriptsDir | Out-Null
  Copy-Item (Join-Path $release "scripts\probe-agent.mjs") $scriptsDir -Force -ErrorAction SilentlyContinue

  if (-not (Test-Path (Join-Path $InstallDir "node_modules"))) {
    Step "node_modules missing -> npm ci --omit=dev"
    Push-Location $InstallDir; npm ci --omit=dev; Pop-Location
  }
  $global:LASTEXITCODE = 0
  $LASTEXITCODE = 0
  Start-Agent

  # ---- 4. verify ----
  if (-not $SkipVerify) {
    Step "Verifying locally (signed request, no secrets printed)"
    $envFile = Join-Path $InstallDir ".env"
    $vars = @{}
    if (Test-Path $envFile) {
      foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') { $vars[$Matches[1]] = $Matches[2].Trim('"', "'") }
      }
    }
    $keysJson = if ($vars["AGENT_HMAC_KEYS"]) { $vars["AGENT_HMAC_KEYS"] } else { [Environment]::GetEnvironmentVariable("AGENT_HMAC_KEYS", "Machine") }
    $port = if ($vars["AGENT_PORT"]) { $vars["AGENT_PORT"] } else { "8787" }
    if (-not $keysJson) { throw "AGENT_HMAC_KEYS not found in $envFile or machine environment; cannot verify." }
    $keys = $keysJson | ConvertFrom-Json
    $keyId = ($keys.PSObject.Properties | Select-Object -First 1).Name
    $env:BACKUP_AGENT_URL = "http://127.0.0.1:$port"
    $env:BACKUP_AGENT_KEY_ID = $keyId
    $env:BACKUP_AGENT_HMAC_SECRET = ($keys.PSObject.Properties | Select-Object -First 1).Value
    Remove-Item Env:CF_ACCESS_CLIENT_ID, Env:CF_ACCESS_CLIENT_SECRET -ErrorAction SilentlyContinue
    $probe = Join-Path $InstallDir "scripts\probe-agent.mjs"

    $health = (node $probe /v1/health) -join "`n"
    if ($health -notmatch '"capabilities":\[[^\]]*"mail-monitoring"') { throw "Health does not advertise mail-monitoring. Output: $($health.Substring(0, [Math]::Min(300,$health.Length)))" }
    $mail = (node $probe /v1/mail/status?refresh=true) -join "`n"
    if ($mail -notmatch '^200 ' -or $mail -notmatch '"services"') { throw "/v1/mail/status failed. Output: $($mail.Substring(0, [Math]::Min(300,$mail.Length)))" }
    $b = (node $probe "/v1/backups?limit=1") -join "`n"
    if ($b -notmatch '^200 ') { throw "/v1/backups failed after update." }
    Write-Host "mail status: $($mail.Substring(0, [Math]::Min(700,$mail.Length)))" -ForegroundColor Green
  }
  Write-Host "`nUPDATE OK. Previous build kept in: $backupDir" -ForegroundColor Green
}
catch {
  Write-Host "`nUpdate failed: $($_.Exception.Message)" -ForegroundColor Red
  Step "Rolling back to $backupDir"
  try { Stop-Agent } catch {}
  robocopy $backupDir $dist /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  Start-Agent
  Write-Host "Rolled back. The previous agent build is running again." -ForegroundColor Yellow
  exit 1
}
