"use client"

import Image from "next/image"
import {useTranslations} from "next-intl"
import {CONTACT} from "@/constants/contact"
import {Link} from "@/navigation"
import {BrandContainer, BrandScope} from "./index"
import styles from "./public-footer.module.css"

const pages = [
  {href: "/", label: "nav.home"}, {href: "/about", label: "nav.about"},
  {href: "/services", label: "nav.services"}, {href: "/request-quote", label: "nav.requestQuote"},
  {href: "/contact", label: "nav.contact"}, {href: "/login", label: "nav.portalLogin"},
]
const services = [
  {href: "/services#sea-freight", label: "nav.seaFreight"}, {href: "/services#air-freight", label: "nav.airFreight"},
  {href: "/services#road-freight", label: "nav.roadFreight"}, {href: "/services#customs-clearance", label: "nav.customsClearance"},
  {href: "/services#warehousing", label: "nav.warehousing"}, {href: "/services#specialized", label: "nav.specialized"},
]

export function PublicFooter({locale, topTarget="public-home-title"}: {locale: "ar" | "en"; topTarget?: string}) {
  const t = useTranslations(), f = useTranslations("publicFooter")
  return <BrandScope locale={locale}>
    <footer id="public-footer" className={styles.footer}>
      <BrandContainer>
        <div className={styles.summary}>
          <p className={styles.tagline}>{f("tagline")}</p>
        </div>
        <div className={styles.links}>
          <nav aria-label={t("footer.quickLinks")}><h2 className={styles.heading}>{t("footer.quickLinks")}</h2><ul>{pages.map(page => <li key={page.href}><Link href={page.href}>{t(page.label)}</Link></li>)}</ul></nav>
          <nav aria-label={t("footer.services")}><h2 className={styles.heading}>{t("footer.services")}</h2><ul>{services.map(service => <li key={service.href}><Link href={service.href}>{t(service.label)}</Link></li>)}</ul></nav>
          <nav className={styles.contact} aria-label={f("contact")}><h2 className={styles.heading}>{f("contact")}</h2><ul>
            <li><a href={`tel:${CONTACT.PHONE}`}><bdi dir="ltr">{CONTACT.PHONE}</bdi></a></li>
            <li><a href={`mailto:${CONTACT.EMAIL}`}><bdi dir="ltr">{CONTACT.EMAIL}</bdi></a></li>
            <li><a href={CONTACT.MAPS} target="_blank" rel="noopener noreferrer">{f("location")}</a></li>
          </ul><div className={styles.socials}>
            <a href={CONTACT.WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a href={CONTACT.FACEBOOK} target="_blank" rel="noopener noreferrer">Facebook</a>
            <a href={CONTACT.LINKEDIN} target="_blank" rel="noopener noreferrer">LinkedIn</a>
          </div></nav>
        </div>
        <div className={styles.bottom}><p>© 2026 NileLink. {t("footer.copyright")}</p><Link href="/contact">{f("policyInquiry")}</Link><a href={`#${topTarget}`}>{f("backToTop")}</a></div>
      </BrandContainer>
      <div className={styles.pattern} aria-hidden="true"><Image src="/brand/nilelink/logos/mark-primary.svg" width={96} height={96} alt=""/></div>
    </footer>
  </BrandScope>
}
