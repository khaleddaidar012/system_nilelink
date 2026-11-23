"use client"

import {useEffect, useRef, useState, type FormEvent} from "react"
import {useTranslations} from "next-intl"
import {Link} from "@/navigation"
import {quickQuoteSchema, type QuickQuoteData} from "@/types/quick-quote"
import {BrandButton, BrandContainer, BrandHeading, BrandInput, BrandNotice, BrandScope, BrandSection} from "@/components/public-brand"
import styles from "./public-quick-quote.module.css"

export function PublicQuickQuote({locale}: {locale: "ar" | "en"}) {
  const t = useTranslations("publicQuickQuote")
  const initial = (): QuickQuoteData => ({from: locale === "ar" ? "دمياط" : "Damietta", to: "", shipmentType: "", phone: ""})
  const [values, setValues] = useState<QuickQuoteData>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof QuickQuoteData, string>>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<"success" | "error" | null>(null)
  const pending = useRef(false), requestKey = useRef<string | null>(null), noticeRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (notice) noticeRef.current?.focus() }, [notice])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setNotice(null)
    const parsed = quickQuoteSchema.safeParse(values)
    if (!parsed.success) {
      const fields: typeof errors = {}
      for (const issue of parsed.error.issues) fields[issue.path[0] as keyof QuickQuoteData] = t("invalid")
      setErrors(fields)
      const form = event.currentTarget
      requestAnimationFrame(() => form.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus())
      return
    }
    pending.current = true
    setBusy(true)
    setErrors({})
    try {
      requestKey.current ||= crypto.randomUUID()
      const response = await fetch("/api/quick-quote", {method: "POST", headers: {"Content-Type": "application/json", "Idempotency-Key": requestKey.current}, body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(35000)})
      const result = await response.json()
      if (!response.ok || result.success !== true) throw new Error("Request not accepted")
      setValues(initial())
      requestKey.current = null
      setNotice("success")
    } catch {
      setNotice("error")
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <BrandScope locale={locale}>
    <BrandSection id="quick-quote" tone="oxidation" className={styles.section} aria-labelledby="quick-quote-title">
      <BrandContainer className={styles.layout}>
        <div className={styles.copy}>
          <BrandHeading id="quick-quote-title">{t("title")}</BrandHeading>
          <p className={styles.description}>{t("description")}</p>
        </div>
        <form onSubmit={submit} noValidate className={styles.form} aria-label={t("title")} aria-busy={busy}>
          <div className={styles.fields}>
            {(["from", "to", "shipmentType", "phone"] as const).map(key => <div key={key} className={key === "phone" ? styles.phone : undefined}>
              <BrandInput id={`quick-${key}`} name={key} label={t(key)} required maxLength={key === "phone" ? 30 : key === "shipmentType" ? 100 : 200}
                type={key === "phone" ? "tel" : "text"} dir={key === "phone" ? "ltr" : undefined} autoComplete={key === "phone" ? "tel" : "off"}
                placeholder={key === "to" ? t("destinationExample") : key === "shipmentType" ? "FCL 40’ HC / LCL" : key === "phone" ? "+20" : undefined}
                disabled={busy} value={values[key]} error={errors[key]} onChange={event => {setValues({...values, [key]: event.target.value}); setErrors({...errors, [key]: undefined}); setNotice(null); requestKey.current = null}}/>
            </div>)}
          </div>
          <p className={styles.hint}>{t("followUp")}</p>
          <BrandButton type="submit" variant="steel" disabled={busy} className={styles.submit}>{busy ? t("sending") : t("submit")}</BrandButton>
          {notice && <div ref={noticeRef} tabIndex={-1}><BrandNotice kind={notice}>{t(notice)}</BrandNotice></div>}
          <Link href="/request-quote" className={styles.fullForm}>{t("fullForm")}</Link>
        </form>
      </BrandContainer>
    </BrandSection>
  </BrandScope>
}
