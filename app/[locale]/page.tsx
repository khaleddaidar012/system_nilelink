import {constructMetadata} from "@/lib/seo"
import { HeroSection } from "@/components/sections/HeroSection"
import { AboutPreview } from "@/components/sections/AboutPreview"
import { ServicesPreview } from "@/components/sections/ServicesPreview"
import { WhyChooseUs } from "@/components/sections/WhyChooseUs"
import { GlobalCoverage } from "@/components/sections/GlobalCoverage"
import { FAQ } from "@/components/sections/FAQ"
import { CTASection } from "@/components/sections/CTASection"
import {getLocale, getTranslations} from "next-intl/server"
import {PublicHowItWorks} from "@/components/sections/PublicHowItWorks"
import {PublicQuickQuote} from "@/components/sections/PublicQuickQuote"

export async function generateMetadata({params}: {params: Promise<{locale: string}>}) {
  const {locale} = await params
  const t = await getTranslations({locale, namespace: "metadata"})
  return constructMetadata({title: t("title"), description: t("description"), locale, path: ""})
}

export default async function HomePage() {
  const locale = await getLocale()
  const branded = locale === "ar" || locale === "en"
  return (
    <>
      <HeroSection />
      {!branded && <AboutPreview />}
      <ServicesPreview />
      {branded && <PublicHowItWorks locale={locale}/>}
      {branded && <PublicQuickQuote locale={locale}/>}
      {!branded && <><WhyChooseUs /><GlobalCoverage /><FAQ /><CTASection /></>}
    </>
  )
}
