import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
const root = process.cwd(), base = path.join(root, '.private/d1-migration/first-launch/mailbox'), source = path.join(root, 'mail-agent')
await mkdir(base, { recursive: true, mode: 0o700 })
const secretsPath = path.join(base, 'worker-secrets.json')
let secrets
try { secrets = JSON.parse(await readFile(secretsPath, 'utf8')) }
catch (error) {
  if (error.code !== 'ENOENT') throw error
  secrets = { MAILBOX_AGENT_HMAC_KEY: randomBytes(32).toString('hex'), MAILBOX_ENCRYPTION_KEY: randomBytes(32).toString('hex') }
  await writeFile(secretsPath, JSON.stringify(secrets, null, 2), { flag: 'wx', mode: 0o600 })
}
const packagePath = path.join(base, 'NileLink-MailAgent')
await mkdir(packagePath, { recursive: true, mode: 0o700 })
for (const filename of ['package.json', 'package-lock.json', 'server.mjs', 'service.mjs', 'protocol.mjs', 'install-service.cjs', 'Install-MailAgent.ps1', 'README.md']) await copyFile(path.join(source, filename), path.join(packagePath, filename))
const config = JSON.parse(await readFile(path.join(source, 'agent.config.example.json'), 'utf8')); config.hmacKey = secrets.MAILBOX_AGENT_HMAC_KEY
await writeFile(path.join(packagePath, 'agent.config.json'), JSON.stringify(config, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ packagePath, secretsGeneratedOrReused: true, secretValuesDisplayed: false, endpointConfigured: false }))
