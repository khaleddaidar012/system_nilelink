import path from "node:path"
import { Service } from "node-windows"

const svc = new Service({
  name: "NileLinkBackupAgent",
  description: "Nile Link Local MongoDB Backup & Restore Windows Service Agent",
  script: path.join(__dirname, "..", "dist", "src", "index.js"),
})

svc.on("uninstall", () => {
  console.log("NileLinkBackupAgent uninstalled successfully.")
})

svc.on("alreadyuninstalled", () => {
  console.log("NileLinkBackupAgent is already uninstalled.")
})

svc.uninstall()
