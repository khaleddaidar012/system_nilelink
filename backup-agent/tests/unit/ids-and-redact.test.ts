import { describe, it, expect } from "vitest"
import { generateBackupId, isValidBackupId, typeFromBackupId } from "../../src/lib/ids"
import { redact } from "../../src/lib/redact"

describe("ids", () => {
  it("generates valid backup IDs conforming to schema", () => {
    const idAuto = generateBackupId("automatic")
    expect(isValidBackupId(idAuto)).toBe(true)
    expect(typeFromBackupId(idAuto)).toBe("automatic")

    const idManual = generateBackupId("manual")
    expect(isValidBackupId(idManual)).toBe(true)
    expect(typeFromBackupId(idManual)).toBe("manual")

    const idSafety = generateBackupId("safety")
    expect(isValidBackupId(idSafety)).toBe(true)
    expect(typeFromBackupId(idSafety)).toBe("safety")

    const idImport = generateBackupId("import")
    expect(isValidBackupId(idImport)).toBe(true)
    expect(typeFromBackupId(idImport)).toBe("import")
  })

  it("strictly rejects malicious or invalid backup IDs", () => {
    expect(isValidBackupId("../../etc/passwd")).toBe(false)
    expect(isValidBackupId("..\\..\\windows\\system32")).toBe(false)
    expect(isValidBackupId("bk_123")).toBe(false)
    expect(isValidBackupId("")).toBe(false)
    expect(isValidBackupId(null)).toBe(false)
    expect(isValidBackupId(undefined)).toBe(false)
    expect(isValidBackupId("bk_20261005T180000Z_auto_evil;rm -rf /")).toBe(false)
  })
})

describe("redact", () => {
  it("redacts MongoDB URIs with credentials", () => {
    const secretUri = "mongodb+srv://admin:SuperSecretPass123@cluster0.mongodb.net/nilelink?retryWrites=true"
    const redacted = redact(`Connecting to ${secretUri} on startup`)
    expect(redacted).not.toContain("SuperSecretPass123")
    expect(redacted).toContain("mongodb://[REDACTED]")
  })

  it("redacts Bearer tokens", () => {
    const log = "Request header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5..."
    const redacted = redact(log)
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiIsInR5...")
    expect(redacted).toContain("Bearer [REDACTED]")
  })

  it("redacts password fields", () => {
    const log = '{"username":"khaled", "password":"MySecretPassword99"}'
    const redacted = redact(log)
    expect(redacted).not.toContain("MySecretPassword99")
    expect(redacted).toContain('[REDACTED]')
  })
})
