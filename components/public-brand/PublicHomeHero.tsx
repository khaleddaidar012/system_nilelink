"use client"
import {useEffect,useState} from "react"
import Image from "next/image"
import {useTranslations} from "next-intl"
import {Link,useRouter,usePathname} from "@/navigation"
import {routing} from "@/i18n"
import {CONTACT} from "@/constants/contact"
import {BrandContainer,BrandScope,BrandSection,publicBrandStyles} from "./index"
import styles from "./public-hero.module.css"

type AccountRole="customer"|"customer_admin"|"staff"|"super_admin"
const languageNames:Record<string,string>={en:"English",ar:"العربية",fr:"Français",de:"Deutsch",it:"Italiano",zh:"中文",bg:"Български"}
function PublicHeader({locale}:{locale:"ar"|"en"}) {
  const t=useTranslations("publicHome"),router=useRouter(),[role,setRole]=useState<AccountRole|null>(null)
  const pathname=usePathname()
  useEffect(()=>{const controller=new AbortController();void fetch("/api/auth/me",{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)return;const data=await response.json();if(!controller.signal.aborted&&data.authenticated&&["customer","customer_admin","staff","super_admin"].includes(data.user?.role))setRole(data.user.role)}).catch(()=>{});return()=>controller.abort()},[])
  const staff=role==="staff"||role==="super_admin",accountHref=role?(staff?"/admin":"/portal"):"/login"
  return <header className={styles.header}><BrandContainer><div className={styles.headerLayout}>
    <Link href="/" className={styles.logo} aria-label={t("homeLabel")} dir="ltr"><Image src="/brand/nilelink/logos/mark-primary.svg" alt="" width={555} height={555} className={styles.logoMark}/><span className={styles.logoText}><Image src="/brand/nilelink/logos/wordmark-en-on-dark.svg" alt="NileLink Logistics" width={572} height={92} className={styles.logoWordmark}/><span className={styles.logoDivider} aria-hidden="true"/><span className={styles.logoSubtitle} aria-hidden="true">{"LOGISTICS".split("").map((letter,index)=><span key={index}>{letter}</span>)}</span></span></Link>
    <nav className={styles.navigation} aria-label={t("navigationLabel")}>
      <Link href="/services" className={styles.navLink}>{t("services")}</Link>
      <Link href="/#how-we-work" className={styles.navLink}>{t("howWeWork")}</Link>
      <Link href="/#quick-quote" className={styles.navLink}>{t("quote")}</Link>
      <label className={styles.language}><span className={styles.srOnly}>{t("language")}</span><select value={locale} onChange={event=>{const value=event.target.value as typeof routing.locales[number];if(routing.locales.includes(value))router.replace(`${pathname}${window.location.search}${window.location.hash}`,{locale:value})}} aria-label={t("language")}>{routing.locales.map(code=><option key={code} value={code}>{languageNames[code]}</option>)}</select></label>
    </nav>
    <Link href={accountHref} className={styles.account}>{role?(staff?t("staffAccount"):t("customerAccount")):t("login")}</Link>
  </div></BrandContainer></header>
}
export function PublicSiteHeader({locale}:{locale:"ar"|"en"}) {
  return <BrandScope locale={locale}><div className={styles.solidHeader}><PublicHeader locale={locale}/></div></BrandScope>
}
export function PublicHomeHero({locale}:{locale:"ar"|"en"}) {
  const t=useTranslations("publicHome")
  return <BrandScope locale={locale}><BrandSection tone="photo" className={styles.hero} aria-labelledby="public-home-title">
    <div className={styles.photograph}><picture><source srcSet="/brand/responsive/hero-720.webp 720w, /brand/responsive/hero-1280.webp 1280w, /brand/responsive/hero-1920.webp 1920w" sizes="100vw"/><Image src="/brand/responsive/hero-1920.webp" alt={t("imageAlt")} fill sizes="100vw" loading="eager" fetchPriority="high" className={styles.heroImage}/></picture></div><div className={styles.scrim} aria-hidden="true"/>
    <PublicHeader locale={locale}/>
    <BrandContainer className={styles.content}><div className={styles.copy}>
      <p className={styles.eyebrow}><bdi dir="ltr">DAM → WORLD · SEA · AIR · LAND · CUSTOMS</bdi></p>
      <h1 id="public-home-title" className={styles.title}>{t("title")}</h1>
      <p className={styles.description}>{t("description")}</p>
      <div className={styles.actions}><Link href="/#quick-quote" className={`${publicBrandStyles.button} ${publicBrandStyles.primary}`}>{t("quoteCta")}</Link><a href={CONTACT.WHATSAPP} target="_blank" rel="noopener noreferrer" className={`${publicBrandStyles.button} ${publicBrandStyles.secondary}`}>{t("whatsappCta")}</a></div>
      <p className={styles.credit}>{t("photoCredit")} <span dir="ltr">Alexander Bobrov / Pexels</span></p>
    </div></BrandContainer>
  </BrandSection></BrandScope>
}
