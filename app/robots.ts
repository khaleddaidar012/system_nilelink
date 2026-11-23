import {PUBLIC_SITE_ORIGIN} from "@/lib/public/site"
import {routing} from "@/i18n"
import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...routing.locales.flatMap(locale => ["portal", "admin", "dashboard", "invoice", "analytics-login", "login", "register", "forgot-password", "reset-password", "verify-email"].map(path => `/${locale}/${path}`))],
    },
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
  }
}
