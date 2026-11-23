import {PUBLIC_SITE_ORIGIN} from "@/lib/public/site"
import {routing} from "@/i18n"
import type { MetadataRoute } from "next"

const locales = routing.locales
const staticPages = ["", "/about", "/services", "/request-quote", "/contact"]

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []

  for (const locale of locales) {
    for (const page of staticPages) {
      entries.push({
        url: `${PUBLIC_SITE_ORIGIN}/${locale}${page}`,
        changeFrequency: page === "" ? "weekly" : "monthly",
        priority: page === "" ? 1.0 : 0.8,
        alternates: {
          languages: Object.fromEntries(
            [...locales.map((l) => [
              l,
              `${PUBLIC_SITE_ORIGIN}/${l}${page}`,
            ]), ["x-default", `${PUBLIC_SITE_ORIGIN}/en${page}`]]
          ),
        },
      })
    }
  }

  return entries
}
