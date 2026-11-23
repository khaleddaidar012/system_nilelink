"use client"

import Image from "next/image"
import {useTranslations} from "next-intl"
import {Link} from "@/navigation"
import {BrandContainer, BrandHeading, BrandScope, BrandSection} from "./index"
import styles from "./public-services.module.css"
import {publicServices} from "./services-data"

export function PublicServices({locale}: {locale: "ar" | "en"}) {
  const t = useTranslations("publicServices")
  return <BrandScope locale={locale}>
    <BrandSection id="public-services" tone="quay" aria-labelledby="public-services-title">
      <BrandContainer>
        <BrandHeading id="public-services-title" className={styles.title}>{t("title")}</BrandHeading>
        <ul className={styles.grid}>
          {publicServices.map(service => <li key={service.key} className={styles.item}>
            <Link href={service.legacyKey ? `/services#${service.id}` : "/contact"} className={styles.card}>
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
