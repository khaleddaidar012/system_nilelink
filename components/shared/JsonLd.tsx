"use client"

import { CONTACT } from "@/constants/contact"
import {PUBLIC_SITE_ORIGIN, PUBLIC_SITE_NAME, PUBLIC_SITE_DESCRIPTION} from "@/lib/public/site"
import {isBrandedPublicPath} from "@/lib/public/routes"
import {usePathname} from "@/navigation"

function JsonLd({id, schema}: {id: string; schema: Record<string, unknown> | null}) {
  if (!schema) return null
  return <script id={id} type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(schema).replace(/</g, "\\u003c")}}/>
}
const organizationSchema = {
  "@context": "https://schema.org", "@type": "Organization",
  "@id": `${PUBLIC_SITE_ORIGIN}/#organization`, name: PUBLIC_SITE_NAME, alternateName: CONTACT.COMPANY_NAME,
  url: PUBLIC_SITE_ORIGIN, logo: `${PUBLIC_SITE_ORIGIN}/brand/nilelink/logos/mark-primary.png`,
  description: PUBLIC_SITE_DESCRIPTION, email: CONTACT.EMAIL,
  contactPoint: {"@type": "ContactPoint", telephone: CONTACT.PHONE, contactType: "customer service"},
  sameAs: [CONTACT.FACEBOOK, CONTACT.LINKEDIN],
}
export function OrganizationSchema() {
  const pathname = usePathname()
  return <JsonLd id="organization-schema" schema={isBrandedPublicPath(pathname) ? organizationSchema : null}/>
}
const localBusinessSchema = {
  "@context": "https://schema.org", "@type": "LocalBusiness",
  "@id": `${PUBLIC_SITE_ORIGIN}/#damietta-office`, name: `${PUBLIC_SITE_NAME} — Damietta`,
  url: PUBLIC_SITE_ORIGIN, telephone: CONTACT.PHONE, email: CONTACT.EMAIL,
  parentOrganization: {"@id": `${PUBLIC_SITE_ORIGIN}/#organization`}, hasMap: CONTACT.MAPS,
  address: {"@type": "PostalAddress", streetAddress: "Entrance to Al-Ananiyah Road, opposite the Ice Factory", addressLocality: "Damietta", addressCountry: "EG"},
}
export function LocalBusinessSchema() {
  const pathname = usePathname()
  return <JsonLd id="local-business-schema" schema={isBrandedPublicPath(pathname) ? localBusinessSchema : null}/>
}

export function FAQSchema({ items }: { items: { question: string; answer: string }[] }) {
  const schema = items.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      }
    : null

  return <JsonLd id="faq-schema" schema={schema}/>
}

export function BreadcrumbSchema({ items }: { items: { name: string; url: string }[] }) {
  const schema = items.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: item.url,
        })),
      }
    : null

  return <JsonLd id="breadcrumb-schema" schema={schema}/>
}
