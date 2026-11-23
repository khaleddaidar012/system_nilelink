"use client"

import Image from "next/image"
import {useTranslations} from "next-intl"
import {Link} from "@/navigation"
import {BrandContainer, BrandHeading, BrandScope, BrandSection} from "./index"
import styles from "./public-services.module.css"

const services = [
  {key: "sea", icon: "sea-freight", href: "/services#sea-freight"},
  {key: "air", icon: "air-freight", href: "/services#air-freight"},
  {key: "land", icon: "land-transport", href: "/services#road-freight"},
  {key: "customs", icon: "customs-clearance", href: "/services#customs-clearance"},
  {key: "warehouse", icon: "warehousing", href: "/services#warehousing"},
  {key: "insurance", icon: "cargo-insurance", href: "/contact"},
] as const

export function PublicServices({locale}: {locale: "ar" | "en"}) {
  const t = useTranslations("publicServices")
  return <BrandScope locale={locale}>
    <BrandSection id="public-services" tone="quay" aria-labelledby="public-services-title">
      <BrandContainer>
        <BrandHeading id="public-services-title" className={styles.title}>{t("title")}</BrandHeading>
        <ul className={styles.grid}>
          {services.map(service => <li key={service.key} className={styles.item}>
            <Link href={service.href} className={styles.card}>
              <Image src={`/brand/nilelink/icons/cards/${service.icon}.svg`} width={48} height={48} alt="" aria-hidden="true"/>
              <h3 className={styles.name}>{t(`${service.key}.title`)}</h3>
              <p className={styles.description}>{t(`${service.key}.description`)}</p>
            </Link>
          </li>)}
        </ul>
      </BrandContainer>
    </BrandSection>
  </BrandScope>
}
