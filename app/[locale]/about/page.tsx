import {PublicAboutPage} from "@/components/public-brand/PublicPages"
import { getLocale, getTranslations } from "next-intl/server"
import { constructMetadata } from "@/lib/seo"
import { AboutHero } from "@/components/sections/about/AboutHero"
import { WhoWeAre } from "@/components/sections/about/WhoWeAre"
import { MissionVision } from "@/components/sections/about/MissionVision"
import { CoreValues } from "@/components/sections/about/CoreValues"
import { AboutCTA } from "@/components/sections/about/AboutCTA"

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "about" })

  return constructMetadata({
    title: t("hero.title"),
    description: t("hero.description"),
    locale,
    path: "/about",
  })
}

export default async function AboutPage() {
  const locale = await getLocale()
  if (locale === "ar" || locale === "en") return <PublicAboutPage locale={locale}/>
  return (
    <>
      <AboutHero />
      <WhoWeAre />
      <MissionVision />
      <CoreValues />
      <AboutCTA />
    </>
  )
}
