import {getLocale} from "next-intl/server"
import {PUBLIC_SITE_ORIGIN, PUBLIC_SITE_DESCRIPTION, PUBLIC_SHARE_IMAGE} from "@/lib/public/site"
import type { Metadata } from "next"
import { Inter, Cairo } from "next/font/google"
import "./globals.css"
import { AnalyticsTracker } from "@/lib/analytics-client"
import Script from "next/script"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const cairo = Cairo({
  subsets: ["arabic"],
  variable: "--font-cairo",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  title: {
    default: "NileLink | Global Logistics Solutions",
    template: "%s | NileLink",
  },
  description:
    PUBLIC_SITE_DESCRIPTION,
  keywords: [
    "freight forwarding",
    "logistics Egypt",
    "sea freight",
    "air freight",
    "NileLink",
    "shipping company",
    "international shipping",
  ],
  authors: [{ name: "NileLink" }],
  creator: "NileLink",
  publisher: "NileLink",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "NileLink",
    title: "NileLink | Global Logistics Solutions",
    description:
      PUBLIC_SITE_DESCRIPTION,
    images: [
      {
        url: PUBLIC_SHARE_IMAGE,
        width: 1200,
        height: 630,
        alt: "NileLink - Global Logistics Solutions",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NileLink | Global Logistics Solutions",
    description:
      PUBLIC_SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${cairo.variable}`}
      data-scroll-behavior="smooth"
    >
      <head suppressHydrationWarning>
        <Script
          id="fdm-blocker"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              // Forcefully remove Free Download Manager injected div before React hydration
              const observer = new MutationObserver((mutations) => {
                const dzNode = document.getElementById('dz-acjicnehenlkmfnfpbjbpfnjegbelbpj-body');
                if (dzNode) dzNode.remove();
              });
              observer.observe(document.documentElement, { childList: true, subtree: true });
              window.addEventListener("DOMContentLoaded", () => {
                const dzNode = document.getElementById('dz-acjicnehenlkmfnfpbjbpfnjegbelbpj-body');
                if (dzNode) dzNode.remove();
              });
            `,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen font-sans antialiased"
      >
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  )
}
