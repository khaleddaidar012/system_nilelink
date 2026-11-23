"use client"

import type {ReactNode} from "react"
import Image from "next/image"
import {useTranslations} from "next-intl"
import {Link} from "@/navigation"
import {CONTACT, CONTACT_CHANNELS} from "@/constants/contact"
import {QuoteForm} from "@/components/sections/quote/QuoteForm"
import {ContactForm} from "@/components/sections/contact/ContactForm"
import {FAQSchema} from "@/components/shared/JsonLd"
import {publicServices} from "./services-data"
import {BrandActions, BrandCard, BrandContainer, BrandGrid, BrandHeading, BrandScope, BrandSection, BrandStack, BrandText, publicBrandStyles} from "./index"
import styles from "./public-pages.module.css"

type Locale = "ar" | "en"
const officeCoordinates = new URL(CONTACT.MAPS).searchParams.get("q") || ""
function PageHero({title, description}: {title: string; description: string}) {
  return <BrandSection tone="steel"><BrandContainer><BrandStack><BrandHeading as="h1" size="display" id="public-page-title">{title}</BrandHeading><BrandText className={styles.intro}>{description}</BrandText></BrandStack></BrandContainer></BrandSection>
}
function Content({title, children, id}: {title: string; children: ReactNode; id?: string}) {
  return <BrandSection tone="quay" id={id}><BrandContainer><BrandStack><BrandHeading>{title}</BrandHeading>{children}</BrandStack></BrandContainer></BrandSection>
}
function Action() {
  const t = useTranslations("cta"), q = useTranslations("publicQuickQuote")
  return <BrandSection tone="steel"><BrandContainer><BrandStack><BrandHeading>{t("title")}</BrandHeading><BrandText>{q("followUp")}</BrandText><BrandActions><Link href="/request-quote" className={`${publicBrandStyles.button} ${publicBrandStyles.primary}`}>{t("button")}</Link></BrandActions></BrandStack></BrandContainer></BrandSection>
}
function Faq() {
  const t = useTranslations("faq"), items = t.raw("items") as {question: string; answer: string}[]
  return <Content title={t("title")} id="faq"><FAQSchema items={items}/><div>{items.map(item => <details key={item.question} className={styles.detail}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></Content>
}
function OfficeInfo() {
  const t = useTranslations("contact")
  return <BrandStack>
    {["hq", "alexandria"].map(key => <BrandCard key={key}><BrandHeading as="h3" size="cardHeading">{t(key)}</BrandHeading><p>{t(`${key}AddressStreet`)}</p><p>{t(`${key}AddressCity`)}</p></BrandCard>)}
    <BrandCard><BrandHeading as="h3" size="cardHeading">{t("support247")}</BrandHeading><p>{t("support247Desc")}</p><p><a href={`tel:${CONTACT.PHONE}`}>{t("callUs")} <bdi>{CONTACT.PHONE}</bdi></a></p><a href={`mailto:${CONTACT.EMAIL}`}><bdi>{CONTACT.EMAIL}</bdi></a></BrandCard>
    <BrandCard><BrandHeading as="h3" size="cardHeading">{t("quickResponse.title")}</BrandHeading><p>{t("quickResponse.description")}</p></BrandCard>
  </BrandStack>
}
export function PublicAboutPage({locale}: {locale: Locale}) {
  const t = useTranslations("about"), why = useTranslations("whyChooseUs"), global = useTranslations("globalCoverage"), extra = useTranslations("publicPages")
  return <BrandScope locale={locale} className={styles.page}>
    <PageHero title={t("hero.title")} description={t("hero.description")}/>
    <Content title={t("whoWeAre.title")}><div className={styles.twoColumns}><BrandStack><BrandText>{t("whoWeAre.description1")}</BrandText><BrandText>{t("whoWeAre.description2")}</BrandText></BrandStack><div className={styles.photo}><Image src="/brand/nilelink/images/warehouse-desktop-1200.webp" alt={extra("warehouseAlt")} fill sizes="(max-width: 800px) 100vw, 50vw" className={styles.image}/></div></div></Content>
    <Content title={extra("purpose")}><BrandGrid>{["mission", "vision"].map(key => <BrandCard key={key}><BrandHeading as="h3" size="cardHeading">{t(`${key}.title`)}</BrandHeading><p>{t(`${key}.description`)}</p></BrandCard>)}</BrandGrid></Content>
    <Content title={t("coreValues.title")}><BrandGrid>{["integrity", "innovation", "customerFocus", "reliability", "sustainability", "safety"].map(key => <BrandCard key={key}><BrandHeading as="h3" size="cardHeading">{t(`coreValues.${key}.title`)}</BrandHeading><p>{t(`coreValues.${key}.description`)}</p></BrandCard>)}</BrandGrid></Content>
    <Content title={why("title")} id="why-nilelink"><BrandGrid>{["globalReach", "expertTeam", "customerCentric", "compliance"].map(key => <BrandCard key={key}><BrandHeading as="h3" size="cardHeading">{why(`${key}.title`)}</BrandHeading><p>{why(`${key}.description`)}</p></BrandCard>)}</BrandGrid></Content>
    <Content title={global("title")} id="coverage"><BrandText>{global("description")}</BrandText><ul className={styles.regions}>{["northAmerica", "europe", "asiaPacific", "middleEast", "africa", "southAmerica"].map(key => <li key={key}>{extra(`regions.${key}`)}</li>)}</ul></Content><Action/>
  </BrandScope>
}
export function PublicServicesPage({locale}: {locale: Locale}) {
  const t = useTranslations("services"), short = useTranslations("publicServices"), nav = useTranslations("nav"), extra = useTranslations("publicPages")
  return <BrandScope locale={locale} className={styles.page}><PageHero title={t("title")} description={t("description")}/>
    <Content title={short("title")}><div className={styles.serviceList}>{publicServices.map(service => <BrandCard id={service.id} key={service.id} className={styles.service}>
      {service.legacyKey && service.legacyKey !== service.id && <span id={service.legacyKey} className={styles.anchorAlias} aria-hidden="true"/>}
      <Image src={`/brand/nilelink/icons/cards/${service.icon}.svg`} width={48} height={48} alt=""/>
      <BrandHeading as="h3" size="cardHeading">{short(`${service.key}.title`)}</BrandHeading><BrandText>{short(`${service.key}.description`)}</BrandText>
      {service.legacyKey && <><p>{t(`${service.legacyKey}.description`)}</p><ul>{["item1", "item2", "item3", "item4"].map(key => <li key={key}>{t(`${service.legacyKey}.features.${key}`)}</li>)}</ul></>}
      <Link href={service.legacyKey ? "/request-quote" : "/contact"} className={styles.textLink}>{service.legacyKey ? nav("requestQuote") : nav("contact")}</Link>
    </BrandCard>)}<BrandCard id="specialized" className={styles.service}><BrandHeading as="h3" size="cardHeading">{t("specialized.title")}</BrandHeading><p>{t("specialized.description")}</p><ul>{["item1", "item2", "item3", "item4"].map(key => <li key={key}>{t(`specialized.features.${key}`)}</li>)}</ul><Link href="/contact">{nav("contact")}</Link></BrandCard></div></Content>
    <Content title={t("comparison.title")} id="shipping-comparison"><p>{extra("estimates")}</p><BrandGrid>{["seaFreight", "airFreight", "roadFreight"].map(key => <BrandCard key={key}><BrandHeading as="h3" size="cardHeading">{t(`comparison.${key}.method`)}</BrandHeading><dl className={styles.comparison}>{["transit", "cost", "capacity", "bestFor"].map(field => <div key={field}><dt>{t(`comparison.labels.${field}`)}</dt><dd>{t(`comparison.${key}.${field}`)}</dd></div>)}</dl></BrandCard>)}</BrandGrid></Content><Action/>
  </BrandScope>
}
export function PublicContactPage({locale}: {locale: Locale}) {
  const t = useTranslations("contact"), extra = useTranslations("publicPages")
  return <BrandScope locale={locale} className={styles.page}><PageHero title={t("hero.title")} description={t("hero.description")}/>
    <Content title={extra("contactChannels")}><BrandGrid>{CONTACT_CHANNELS.filter(channel => !channel.hidden).map(channel => <BrandCard key={channel.id}><BrandHeading as="h3" size="cardHeading">{t(channel.title.replace("contact.", ""))}</BrandHeading><p>{t(channel.description.replace("contact.", ""))}</p><a href={channel.href} target={channel.external ? "_blank" : undefined} rel={channel.external ? "noopener noreferrer" : undefined}>{channel.valueKey ? t(channel.valueKey.replace("contact.", "")) : channel.value}</a>{channel.secondaryHref && <p><a href={channel.secondaryHref}><bdi>{channel.secondaryValue}</bdi></a></p>}</BrandCard>)}</BrandGrid></Content>
    <Content title={t("form.title")} id="contact-form"><div className={styles.formLayout}><BrandCard><ContactForm branded/></BrandCard><OfficeInfo/></div></Content>
    <Content title={t("hq")} id="office-map"><div className={styles.map}><iframe src={`https://maps.google.com/maps?q=${encodeURIComponent(officeCoordinates)}&z=17&hl=${locale}&output=embed`} title={extra("mapTitle")} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade"/></div><a href={CONTACT.MAPS} target="_blank" rel="noopener noreferrer">{t("channels.maps.title")}</a></Content><Faq/>
  </BrandScope>
}
export function PublicQuotePage({locale}: {locale: Locale}) {
  const t = useTranslations("quote")
  return <BrandScope locale={locale} className={styles.page}><PageHero title={t("hero.title")} description={t("hero.description")}/><Content title={t("form.title")} id="full-quote"><div className={styles.formLayout}><BrandCard><QuoteForm branded/></BrandCard><OfficeInfo/></div></Content></BrandScope>
}
