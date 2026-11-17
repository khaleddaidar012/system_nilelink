import http from "node:http"
import { Logger } from "../logger"
import { JobLock } from "../services/job-lock"

export function setupGracefulShutdown(
  server: http.Server,
  lock: JobLock,
  logger: Logger,
  onStop?: () => void
) {
  const shutdown = async (signal: string) => {
    logger.info(`received ${signal}, shutting down gracefully...`)
    onStop?.()

    // Stop accepting new connections
    server.close(() => {
      logger.info("HTTP server closed")
    })

    // If a job is currently running, wait up to 15 seconds for it to finish
    if (lock.isLocked()) {
      logger.warn("a backup job is currently running, waiting up to 15s...")
      const deadline = Date.now() + 15000
      while (lock.isLocked() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500))
      }
      if (lock.isLocked()) {
        logger.error("job did not complete in time, exiting forcefully")
      }
    }

    await logger.flush()
    process.exit(0)
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
}
