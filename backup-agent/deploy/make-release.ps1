# Builds the agent and creates backup-agent\release\nilelink-backup-agent-<version>.zip
# Run on the dev machine from anywhere.
$ErrorActionPreference = "Stop"
$agent = Split-Path $PSScriptRoot -Parent
Push-Location $agent
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "build failed" }
  $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
  $stage = Join-Path $agent "release\stage"
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force "$stage\scripts", "$stage\deploy" | Out-Null
  robocopy dist "$stage\dist" /MIR /NFL /NDL /NJH /NJS /NP /XD "tests" | Out-Null
  Copy-Item package.json, package-lock.json $stage
  Copy-Item scripts\probe-agent.mjs "$stage\scripts"
  Copy-Item deploy\update-agent.ps1, deploy\DEPLOY.md "$stage\deploy"
  $zip = Join-Path $agent "release\nilelink-backup-agent-$version.zip"
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path "$stage\*" -DestinationPath $zip
  Remove-Item $stage -Recurse -Force
  Write-Host "Release created: $zip" -ForegroundColor Green
  Get-FileHash $zip -Algorithm SHA256 | Format-List Hash
} finally { Pop-Location }
