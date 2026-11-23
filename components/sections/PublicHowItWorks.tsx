"use client"

import Image from "next/image"
import {useTranslations} from "next-intl"
import {BrandContainer, BrandHeading, BrandScope, BrandSection} from "@/components/public-brand"
import styles from "./public-how-it-works.module.css"

export function PublicHowItWorks({locale}: {locale: "ar" | "en"}) {
  const t = useTranslations("publicHowItWorks")
  return <BrandScope locale={locale}>
    <BrandSection id="how-we-work" tone="quay" aria-labelledby="how-we-work-title" className={styles.section}>
      <BrandContainer className={styles.layout}>
        <div className={styles.photograph}>
          <picture><source srcSet="/brand/nilelink/images/warehouse-small-640.webp 640w, /brand/nilelink/images/warehouse-desktop-1200.webp 1200w" sizes="(max-width: 800px) calc(100vw - 40px), (min-width: 1408px) 624px, calc(50vw - 48px)"/><Image src="/brand/nilelink/images/warehouse-desktop-1200.webp" alt={t("imageAlt")} fill sizes="(max-width: 800px) calc(100vw - 40px), 50vw" className={styles.image}/></picture>
        </div>
        <div className={styles.content}>
          <BrandHeading id="how-we-work-title" className={styles.title}>{t("title")}</BrandHeading>
          <ol className={styles.steps}>
            {["details", "quote", "tracking"].map((key, index) => <li key={key} className={styles.step}>
              <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div><h3 className={styles.name}>{t(`${key}.title`)}</h3><p className={styles.description}>{t(`${key}.description`)}</p></div>
            </li>)}
          </ol>
        </div>
      </BrandContainer>
    </BrandSection>
  </BrandScope>
}
