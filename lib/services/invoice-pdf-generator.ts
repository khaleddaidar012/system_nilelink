import PDFDocument from "pdfkit"
import type { IInvoice, FinancialDocumentType } from "@/lib/models/Invoice"
import { getDocumentTypeMeta } from "@/lib/services/document-type-helper"
import { getPdfAssets } from "./pdf-assets"
import type { PdfAssets } from "./pdf-assets"
import { shapeArabicText } from "naqqash"

/**
 * Handles Arabic cursive text shaping and visual right-to-left layout
 * so it renders natively inside PDFKit.
 */
function formatTextForPdf(text: string | null | undefined): { text: string; isRtl: boolean } {
  if (!text || typeof text !== "string") {
    return { text: text || "", isRtl: false }
  }
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)
  if (!hasArabic) {
    return { text, isRtl: false }
  }

  try {
    // 1. Contextually shape Arabic characters into cursive joined glyphs
    const shaped = shapeArabicText(text)
    // 2. Reverse word order so sentences flow RTL across the page in LTR PDF engines
    const tokens = shaped.split(" ")
    return { text: tokens.reverse().join(" "), isRtl: true }
  } catch (err) {
    console.error("Arabic text shaping failed:", err)
    return { text, isRtl: false }
  }
}

/**
 * Generates an official A4 commercial invoice / statement / tax invoice PDF buffer using pure vector PDF commands.
 * Fully supports dynamic document titles in Arabic (RTL) & English, with zero overlap and high-res brand styling.
 */
export async function generateInvoicePdfBuffer(
  invoice: IInvoice,
  overrideType?: FinancialDocumentType,
  suppliedAssets?: PdfAssets
): Promise<Buffer> {
  const assets = suppliedAssets ?? await getPdfAssets()
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, font: assets.regular as unknown as string })
    const buffers: Buffer[] = []

    doc.on("data", buffers.push.bind(buffers))
    doc.on("end", () => resolve(Buffer.concat(buffers)))
    doc.on("error", reject)

    doc.registerFont("AppFont", assets.regular)
    doc.registerFont("AppFontBold", assets.bold)

    // Top decorative bar
    doc.rect(40, 30, 515, 4).fill("#2563eb")

    // 1. Header & Brand Logo (Constrained height to guarantee zero overlap)
    const logo = assets.logo
    if (logo) {
      try {
        doc.image(logo, 40, 42, { height: 44 })
      } catch {
        doc.font("AppFontBold").fontSize(18).fillColor("#0f172a").text("NILE LINK LOGISTICS", 40, 45)
      }
    } else {
      doc.font("AppFontBold").fontSize(18).fillColor("#0f172a").text("NILE LINK LOGISTICS", 40, 45)
    }

    // Header Right: Title & Invoice Meta
    const activeDocType = overrideType || invoice.documentType || "statement"
    const docMeta = getDocumentTypeMeta(activeDocType)

    doc.font("AppFontBold").fontSize(14).fillColor("#0f172a").text(docMeta.titleEn, 280, 42, { align: "right", width: 275 })
    doc.font("AppFont").fontSize(9).fillColor("#64748b").text(`Doc No: ${invoice.invoiceNumber}`, 280, 62, { align: "right", width: 275 })
    if (invoice.referenceNumber && invoice.referenceNumber !== invoice.invoiceNumber) {
      doc.text(`Reference: ${invoice.referenceNumber}`, 40, 100, { width: 235 })
    }
    doc.text(
      `Issue Date: ${invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-"}`,
      280,
      76,
      { align: "right", width: 275 }
    )
    doc.text(
      `Due Date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "-"}`,
      280,
      90,
      { align: "right", width: 275 }
    )
    doc
      .font("AppFontBold")
      .fontSize(9)
      .fillColor(invoice.status === "paid" ? "#16a34a" : "#0f172a")
      .text(`Status: ${invoice.status.toUpperCase()}`, 280, 104, { align: "right", width: 275 })

    // Issuer Info (Positioned safely below the logo with ample spacing)
    const issuer = invoice.issuerSnapshot || {
      legalName: "Nile Link Logistics S.A.E",
      address: "Entrance to Al-Ananiyah Road, opposite the Ice Factory\nDamietta, Egypt",
      phone: "01000018549",
      email: "info@nilelinklogistics.com",
    }

    doc.font("AppFontBold").fontSize(9.5).fillColor("#0f172a").text(issuer.legalName, 40, 96)
    doc.font("AppFont").fontSize(8).fillColor("#64748b").text(issuer.address, 40, 110, { width: 260, lineGap: 1.5 })
    const contactY = issuer.address && issuer.address.includes("\n") ? 134 : 122
    doc.text(`Email: ${issuer.email} | Phone: ${issuer.phone}`, 40, contactY)

    // Divider Line
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(40, 154).lineTo(555, 154).stroke()

    // 2. Billed To & Shipment Information
    const customer = invoice.customerSnapshot || (invoice as any).customerId || {}
    const shipment = invoice.shipmentSnapshot || (invoice as any).relatedRequestId || null

    const customerNameFormatted = formatTextForPdf(customer.companyName || "N/A")
    const customerAddressFormatted = formatTextForPdf(customer.address || "Egypt")

    doc.font("AppFontBold").fontSize(10).fillColor("#0f172a").text("BILLED TO:", 40, 166)
    doc.font("AppFontBold").fontSize(9.5).fillColor("#0f172a").text(customerNameFormatted.text, 40, 180, {
      width: 250,
      align: customerNameFormatted.isRtl ? "right" : "left",
    })
    doc.font("AppFont").fontSize(8.5).fillColor("#64748b").text(customerAddressFormatted.text, 40, 194, {
      width: 250,
      align: customerAddressFormatted.isRtl ? "right" : "left",
    })
    doc.text(`Tax ID / CR: ${customer.taxCardNumber || customer.commercialRegisterNumber || "N/A"}`, 40, 206)
    doc.text(`Contact: ${customer.contactEmail || "N/A"} | ${customer.contactPhone || ""}`, 40, 218)

    if (shipment) {
      doc.font("AppFontBold").fontSize(10).fillColor("#0f172a").text("SHIPMENT & COMPLIANCE:", 320, 166)
      doc.font("AppFont").fontSize(9).fillColor("#64748b").text(`Tracking Ref: ${shipment.trackingNumber || "N/A"}`, 320, 180)
      doc.text(`Service: ${shipment.serviceType || "Freight Logistics"}`, 320, 193)
      if (shipment.complianceNumber) {
        doc.text(`ACID / UCR: ${shipment.complianceNumber}`, 320, 205)
      }
      if (shipment.origin || shipment.destination) {
        doc.text(`Route: ${shipment.origin || "-"} -> ${shipment.destination || "-"}`, 320, 217)
      }
    }

    // 3. Line Items Table Header
    const tableTop = 246
    doc.rect(40, tableTop, 515, 22).fill("#f8fafc")
    doc.font("AppFontBold").fillColor("#0f172a").fontSize(8.5).text("DESCRIPTION", 50, tableTop + 6)
    if (!invoice.groups?.length) {
      doc.text("QTY", 320, tableTop + 6, { width: 40, align: "center" })
      doc.text("UNIT PRICE", 370, tableTop + 6, { width: 85, align: "right" })
    }
    doc.text("AMOUNT", 465, tableTop + 6, { width: 80, align: "right" })

    // Line items rows
    let currentY = tableTop + 24
    const ensureSpace = (height: number) => {
      if (currentY + height > 750) { doc.addPage(); currentY = 50 }
    }
    if (invoice.groups?.length) {
      const names = { shipping: "الشحن / Shipping", transportation: "النقل / Transportation", customs: "التخليص الجمركي / Customs clearance" }
      const row = (description: string, value?: string, bold = false) => {
        const formatted = formatTextForPdf(description)
        doc.font(bold ? "AppFontBold" : "AppFont").fontSize(9)
        const height = Math.max(26, doc.heightOfString(formatted.text, { width: 350 }) + 12)
        ensureSpace(height)
        if (bold) doc.rect(40, currentY, 515, height).fill("#f1f5f9")
        doc.fillColor("#334155").text(formatted.text, 50, currentY + 6, { width: 350, align: formatted.isRtl ? "right" : "left" })
        if (value !== undefined) doc.text(`${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${invoice.currency}`, 410, currentY + 6, { width: 135, align: "right" })
        currentY += height
      }
      for (const group of invoice.groups) {
        ensureSpace(80)
        row(names[group.stage], undefined, true)
        for (const item of group.items) { row(item.description, item.amount); item.tiers?.forEach(tier=>row(`  ${tier.label}: ${tier.quantity} x ${tier.unitPrice} ${tier.currency}`,tier.subtotal)) }
        row(`إجمالي / Subtotal — ${names[group.stage]}`, group.total, true)
      }
    } else {
    const items = invoice.items || []
    items.forEach((item, index) => {
      ensureSpace(24)
      if (index % 2 === 1) {
        doc.rect(40, currentY - 2, 515, 20).fill("#fafafa")
      }
      const descFormatted = formatTextForPdf(item.description)
      doc.font("AppFont").fillColor("#334155").fontSize(8.5)
      doc.text(descFormatted.text, 50, currentY + 3, {
        width: 260,
        align: descFormatted.isRtl ? "right" : "left",
      })
      doc.text(String(item.quantity), 320, currentY + 3, { width: 40, align: "center" })
      doc.text(Number(item.unitPrice).toLocaleString("en-US", { minimumFractionDigits: 2 }), 370, currentY + 3, {
        width: 85,
        align: "right",
      })
      doc.text(Number(item.total).toLocaleString("en-US", { minimumFractionDigits: 2 }), 465, currentY + 3, {
        width: 80,
        align: "right",
      })
      currentY += 20
    })
    }

    // Divider
    ensureSpace(160)
    currentY += 8
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(40, currentY).lineTo(555, currentY).stroke()
    currentY += 12

    // 4. Financial Totals & Bank Routing
    const totalsStartY = currentY

    // Right Column: Financial Totals
    doc.font("AppFont").fontSize(8.5).fillColor("#64748b").text("Subtotal:", 370, currentY, { width: 85, align: "right" })
    doc
      .fillColor("#0f172a")
      .text(`${Number(invoice.subtotal).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${invoice.currency}`, 465, currentY, {
        width: 80,
        align: "right",
      })
    currentY += 16

    if (invoice.additionalCharges > 0) {
      doc.fillColor("#64748b").text("Additional Surcharges:", 330, currentY, { width: 125, align: "right" })
      doc
        .fillColor("#0f172a")
        .text(
          `${Number(invoice.additionalCharges).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${invoice.currency}`,
          465,
          currentY,
          { width: 80, align: "right" }
        )
      currentY += 16
    }

    if (invoice.discount > 0) {
      doc.fillColor("#64748b").text("Discount Applied:", 370, currentY, { width: 85, align: "right" })
      doc
        .fillColor("#16a34a")
        .text(`-${Number(invoice.discount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${invoice.currency}`, 465, currentY, {
          width: 80,
          align: "right",
        })
      currentY += 16
    }

    doc.fillColor("#64748b").text(`VAT (${invoice.taxRate ?? 14}%):`, 370, currentY, { width: 85, align: "right" })
    doc
      .fillColor("#0f172a")
      .text(`${Number(invoice.tax).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${invoice.currency}`, 465, currentY, {
        width: 80,
        align: "right",
      })
    currentY += 20

    // Grand Total Box
    doc.rect(340, currentY - 2, 215, 26).fill("#0f172a")
    doc.font("AppFontBold").fillColor("#ffffff").fontSize(10).text("TOTAL DUE:", 350, currentY + 6)
    doc.text(
      `${Number(invoice.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${invoice.currency}`,
      440,
      currentY + 6,
      { width: 105, align: "right" }
    )

    // Left Column: Bank Payment Remittance
    doc.font("AppFontBold").fillColor("#0f172a").fontSize(9.5).text("BANK REMITTANCE DETAILS", 40, totalsStartY)
    doc.font("AppFont").fillColor("#64748b").fontSize(8)
    doc.text(`Bank Name: Commercial International Bank (CIB)`, 40, totalsStartY + 14)
    doc.text(`Beneficiary: Nile Link Logistics S.A.E`, 40, totalsStartY + 26)
    doc.text(`IBAN: EG3800100000000001234567890`, 40, totalsStartY + 38)
    doc.text(`SWIFT / BIC: CIBEEGCX`, 40, totalsStartY + 50)
    doc.text(`Currency: ${invoice.currency}`, 40, totalsStartY + 62)

    // 5. Notes & Footer
    currentY += 45
    if (invoice.notes) {
      const notesFormatted = formatTextForPdf(invoice.notes)
      doc.font("AppFontBold").fillColor("#0f172a").fontSize(8.5).text("REMARKS & PAYMENT INSTRUCTIONS:", 40, currentY)
      doc.font("AppFont").fillColor("#64748b").fontSize(8).text(notesFormatted.text, 40, currentY + 12, {
        width: 515,
        align: notesFormatted.isRtl ? "right" : "left",
      })
      currentY += 30
    }

    // Footer signature notice
    doc.strokeColor("#f1f5f9").lineWidth(1).moveTo(40, 780).lineTo(555, 780).stroke()
    const footerNotice =
      activeDocType === "tax_invoice"
        ? "Nile Link Logistics S.A.E • Official Approved Tax Invoice issued under Egyptian VAT Regulations • Registered in Egypt"
        : activeDocType === "statement"
          ? "Nile Link Logistics S.A.E • Computer-generated Customer Account Statement • Registered in Egypt"
          : "Nile Link Logistics S.A.E • Registered in Egypt • This commercial invoice is computer-generated and legally valid."
    const shapedFooter = formatTextForPdf(footerNotice)
    doc
      .font("AppFont")
      .fillColor("#94a3b8")
      .fontSize(7.5)
      .text(
        shapedFooter.text,
        40,
        788,
        { align: "center", width: 515 }
      )

    doc.end()
  })
}
