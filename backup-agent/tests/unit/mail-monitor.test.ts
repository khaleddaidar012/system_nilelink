import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { MailMonitorService } from "../../src/services/mail-monitor.service"

const fakeLogger: any = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

describe("MailMonitorService", () => {
  it("returns mock online status when isMock is true", async () => {
    const service = new MailMonitorService({ isMock: true }, fakeLogger)
    const status = await service.getStatus()

    expect(status.status).toBe("online")
    expect(status.services.smtp.status).toBe("running")
    expect(status.services.imap.status).toBe("running")
    expect(status.connectivity.smtp.reachable).toBe(true)
    expect(status.connectivity.imap.reachable).toBe(true)
    expect(status.queues.inbound).toBe(2)
    expect(status.queues.badMail).toBe(0)
    expect(status.lastCheck).toBeDefined()
    expect(status.lastSuccessfulCheck).toBeDefined()
  })

  it("caches status across subsequent calls unless forceRefresh is passed", async () => {
    const service = new MailMonitorService({ isMock: true, cacheTtlMs: 5000 }, fakeLogger)
    const first = await service.getStatus()
    const second = await service.getStatus()

    expect(first.lastCheck).toBe(second.lastCheck)

    const forced = await service.getStatus(true)
    // forced might have same or later timestamp, but getStatus(true) bypasses cache
    expect(forced).toBeDefined()
  })

  it("handles non-Windows and unreachable hosts gracefully without crashing", async () => {
    // Port 65530 on 127.0.0.1 should be closed/unreachable immediately
    const service = new MailMonitorService(
      {
        isMock: false,
        host: "127.0.0.1",
        smtpPort: 65530,
        imapPort: 65531,
      },
      fakeLogger
    )

    const status = await service.getStatus()
    expect(["offline", "unknown", "degraded"]).toContain(status.status)
    expect(status.connectivity.smtp.reachable).toBe(false)
    expect(status.connectivity.imap.reachable).toBe(false)
    expect(status.lastCheck).toBeDefined()
    expect(status.queues.inbound === null || typeof status.queues.inbound === "number").toBe(true)
  })

  it("reports null (not 0) queue counts when the queue directory cannot be found", async () => {
    const service = new MailMonitorService(
      { isMock: false, mailEnablePath: path.join(os.tmpdir(), "nl-nonexistent-mailenable"), smtpPort: 65530, imapPort: 65531 },
      fakeLogger
    )
    const status = await service.getStatus()
    if (process.platform !== "win32" || status.queues.accessible === false) {
      expect(status.queues.inbound).toBeNull()
      expect(status.queues.outbound).toBeNull()
      expect(status.queues.badMail).toBeNull()
      expect(status.queues.error).toBeDefined()
    }
  })

  it("counts real queue messages from discovered directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nl-mailenable-"))
    try {
      const smtp = path.join(root, "Queues", "SMTP")
      await fs.mkdir(path.join(smtp, "Inbound"), { recursive: true })
      await fs.mkdir(path.join(smtp, "Outbound"), { recursive: true })
      await fs.mkdir(path.join(smtp, "Badmail"), { recursive: true })
      // 2 messages in inbound (each = 2 files), 1 in outbound, 3 in badmail
      for (const f of ["a.mai", "a.mes", "b.mai", "b.mes"]) await fs.writeFile(path.join(smtp, "Inbound", f), "x")
      await fs.writeFile(path.join(smtp, "Outbound", "c.mai"), "x")
      for (const f of ["d.mai", "e.mai", "f.mai"]) await fs.writeFile(path.join(smtp, "Badmail", f), "x")

      const service = new MailMonitorService(
        { isMock: false, mailEnablePath: root, smtpPort: 65530, imapPort: 65531 },
        fakeLogger
      )
      const status = await service.getStatus()
      expect(status.queues).toMatchObject({ inbound: 2, outbound: 1, badMail: 3, accessible: true })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("discovers Bad Mail in root\\Bad Mail\\Messages outside Queues and ignores subdirectories/metadata", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nl-mailenable-real-"))
    try {
      // Standard MailEnable layout: Queues for SMTP, but Bad Mail is outside Queues at <root>\Bad Mail\Messages
      const smtp = path.join(root, "Queues", "SMTP")
      const badMailDir = path.join(root, "Bad Mail", "Messages")
      await fs.mkdir(path.join(smtp, "Inbound"), { recursive: true })
      await fs.mkdir(path.join(smtp, "Outgoing"), { recursive: true })
      await fs.mkdir(badMailDir, { recursive: true })

      // Create a subfolder inside Bad Mail\Messages - MUST NOT BE COUNTED AS A MESSAGE
      await fs.mkdir(path.join(badMailDir, "TempSubFolder"), { recursive: true })
      // Create desktop.ini and thumbs.db - MUST NOT BE COUNTED
      await fs.writeFile(path.join(badMailDir, "desktop.ini"), "[.ShellClassInfo]")
      await fs.writeFile(path.join(badMailDir, "thumbs.db"), "binary")

      // 4 actual bad mail messages (.mai and .mes pairs count as 1 base message each)
      await fs.writeFile(path.join(badMailDir, "msg001.mai"), "content")
      await fs.writeFile(path.join(badMailDir, "msg001.mes"), "headers")
      await fs.writeFile(path.join(badMailDir, "msg002.mai"), "content")
      await fs.writeFile(path.join(badMailDir, "msg003.mai"), "content")
      await fs.writeFile(path.join(badMailDir, "msg004.mai"), "content")

      // 1 message in inbound, 0 in outgoing
      await fs.writeFile(path.join(smtp, "Inbound", "in1.mai"), "inbound")

      const service = new MailMonitorService(
        { isMock: false, mailEnablePath: root, smtpPort: 65530, imapPort: 65531 },
        fakeLogger
      )
      const status = await service.getStatus()
      expect(status.queues.accessible).toBe(true)
      expect(status.queues.inbound).toBe(1)
      expect(status.queues.outbound).toBe(0)
      expect(status.queues.badMail).toBe(4) // 4 actual message bases, subfolder and desktop.ini ignored
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("distinguishes empty queues (count = 0) from inaccessible queues (count = null)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nl-mailenable-empty-"))
    try {
      const smtp = path.join(root, "Queues", "SMTP")
      const badMailDir = path.join(root, "Bad Mail", "Messages")
      await fs.mkdir(path.join(smtp, "Inbound"), { recursive: true })
      await fs.mkdir(path.join(smtp, "Outbound"), { recursive: true })
      await fs.mkdir(badMailDir, { recursive: true })

      // Folders exist and are completely empty
      const service = new MailMonitorService(
        { isMock: false, mailEnablePath: root, smtpPort: 65530, imapPort: 65531 },
        fakeLogger
      )
      const status = await service.getStatus()
      expect(status.queues.accessible).toBe(true)
      expect(status.queues.inbound).toBe(0) // 0 means empty, NOT null!
      expect(status.queues.outbound).toBe(0)
      expect(status.queues.badMail).toBe(0)
      expect(status.queues.error).toBeUndefined()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("supports explicit badMailPath override if configured", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nl-mailenable-custom-"))
    const customBadMail = await fs.mkdtemp(path.join(os.tmpdir(), "nl-custom-badmail-"))
    try {
      const smtp = path.join(root, "Queues", "SMTP")
      await fs.mkdir(path.join(smtp, "Inbound"), { recursive: true })
      await fs.mkdir(path.join(smtp, "Outbound"), { recursive: true })
      await fs.mkdir(path.join(customBadMail, "Messages"), { recursive: true })

      await fs.writeFile(path.join(customBadMail, "Messages", "undelivered.mai"), "data")

      const service = new MailMonitorService(
        { isMock: false, mailEnablePath: root, badMailPath: customBadMail, smtpPort: 65530, imapPort: 65531 },
        fakeLogger
      )
      const status = await service.getStatus()
      expect(status.queues.accessible).toBe(true)
      expect(status.queues.badMail).toBe(1)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
      await fs.rm(customBadMail, { recursive: true, force: true })
    }
  })

  it("resolves MailEnable root upwards when MAILENABLE_PATH points to Queues subdirectory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nl-mailenable-upward-"))
    try {
      const queues = path.join(root, "Queues")
      const smtp = path.join(queues, "SMTP")
      const badMailMessages = path.join(root, "Bad Mail", "Messages")
      await fs.mkdir(path.join(smtp, "Inbound"), { recursive: true })
      await fs.mkdir(path.join(smtp, "Outgoing"), { recursive: true })
      await fs.mkdir(badMailMessages, { recursive: true })

      // Point MAILENABLE_PATH to Queues directly (common configuration error on Windows)
      const service = new MailMonitorService(
        { isMock: false, mailEnablePath: queues, smtpPort: 65530, imapPort: 65531 },
        fakeLogger
      )
      const status = await service.getStatus()
      expect(status.queues.accessible).toBe(true)
      expect(status.queues.inbound).toBe(0)
      expect(status.queues.outbound).toBe(0)
      expect(status.queues.badMail).toBe(0)
      expect(status.queues.badMailPath).toBe(badMailMessages)
      expect(status.diagnostics.some((d) => d.includes("MailEnable Bad Mail path:"))).toBe(true)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("resolves MailEnable root upwards when MAILENABLE_PATH points to Queues\\SMTP subdirectory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nl-mailenable-smtp-sub-"))
    try {
      const smtp = path.join(root, "Queues", "SMTP")
      const badMailMessages = path.join(root, "Bad Mail", "Messages")
      await fs.mkdir(path.join(smtp, "Inbound"), { recursive: true })
      await fs.mkdir(path.join(smtp, "Outgoing"), { recursive: true })
      await fs.mkdir(badMailMessages, { recursive: true })

      const service = new MailMonitorService(
        { isMock: false, mailEnablePath: smtp, smtpPort: 65530, imapPort: 65531 },
        fakeLogger
      )
      const status = await service.getStatus()
      expect(status.queues.accessible).toBe(true)
      expect(status.queues.inbound).toBe(0)
      expect(status.queues.outbound).toBe(0)
      expect(status.queues.badMail).toBe(0)
      expect(status.queues.badMailPath).toBe(badMailMessages)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("resolves MailEnable root upwards when MAILENABLE_PATH points to Bad Mail\\Messages directly", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "nl-mailenable-badmail-sub-"))
    try {
      const smtp = path.join(root, "Queues", "SMTP")
      const badMailMessages = path.join(root, "Bad Mail", "Messages")
      await fs.mkdir(path.join(smtp, "Inbound"), { recursive: true })
      await fs.mkdir(path.join(smtp, "Outgoing"), { recursive: true })
      await fs.mkdir(badMailMessages, { recursive: true })

      const service = new MailMonitorService(
        { isMock: false, mailEnablePath: badMailMessages, smtpPort: 65530, imapPort: 65531 },
        fakeLogger
      )
      const status = await service.getStatus()
      expect(status.queues.accessible).toBe(true)
      expect(status.queues.inbound).toBe(0)
      expect(status.queues.outbound).toBe(0)
      expect(status.queues.badMail).toBe(0)
      expect(status.queues.badMailPath).toBe(badMailMessages)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
