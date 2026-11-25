import { writeFile, unlink } from "node:fs/promises"
import { spawn } from "node:child_process"
import crypto from "node:crypto"
import path from "node:path"
import os from "node:os"
import { hashPassword } from "../../lib/auth/password.ts"
import { OPERATIONS_PRESET, ACCOUNTS_PRESET } from "../../lib/auth/staff-categories.ts"

const root = process.cwd()
const password = process.env.TEAM_INITIAL_PASSWORD || ""
if (password.length < 8) {
  console.error("Set TEAM_INITIAL_PASSWORD env var (min 8 chars) before running.")
  process.exit(1)
}

const accounts = [
  {
    firstName: "Khaled",
    lastName: "Admin",
    email: "khaled@nilelinklogistics.com",
    username: "khaled",
    jobTitle: "Super Admin / مدير النظام",
    role: "super_admin",
    staffPermissions: {
      canSendAlerts: true,
      canReviewDocuments: true,
      canManageCustomers: true,
      canViewShipmentData: true,
      canMarkReadyForAccounts: true,
      canAccessAccounts: true,
      canManageBackups: true,
      canUseTieredPricing: true,
      issueTaxInvoice: true,
      createInvoice: true,
      editInvoice: true,
      viewCustomerStatements: true,
      exportCustomerStatements: true,
      sendFinancialDocuments: true,
    },
  },
  { firstName: "وعد", lastName: "NileLink", email: "waad@nilelinklogistics.com", username: "waad", jobTitle: "Operation", role: "staff", staffPermissions: { ...OPERATIONS_PRESET } },
  { firstName: "إيمان", lastName: "NileLink", email: "eman@nilelinklogistics.com", username: "eman", jobTitle: "Operation", role: "staff", staffPermissions: { ...OPERATIONS_PRESET } },
  { firstName: "غفران", lastName: "NileLink", email: "ghofran@nilelinklogistics.com", username: "ghofran", jobTitle: "Operation", role: "staff", staffPermissions: { ...OPERATIONS_PRESET } },
  { firstName: "سارة", lastName: "NileLink", email: "sara@nilelinklogistics.com", username: "sara", jobTitle: "Operation", role: "staff", staffPermissions: { ...OPERATIONS_PRESET } },
  { firstName: "لوجي", lastName: "NileLink", email: "logy@nilelinklogistics.com", username: "logy", jobTitle: "Accounts", role: "staff", staffPermissions: { ...ACCOUNTS_PRESET } },
]

const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js")
const configPath = path.join(root, ".private/d1-migration/first-launch/application/wrangler.json")
const envPath = path.join(root, ".private/d1-migration/first-launch/application/empty.env")

function runWrangler(args) {
  return new Promise((resolve, reject) => {
    let out = "", err = ""
    const child = spawn(process.execPath, ["--use-system-ca", wrangler, ...args, "--config", configPath, "--env-file", envPath], { cwd: root, windowsHide: true })
    child.stdout.on("data", d => { out += d })
    child.stderr.on("data", d => { err += d })
    child.on("error", reject)
    child.on("exit", code => code === 0 ? resolve(out) : reject(new Error(err || out || `wrangler exit ${code}`)))
  })
}

const existingRaw = await runWrangler(["d1", "execute", "nilelink-production", "--remote", "--json", "--command", "SELECT id, data, revision FROM users WHERE email IN ('khaled@nilelinklogistics.com','waad@nilelinklogistics.com','eman@nilelinklogistics.com','ghofran@nilelinklogistics.com','sara@nilelinklogistics.com','logy@nilelinklogistics.com')"])
const parsed = JSON.parse(existingRaw)
const existingRows = parsed?.[0]?.results || []
const byEmail = new Map(existingRows.map(r => [JSON.parse(r.data).email.toLowerCase(), r]))

const now = new Date().toISOString()
const sqlStatements = []
const sqlLiteral = str => `'${String(str).replaceAll("'", "''")}'`

for (const acc of accounts) {
  const passwordHash = await hashPassword(password)
  const existing = byEmail.get(acc.email)
  if (existing) {
    const prev = JSON.parse(existing.data)
    const next = {
      ...prev,
      firstName: acc.firstName,
      lastName: acc.lastName,
      username: acc.username,
      jobTitle: acc.jobTitle,
      role: acc.role,
      status: "active",
      emailVerified: true,
      whatsappVerified: true,
      passwordHash,
      staffPermissions: acc.staffPermissions,
      updatedAt: now,
    }
    sqlStatements.push(`UPDATE users SET data = ${sqlLiteral(JSON.stringify(next))}, revision = revision + 1 WHERE id = ${sqlLiteral(existing.id)};`)
  } else {
    const id = crypto.randomBytes(12).toString("hex")
    const doc = {
      _id: id,
      email: acc.email,
      username: acc.username,
      firstName: acc.firstName,
      lastName: acc.lastName,
      jobTitle: acc.jobTitle,
      phone: "",
      passwordHash,
      role: acc.role,
      status: "active",
      customerId: null,
      avatarUrl: null,
      hasCompletedOnboarding: true,
      emailVerified: true,
      whatsappVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      emailVerificationOtp: null,
      emailVerificationOtpExpires: null,
      whatsappVerificationCode: null,
      whatsappVerificationExpires: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      passwordResetOtp: null,
      passwordResetOtpExpires: null,
      passwordResetChannel: null,
      lastLoginAt: null,
      staffPermissions: acc.staffPermissions,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    }
    sqlStatements.push(`INSERT INTO users (id, data) VALUES (${sqlLiteral(id)}, ${sqlLiteral(JSON.stringify(doc))});`)
  }
}

const sqlFile = path.join(os.tmpdir(), `nilelink-provision-${Date.now()}.sql`)
await writeFile(sqlFile, sqlStatements.join("\n"), { mode: 0o600 })
try {
  await runWrangler(["d1", "execute", "nilelink-production", "--remote", "--file", sqlFile])
} finally {
  await unlink(sqlFile).catch(() => {})
}

// Verify login against live production origin if --verify is passed
const results = []
if (process.argv.includes("--verify")) {
  const origin = "https://nilelinklogistics.com"
  for (const acc of accounts) {
    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ identifier: acc.email, password, rememberMe: false }),
      signal: AbortSignal.timeout(30000),
    })
    const body = await login.json().catch(() => ({}))
    results.push({ email: acc.email, role: acc.role, jobTitle: acc.jobTitle, loginStatus: login.status, ok: login.status === 200 && body.user?.email === acc.email })
  }
}
console.log(JSON.stringify({ provisioned: accounts.length, verified: results }, null, 2))
