import { defineCloudflareConfig } from "@opennextjs/cloudflare"

const config = {
  ...defineCloudflareConfig(),
  buildCommand: "node node_modules/next/dist/bin/next build --webpack",
}

export default config
