import type { Metadata } from "next"
import {routing} from "@/i18n"
import {PUBLIC_SITE_ORIGIN, PUBLIC_SITE_NAME, PUBLIC_SITE_DESCRIPTION, PUBLIC_SHARE_IMAGE} from "@/lib/public/site"

export const siteConfig = {
  name: PUBLIC_SITE_NAME,
  description:
    PUBLIC_SITE_DESCRIPTION,
  url: PUBLIC_SITE_ORIGIN,
  ogImage: PUBLIC_SHARE_IMAGE,
  locale: "en_US",
  localeAr: "ar_EG",
  localeFr: "fr_FR",
  localeDe: "de_DE",
  localeIt: "it_IT",
  localeZh: "zh_CN",
  localeBg: "bg_BG",
  keywords: [
    "freight forwarding",
    "logistics Egypt",
    "sea freight",
    "air freight",
    "NileLink",
    "shipping company Egypt",
    "international shipping",
    "cargo services",
  ],
}

export function constructMetadata({
  title,
  description,
  image,
  noIndex = false,
  locale = "en",
  path = "",
}: {
  title: string
  description?: string
  image?: string
  noIndex?: boolean
  locale?: string
  path?: string
}): Metadata {
  const pageTitle = title.endsWith(siteConfig.name) ? title : `${title} | ${siteConfig.name}`
  return {
    title: {absolute: pageTitle},
    description: description || siteConfig.description,
    keywords: siteConfig.keywords,
    authors: [{ name: siteConfig.name }],
    creator: siteConfig.name,
    publisher: siteConfig.name,
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "website",
      locale:
        locale === "ar"
          ? siteConfig.localeAr
          : locale === "fr"
            ? siteConfig.localeFr
            : locale === "de"
              ? siteConfig.localeDe
              : locale === "it"
                ? siteConfig.localeIt
                : locale === "zh"
                  ? siteConfig.localeZh
                  : locale === "bg"
                    ? siteConfig.localeBg
                    : siteConfig.locale,
      url: `${siteConfig.url}/${locale}${path}`,
      title: pageTitle,
      description: description || siteConfig.description,
      siteName: siteConfig.name,
      images: [
        {
          url: image || siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: description || siteConfig.description,
      images: [image || siteConfig.ogImage],
    },
    alternates: {
      canonical: `${siteConfig.url}/${locale}${path}`,
      languages: Object.fromEntries([...routing.locales.map(code => [code, `${siteConfig.url}/${code}${path}`]), ["x-default", `${siteConfig.url}/en${path}`]]),
    },
  }
}
