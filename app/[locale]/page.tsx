import { HeroSection } from "@/components/sections/HeroSection"
import { AboutPreview } from "@/components/sections/AboutPreview"
import { ServicesPreview } from "@/components/sections/ServicesPreview"
import { WhyChooseUs } from "@/components/sections/WhyChooseUs"
import { GlobalCoverage } from "@/components/sections/GlobalCoverage"
import { FAQ } from "@/components/sections/FAQ"
import { CTASection } from "@/components/sections/CTASection"
import {getLocale} from "next-intl/server"

export default async function HomePage() {
  const locale = await getLocale()
  const branded = locale === "ar" || locale === "en"
  return (
    <>
      <HeroSection />
      {!branded && <AboutPreview />}
      <ServicesPreview />
      {branded && <AboutPreview />}
      <WhyChooseUs />
      <GlobalCoverage />
      <FAQ />
      <CTASection />
    </>
  )
}
