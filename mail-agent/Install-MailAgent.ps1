# Run on the MailEnable Windows server from an elevated PowerShell.
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run PowerShell as Administrator.' }
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$nodeVersion = [Version]((& $nodeExecutable -p 'process.versions.node').Trim())
if ($nodeVersion -lt [Version]'22.15.0') { throw 'Install Node.js 24 LTS (or 22.15+) before continuing.' }
$target = 'C:\NileLink\MailAgent'
New-Item -ItemType Directory -Path $target -Force | Out-Null
$userSid = $identity.User.Value
& icacls.exe $target /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' "*$($userSid):(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict installation-folder permissions.' }
foreach ($filename in @('package.json','package-lock.json','server.mjs','service.mjs','protocol.mjs','install-service.cjs','README.md')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $filename) -Destination (Join-Path $target $filename) -Force }
$configDestination = Join-Path $target 'agent.config.json'
if (-not (Test-Path -LiteralPath $configDestination)) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'agent.config.json') -Destination $configDestination }
New-Item -ItemType Directory -Path (Join-Path $target 'state') -Force | Out-Null
$npmCli = Join-Path (Split-Path -Parent $nodeExecutable) 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) { throw 'npm was not found alongside Node.js. Install the official Node.js distribution with npm.' }
Push-Location $target
try {
  & $nodeExecutable --use-system-ca $npmCli ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. No TLS verification was disabled.' }
  & $nodeExecutable 'install-service.cjs'
  if ($LASTEXITCODE -ne 0) { throw 'Service installation failed.' }
} finally { Pop-Location }
Write-Host 'Installed in C:\NileLink\MailAgent. Next: configure MailEnable TLS and a Cloudflare Tunnel to http://127.0.0.1:8791.'
Write-Host 'Do not share agent.config.json or its key. Keep the state folder for send idempotency.'
