import path from "node:path"
import { Service } from "node-windows"

const svc = new Service({
  name: "NileLinkBackupAgent",
  description: "Nile Link Local MongoDB Backup & Restore Windows Service Agent",
  script: path.join(__dirname, "..", "dist", "src", "index.js"),
  nodeOptions: ["--max-old-space-size=2048"],
  wait: 2,
  grow: 0.5,
  maxRetries: 5,
})

svc.on("install", () => {
  console.log("NileLinkBackupAgent installed successfully as a Windows Service.")
  svc.start()
})

svc.on("alreadyinstalled", () => {
  console.log("NileLinkBackupAgent is already installed.")
})

svc.install()
