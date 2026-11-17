# Local E2E: starts the real agent (fake mongodump) + fake SMTP/IMAP listeners + fake MailEnable queue tree,
# then probes /v1/mail/status and /v1/backups. Nothing here touches production.
$ErrorActionPreference = "Stop"
$agentDir = Split-Path $PSScriptRoot -Parent
$repo = Split-Path $agentDir -Parent
$root = Join-Path $env:TEMP "nl-me-e2e"
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
foreach ($d in "Inbound", "Outbound", "Badmail") { New-Item -ItemType Directory -Force "$root\Queues\SMTP\$d" | Out-Null }
"x" | Set-Content "$root\Queues\SMTP\Inbound\a.mai"
"x" | Set-Content "$root\Queues\SMTP\Inbound\a.mes"
"x" | Set-Content "$root\Queues\SMTP\Badmail\z.mai"

$sec = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$env:AGENT_HMAC_KEYS = "{`"k1`":`"$sec`"}"
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/mock"
$env:AGENT_PORT = "8788"
$env:MAILENABLE_PATH = $root
$env:MAILENABLE_SMTP_PORT = "2525"
$env:MAILENABLE_IMAP_PORT = "1143"
$env:BACKUP_ROOT = "$env:TEMP\nl-e2e-backups"
$env:MOCK_DUMP_DELAY_MS = "100"

$ports = Start-Process node -PassThru -WindowStyle Hidden -ArgumentList "$PSScriptRoot\e2e-fake-ports.cjs"
$agent = Start-Process node -PassThru -WindowStyle Hidden -WorkingDirectory $agentDir -ArgumentList "node_modules/tsx/dist/cli.mjs", "scripts/dev-mock-agent.ts"
try {
  Start-Sleep 10
  $env:BACKUP_AGENT_URL = "http://127.0.0.1:8788"
  $env:BACKUP_AGENT_KEY_ID = "k1"
  $env:BACKUP_AGENT_HMAC_SECRET = $sec
  Remove-Item Env:CF_ACCESS_CLIENT_ID, Env:CF_ACCESS_CLIENT_SECRET -ErrorAction SilentlyContinue
  Write-Host "--- /v1/mail/status"
  node "$agentDir/scripts/probe-agent.mjs" /v1/mail/status
  Write-Host "--- /v1/backups (backup route still works)"
  node "$agentDir/scripts/probe-agent.mjs" "/v1/backups?limit=1"
  Write-Host "--- unavailable scenario: stop the fake SMTP/IMAP listeners"
  Stop-Process -Id $ports.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep 1
  node "$agentDir/scripts/probe-agent.mjs" "/v1/mail/status?refresh=true"
} finally {
  Stop-Process -Id $agent.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $ports.Id -Force -ErrorAction SilentlyContinue
}
