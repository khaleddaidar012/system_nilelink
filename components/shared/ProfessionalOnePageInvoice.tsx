"use client"

import { Fragment, useRef } from "react"
import Image from "next/image"
import logoImg from "@/public/images/logo.png"
import { Printer } from "lucide-react"
import type { InvoiceGroup } from "@/lib/shipments/accounting"

export interface OnePageInvoiceTier {
  label: string
  quantity: string | number
  unitPrice: string | number
  subtotal: string | number
  currency?: string
}

export interface OnePageInvoiceItem {
  description: string
  amount: string | number
  quantity?: number
  unitPrice?: number
  tiers?: OnePageInvoiceTier[]
}

export interface OnePageInvoiceProps {
  ar: boolean
  invoiceNumber: string
  referenceNumber?: string
  issueDate?: string
  status?: string
  currency: string
  customerName: string
  bookingNumber?: string
  containerCount?: number | string | null
  containerSize?: string
  certificateNumber?: string
  number46?: string
  shipmentDate?: string
  shippingLine?: string
  items: OnePageInvoiceItem[]
  groups?: InvoiceGroup[]
  total: string | number
  paidAmount?: number
  remainingAmount?: number
  notes?: string
  showPrintButton?: boolean
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩"
const PERSIAN_INDIC = "۰۱۲۳۴۵۶۷۸۹"

export function toEnglishDigits(value: unknown): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, d => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(PERSIAN_INDIC.indexOf(d)))
}

export function formatEnglishMoney(value: string | number): string {
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""))
  if (!Number.isFinite(num)) return toEnglishDigits(value)
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatEnglishDate(value?: string): string {
  if (!value) return "—"
  const iso = String(value).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return toEnglishDigits(iso)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return toEnglishDigits(value)
  return new Date(parsed).toISOString().slice(0, 10)
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Prints the invoice cleanly inside an isolated hidden iframe with automatic
 * 1-page A4 fit scaling — eliminating browser multi-page overflow, repeated
 * fixed headers, and clipped totals.
 */
export function printOnePageInvoiceHtml(props: OnePageInvoiceProps) {
  if (typeof window === "undefined" || typeof document === "undefined") return
  const ar = props.ar
  const label = (a: string, e: string) => (ar ? a : e)
  const origin = window.location.origin
  const logoSrc = `${origin}/images/logo.png`

  const containerDisplay =
    props.containerCount && props.containerSize
      ? `${toEnglishDigits(props.containerCount)} × ${toEnglishDigits(props.containerSize)}`
      : props.containerCount
        ? toEnglishDigits(props.containerCount)
        : "—"

  const metaItems = [
    { l: label("رقم الفاتورة", "Invoice No."), v: toEnglishDigits(props.invoiceNumber || "—") },
    { l: label("رقم الحجز", "Booking No."), v: toEnglishDigits(props.bookingNumber || "—") },
    { l: label("عدد الحاويات × الحجم", "Containers × Size"), v: containerDisplay },
    { l: label("رقم الشهادة / UCR", "Certificate / UCR"), v: toEnglishDigits(props.certificateNumber || "—") },
    { l: label("رقم 46", "Form 46 No."), v: toEnglishDigits(props.number46 || "—") },
    { l: label("اسم العميل", "Customer Name"), v: props.customerName || "—" },
    { l: label("تاريخ تسجيل الشحنة", "Shipment Date"), v: formatEnglishDate(props.shipmentDate || props.issueDate) },
    ...(props.shippingLine ? [{ l: label("الخط الملاحي", "Shipping Line"), v: props.shippingLine }] : []),
  ]

  let tableHtml = ""
  if (props.groups && props.groups.length > 0) {
    const bodyRows = props.groups
      .map(group => {
        const stageName = ar
          ? { shipping: "الشحن", transportation: "النقل", customs: "التخليص الجمركي" }[group.stage]
          : { shipping: "Shipping", transportation: "Transportation", customs: "Customs Clearance" }[group.stage]
        const itemsHtml = group.items
          .map(item => {
            const tiersHtml = (item.tiers || [])
              .map(
                tier => `<tr class="tier-row">
                  <td class="tier-cell"><span class="tier-label">↳ ${escapeHtml(tier.label)}</span> <span class="sep">·</span> <bdi dir="ltr">${escapeHtml(toEnglishDigits(tier.quantity))} × ${escapeHtml(formatEnglishMoney(tier.unitPrice))} ${escapeHtml(tier.currency || props.currency)}</bdi></td>
                  <td class="amt tier-amt"><bdi dir="ltr">${escapeHtml(formatEnglishMoney(tier.subtotal))} ${escapeHtml(props.currency)}</bdi></td>
                </tr>`
              )
              .join("")
            return `<tr class="item-row">
              <td class="item-cell">${escapeHtml(item.description)}</td>
              <td class="amt item-amt"><bdi dir="ltr">${escapeHtml(formatEnglishMoney(item.amount))} ${escapeHtml(props.currency)}</bdi></td>
            </tr>${tiersHtml}`
          })
          .join("")
        return `<tr class="stage-row"><td colspan="2">${escapeHtml(stageName)}</td></tr>
          ${itemsHtml}
          <tr class="subtotal-row">
            <td>${escapeHtml(label(`إجمالي ${stageName}`, `${stageName} Subtotal`))}</td>
            <td class="amt"><bdi dir="ltr">${escapeHtml(formatEnglishMoney(group.total))} ${escapeHtml(props.currency)}</bdi></td>
          </tr>`
      })
      .join("")
    tableHtml = `<table>
      <thead><tr><th>${escapeHtml(label("البيان والبنود الفرعية", "Description & Sub-items"))}</th><th class="amt">${escapeHtml(label("المبلغ", "Amount"))}</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`
  } else {
    const bodyRows = props.items
      .map((item, idx) => {
        const tiersHtml = (item.tiers || [])
          .map(
            tier => `<tr class="tier-row">
              <td></td>
              <td class="tier-cell"><span class="tier-label">↳ ${escapeHtml(tier.label)}</span> <span class="sep">·</span> <bdi dir="ltr">${escapeHtml(toEnglishDigits(tier.quantity))} × ${escapeHtml(formatEnglishMoney(tier.unitPrice))} ${escapeHtml(tier.currency || props.currency)}</bdi></td>
              <td class="amt tier-amt"><bdi dir="ltr">${escapeHtml(formatEnglishMoney(tier.subtotal))} ${escapeHtml(props.currency)}</bdi></td>
            </tr>`
          )
          .join("")
        return `<tr class="item-row">
          <td class="num"><bdi dir="ltr">${idx + 1}</bdi></td>
          <td class="item-cell">${escapeHtml(item.description)}</td>
          <td class="amt item-amt"><bdi dir="ltr">${escapeHtml(formatEnglishMoney(item.amount))} ${escapeHtml(props.currency)}</bdi></td>
        </tr>${tiersHtml}`
      })
      .join("")
    tableHtml = `<table>
      <thead><tr><th class="num">#</th><th>${escapeHtml(label("البيان / البند", "Description"))}</th><th class="amt">${escapeHtml(label("المبلغ", "Amount"))}</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`
  }

  const paidRows =
    typeof props.paidAmount === "number" && props.paidAmount > 0
      ? `<div class="tot-row paid"><span>${escapeHtml(label("المدفوع", "Paid"))}</span><bdi dir="ltr">${escapeHtml(formatEnglishMoney(props.paidAmount))} ${escapeHtml(props.currency)}</bdi></div>
         <div class="tot-row rem"><span>${escapeHtml(label("المتبقي", "Balance Due"))}</span><bdi dir="ltr">${escapeHtml(formatEnglishMoney(props.remainingAmount ?? 0))} ${escapeHtml(props.currency)}</bdi></div>`
      : ""

  const notesHtml = props.notes
    ? `<div class="notes"><strong>${escapeHtml(label("ملاحظات:", "Notes:"))}</strong> ${escapeHtml(props.notes)}</div>`
    : ""

  const html = `<!doctype html>
<html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(toEnglishDigits(props.invoiceNumber))} — NileLink Logistics</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; font-family: "Segoe UI", Tahoma, Arial, sans-serif; }
  .sheet { width: 194mm; margin: 0 auto; padding: 2mm 0; }
  .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 8px; }
  .brand { display: flex; align-items: center; gap: 10px; direction: ltr; }
  .brand img { height: 40px; width: auto; object-fit: contain; }
  .brand-name { font-size: 15px; font-weight: 900; letter-spacing: 0.06em; color: #0f172a; }
  .brand-sub { font-size: 10px; color: #64748b; font-weight: 600; }
  .title-box { text-align: end; }
  .title-box h1 { margin: 0; font-size: 16px; font-weight: 900; color: #0369a1; }
  .title-box .inv-no { margin-top: 2px; font-size: 11px; font-weight: 800; color: #1e293b; }
  .title-box .inv-dt { font-size: 10px; color: #64748b; }
  .meta { margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; padding: 8px 10px; }
  .meta-title { margin: 0 0 6px; font-size: 10px; font-weight: 800; color: #334155; }
  .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 10px; }
  .meta-k { font-size: 9px; color: #64748b; font-weight: 600; }
  .meta-v { font-size: 11px; color: #0f172a; font-weight: 800; margin-top: 1px; }
  .sec-title { margin: 10px 0 5px; font-size: 10.5px; font-weight: 800; color: #334155; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { background: #f1f5f9; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 5px 8px; text-align: start; font-weight: 800; color: #334155; }
  td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  .num { width: 28px; color: #64748b; font-weight: 700; }
  .amt { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .stage-row td { background: #f1f5f9; font-weight: 800; color: #1e293b; padding: 4px 8px; font-size: 10.5px; }
  .item-row td { font-weight: 700; color: #0f172a; }
  .item-cell { padding-inline-start: 14px; }
  .tier-row td { background: #f8fafc; color: #475569; font-size: 9.8px; padding: 3px 8px; border-bottom: 1px solid #f1f5f9; }
  .tier-cell { padding-inline-start: 26px; }
  .tier-label { font-weight: 700; color: #334155; }
  .sep { color: #94a3b8; margin: 0 4px; }
  .tier-amt { font-weight: 700; color: #334155; }
  .subtotal-row td { background: #f8fafc; font-weight: 800; color: #0f172a; border-bottom: 1.5px solid #cbd5e1; padding: 4.5px 8px; }
  .totals-wrap { display: flex; justify-content: flex-end; margin-top: 10px; }
  .totals-box { min-width: 240px; border: 1.5px solid #cbd5e1; border-radius: 8px; background: #f8fafc; padding: 8px 12px; }
  .tot-main { display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 13px; font-weight: 900; color: #0f172a; }
  .tot-main bdi { color: #0369a1; }
  .tot-row { display: flex; justify-content: space-between; gap: 16px; font-size: 10.5px; font-weight: 700; margin-top: 4px; }
  .tot-row.paid { color: #047857; }
  .tot-row.rem { border-top: 1px solid #cbd5e1; padding-top: 4px; color: #0f172a; }
  .notes { margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; font-size: 10px; color: #475569; }
  .ftr { margin-top: 10px; border-top: 1px solid #cbd5e1; padding-top: 6px; display: flex; justify-content: space-between; font-size: 9.5px; color: #64748b; }
</style>
</head>
<body>
  <div id="sheet" class="sheet">
    <header class="hdr">
      <div class="brand">
        <img src="${logoSrc}" alt="NileLink Logistics" />
        <div>
          <div class="brand-name">NILELINK LOGISTICS</div>
          <div class="brand-sub">Freight Forwarding &amp; Customs Clearance</div>
        </div>
      </div>
      <div class="title-box">
        <h1>${escapeHtml(label("فاتورة خدمات لوجستية", "LOGISTICS SERVICE INVOICE"))}</h1>
        <div class="inv-no"><bdi dir="ltr">${escapeHtml(toEnglishDigits(props.invoiceNumber))}</bdi></div>
        ${props.issueDate ? `<div class="inv-dt">${escapeHtml(label("تاريخ الإصدار:", "Issue Date:"))} <bdi dir="ltr">${escapeHtml(formatEnglishDate(props.issueDate))}</bdi></div>` : ""}
      </div>
    </header>
    <section class="meta">
      <div class="meta-title">${escapeHtml(label("بيانات الشحنة والعميل", "Shipment & Customer Details"))}</div>
      <div class="meta-grid">
        ${metaItems.map(m => `<div><div class="meta-k">${escapeHtml(m.l)}</div><div class="meta-v"><bdi dir="ltr">${escapeHtml(m.v)}</bdi></div></div>`).join("")}
      </div>
    </section>
    <div class="sec-title">${escapeHtml(label("الحسابات المالية والبنود", "Financial Breakdown"))}</div>
    ${tableHtml}
    <div class="totals-wrap">
      <div class="totals-box">
        <div class="tot-main">
          <span>${escapeHtml(label("الإجمالي المستحق", "Total Amount"))}</span>
          <bdi dir="ltr">${escapeHtml(formatEnglishMoney(props.total))} ${escapeHtml(props.currency)}</bdi>
        </div>
        ${paidRows}
      </div>
    </div>
    ${notesHtml}
    <footer class="ftr">
      <span>NileLink Logistics S.A.E · Damietta, Egypt</span>
      <span dir="ltr">+20 100 001 8549 · info@nilelinklogistics.com · nilelinklogistics.com</span>
    </footer>
  </div>
</body>
</html>`

  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe)
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  const triggerPrint = () => {
    try {
      const sheet = doc.getElementById("sheet")
      if (sheet) {
        // Printable A4 height at 96dpi with 8mm top+bottom margins is ~1045px
        const maxPrintHeightPx = 1030
        const actualHeight = sheet.scrollHeight
        if (actualHeight > maxPrintHeightPx) {
          const scale = Math.max(0.62, maxPrintHeightPx / actualHeight)
          ;(sheet.style as any).zoom = String(scale)
        }
      }
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      }, 1500)
    }
  }

  const img = doc.querySelector("img")
  if (img && !img.complete) {
    img.onload = triggerPrint
    img.onerror = triggerPrint
  } else {
    window.setTimeout(triggerPrint, 120)
  }
}

export function ProfessionalOnePageInvoice(props: OnePageInvoiceProps) {
  const { ar } = props
  const label = (a: string, e: string) => (ar ? a : e)
  const containerRef = useRef<HTMLDivElement>(null)

  const containerDisplay =
    props.containerCount && props.containerSize
      ? `${toEnglishDigits(props.containerCount)} × ${toEnglishDigits(props.containerSize)}`
      : props.containerCount
        ? toEnglishDigits(props.containerCount)
        : "—"

  const shipmentMetaRows = [
    { label: label("رقم الفاتورة", "Invoice No."), value: toEnglishDigits(props.invoiceNumber || "—") },
    { label: label("رقم الحجز", "Booking No."), value: toEnglishDigits(props.bookingNumber || "—") },
    { label: label("عدد الحاويات × الحجم", "Containers × Size"), value: containerDisplay },
    { label: label("رقم الشهادة / UCR", "Certificate / UCR"), value: toEnglishDigits(props.certificateNumber || "—") },
    { label: label("رقم 46", "Form 46 No."), value: toEnglishDigits(props.number46 || "—") },
    { label: label("اسم العميل", "Customer Name"), value: props.customerName || "—" },
    { label: label("تاريخ تسجيل الشحنة", "Shipment Date"), value: formatEnglishDate(props.shipmentDate || props.issueDate) },
    ...(props.shippingLine ? [{ label: label("الخط الملاحي", "Shipping Line"), value: props.shippingLine }] : []),
  ]

  return (
    <div ref={containerRef} className="space-y-3">
      {props.showPrintButton !== false && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => printOnePageInvoiceHtml(props)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700"
          >
            <Printer className="h-4 w-4" />
            <span>{label("طباعة / حفظ PDF (ورقة واحدة A4)", "Print / Save PDF (1-Page A4)")}</span>
          </button>
        </div>
      )}

      <article
        dir={ar ? "rtl" : "ltr"}
        className="mx-auto w-full max-w-[210mm] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8"
      >
        {/* Header with Official Logo */}
        <div className="flex items-center justify-between gap-4 border-b-2 border-primary-600 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-20 shrink-0">
              <Image src={logoImg} alt="NileLink Logistics" fill sizes="80px" className="object-contain" priority />
            </div>
            <div dir="ltr" className="leading-tight">
              <p className="text-base font-black tracking-wider text-slate-900 uppercase">NILELINK LOGISTICS</p>
              <p className="text-[11px] font-semibold text-slate-500">Freight Forwarding & Customs Clearance</p>
            </div>
          </div>

          <div className="text-end">
            <h2 className="text-lg font-black text-primary-700">
              {label("فاتورة خدمات لوجستية", "LOGISTICS SERVICE INVOICE")}
            </h2>
            <p className="mt-0.5 text-xs font-bold text-slate-700 tabular-nums">
              <bdi dir="ltr">{toEnglishDigits(props.invoiceNumber)}</bdi>
            </p>
            {props.issueDate && (
              <p className="text-[11px] text-slate-500 tabular-nums">
                {label("تاريخ الإصدار:", "Issue Date:")} <bdi dir="ltr">{formatEnglishDate(props.issueDate)}</bdi>
              </p>
            )}
          </div>
        </div>

        {/* Shipment Data Block BEFORE Financial Calculations */}
        <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <h3 className="mb-2.5 text-xs font-extrabold tracking-wide text-slate-700 uppercase">
            {label("بيانات الشحنة والعميل", "Shipment & Customer Details")}
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            {shipmentMetaRows.map(row => (
              <div key={row.label} className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-500">{row.label}</p>
                <p className="mt-0.5 truncate font-bold text-slate-900 tabular-nums">
                  <bdi dir="ltr">{row.value}</bdi>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Financial Line Items Table (with Tiered Pricing Sub-items) */}
        <section className="mt-4">
          <h3 className="mb-2 text-xs font-extrabold tracking-wide text-slate-700 uppercase">
            {label("الحسابات المالية والبنود", "Financial Breakdown")}
          </h3>
          {props.groups && props.groups.length > 0 ? (
            <table className="w-full border-collapse text-start text-xs">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-100 text-slate-700">
                  <th className="px-2.5 py-2 text-start font-bold">{label("البيان والبنود الفرعية", "Description & Sub-items")}</th>
                  <th className="w-40 px-2.5 py-2 text-end font-bold">{label("المبلغ", "Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {props.groups.map(group => {
                  const stageName = ar
                    ? { shipping: "الشحن", transportation: "النقل", customs: "التخليص الجمركي" }[group.stage]
                    : { shipping: "Shipping", transportation: "Transportation", customs: "Customs Clearance" }[group.stage]
                  return (
                    <Fragment key={group.stage}>
                      <tr className="bg-slate-100/80 font-extrabold text-slate-800">
                        <td className="px-2.5 py-1.5" colSpan={2}>{stageName}</td>
                      </tr>
                      {group.items.map((item, idx) => (
                        <Fragment key={idx}>
                          <tr className="border-b border-slate-200/80">
                            <td className="py-2 pe-2.5 ps-4 font-bold text-slate-900">{item.description}</td>
                            <td className="px-2.5 py-2 text-end font-bold text-slate-900 tabular-nums">
                              <bdi dir="ltr">
                                {formatEnglishMoney(item.amount)} {props.currency}
                              </bdi>
                            </td>
                          </tr>
                          {item.tiers && item.tiers.length > 0 && item.tiers.map((tier, tIdx) => (
                            <tr key={tIdx} className="border-b border-slate-100 bg-slate-50/50 text-[11px] text-slate-600">
                              <td className="py-1.5 pe-2.5 ps-8">
                                <span className="font-semibold text-slate-700">↳ {tier.label}</span>
                                <span className="mx-1.5 text-slate-400">·</span>
                                <bdi dir="ltr" className="tabular-nums text-slate-500">
                                  {toEnglishDigits(tier.quantity)} × {formatEnglishMoney(tier.unitPrice)} {tier.currency || props.currency}
                                </bdi>
                              </td>
                              <td className="px-2.5 py-1.5 text-end font-semibold text-slate-700 tabular-nums">
                                <bdi dir="ltr">
                                  {formatEnglishMoney(tier.subtotal)} {props.currency}
                                </bdi>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                      <tr className="border-b border-slate-300 bg-slate-50/70 font-bold text-slate-800">
                        <td className="px-2.5 py-1.5">{label(`إجمالي ${stageName}`, `${stageName} Subtotal`)}</td>
                        <td className="px-2.5 py-1.5 text-end tabular-nums">
                          <bdi dir="ltr">
                            {formatEnglishMoney(group.total)} {props.currency}
                          </bdi>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-start text-xs">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-100 text-slate-700">
                  <th className="w-10 px-2.5 py-2 text-start font-bold">#</th>
                  <th className="px-2.5 py-2 text-start font-bold">{label("البيان / البند", "Description")}</th>
                  <th className="w-36 px-2.5 py-2 text-end font-bold">{label("المبلغ", "Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {props.items.map((item, idx) => (
                  <Fragment key={idx}>
                    <tr className="border-b border-slate-200/80">
                      <td className="px-2.5 py-2 font-semibold text-slate-500 tabular-nums">
                        <bdi dir="ltr">{idx + 1}</bdi>
                      </td>
                      <td className="px-2.5 py-2 font-bold text-slate-900">{item.description}</td>
                      <td className="px-2.5 py-2 text-end font-bold text-slate-900 tabular-nums">
                        <bdi dir="ltr">
                          {formatEnglishMoney(item.amount)} {props.currency}
                        </bdi>
                      </td>
                    </tr>
                    {item.tiers && item.tiers.length > 0 && item.tiers.map((tier, tIdx) => (
                      <tr key={tIdx} className="border-b border-slate-100 bg-slate-50/50 text-[11px] text-slate-600">
                        <td className="px-2.5 py-1.5" />
                        <td className="py-1.5 pe-2.5 ps-6">
                          <span className="font-semibold text-slate-700">↳ {tier.label}</span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <bdi dir="ltr" className="tabular-nums text-slate-500">
                            {toEnglishDigits(tier.quantity)} × {formatEnglishMoney(tier.unitPrice)} {tier.currency || props.currency}
                          </bdi>
                        </td>
                        <td className="px-2.5 py-1.5 text-end font-semibold text-slate-700 tabular-nums">
                          <bdi dir="ltr">
                            {formatEnglishMoney(tier.subtotal)} {props.currency}
                          </bdi>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Totals Summary */}
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between text-sm font-black text-slate-900">
              <span>{label("الإجمالي المستحق", "Total Amount")}</span>
              <bdi dir="ltr" className="tabular-nums text-primary-700">
                {formatEnglishMoney(props.total)} {props.currency}
              </bdi>
            </div>
            {typeof props.paidAmount === "number" && props.paidAmount > 0 && (
              <>
                <div className="flex items-center justify-between text-emerald-700">
                  <span>{label("المدفوع", "Paid")}</span>
                  <bdi dir="ltr" className="font-bold tabular-nums">
                    {formatEnglishMoney(props.paidAmount)} {props.currency}
                  </bdi>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
                  <span>{label("المتبقي", "Balance Due")}</span>
                  <bdi dir="ltr" className="tabular-nums">
                    {formatEnglishMoney(props.remainingAmount ?? 0)} {props.currency}
                  </bdi>
                </div>
              </>
            )}
          </div>
        </div>

        {props.notes && (
          <div className="mt-3 rounded-lg border border-slate-200/80 bg-white p-2.5 text-[11px] text-slate-600">
            <span className="font-bold text-slate-800">{label("ملاحظات:", "Notes:")} </span>
            <span className="whitespace-pre-wrap">{props.notes}</span>
          </div>
        )}

        {/* Official Compact Footer */}
        <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
          <span>NileLink Logistics S.A.E · Damietta, Egypt</span>
          <span dir="ltr" className="tabular-nums">
            +20 100 001 8549 · info@nilelinklogistics.com · nilelinklogistics.com
          </span>
        </footer>
      </article>
    </div>
  )
}
