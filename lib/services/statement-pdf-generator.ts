import PDFDocument from "pdfkit"
import type { ICustomerStatement } from "@/types/customer-statement"
import { getPdfAssets } from "./pdf-assets"
import type { PdfAssets } from "./pdf-assets"
import { shapeArabicText } from "naqqash"

function formatTextForPdf(text: string | null | undefined): { text: string; isRtl: boolean } {
  if (!text || typeof text !== "string") {
    return { text: text || "", isRtl: false }
  }
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)
  if (!hasArabic) {
    return { text, isRtl: false }
  }

  try {
    const shaped = shapeArabicText(text)
    const tokens = shaped.split(" ")
    return { text: tokens.reverse().join(" "), isRtl: true }
  } catch (err) {
    console.error("Arabic text shaping failed:", err)
    return { text, isRtl: false }
  }
}

export async function generateCustomerStatementPdfBuffer(
  statement: ICustomerStatement,
  suppliedAssets?: PdfAssets
): Promise<Buffer> {
  const assets = suppliedAssets ?? await getPdfAssets()
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 35, font: assets.regular as unknown as string })
    const buffers: Buffer[] = []

    doc.on("data", buffers.push.bind(buffers))
    doc.on("end", () => resolve(Buffer.concat(buffers)))
    doc.on("error", reject)

    doc.registerFont("AppFont", assets.regular)
    doc.registerFont("AppFontBold", assets.bold)

    // Top Brand Bar
    doc.rect(35, 25, 525, 4).fill("#2563eb")

    // 1. Header & Brand Logo
    const logo = assets.logo
    if (logo) {
      try {
        doc.image(logo, 35, 36, { height: 40 })
      } catch {
        doc.font("AppFontBold").fontSize(16).fillColor("#0f172a").text("NILE LINK LOGISTICS", 35, 38)
      }
    } else {
      doc.font("AppFontBold").fontSize(16).fillColor("#0f172a").text("NILE LINK LOGISTICS", 35, 38)
    }

    // Header Right: Document Title & Metadata
    doc.font("AppFontBold").fontSize(14).fillColor("#0f172a").text("CUSTOMER ACCOUNT STATEMENT", 280, 38, { align: "right", width: 280 })
    
    const genDateStr = new Date(statement.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    doc.font("AppFont").fontSize(8.5).fillColor("#64748b").text(`Date Generated: ${genDateStr}`, 280, 58, { align: "right", width: 280 })
    
    const periodStr = statement.period.from && statement.period.to
      ? `${statement.period.from} to ${statement.period.to}`
      : statement.period.from
        ? `From ${statement.period.from}`
        : "All-Time Statement"
    doc.text(`Statement Period: ${periodStr}`, 280, 77, { align: "right", width: 280 })

    // Issuer Info (Left)
    doc.font("AppFontBold").fontSize(8.5).fillColor("#0f172a").text("Nile Link Logistics S.A.E", 35, 84)
    doc.font("AppFont").fontSize(7.5).fillColor("#64748b").text("Tax ID: 612-489-321 | Damietta / Cairo, Egypt", 35, 96)
    doc.text("Email: info@nilelinklogistics.com | Web: www.nilelinklogistics.com", 35, 107)

    // Divider Line
    doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(35, 122).lineTo(560, 122).stroke()

    // 2. Customer Information Box
    const cust = statement.customer
    const custNameFormatted = formatTextForPdf(cust.companyName || "N/A")
    const custAddressFormatted = formatTextForPdf(cust.address ? `${cust.address}, ${cust.city || ""} Egypt` : "Egypt")

    doc.rect(35, 130, 525, 48).fill("#f8fafc")
    doc.font("AppFontBold").fontSize(8).fillColor("#64748b").text("BILLED CUSTOMER ACCOUNT:", 45, 136)
    doc.font("AppFontBold").fontSize(10).fillColor("#0f172a").text(custNameFormatted.text, 45, 147, {
      width: 250,
      align: custNameFormatted.isRtl ? "right" : "left",
    })
    doc.font("AppFont").fontSize(7.5).fillColor("#475569").text(custAddressFormatted.text, 45, 161, {
      width: 250,
      align: custAddressFormatted.isRtl ? "right" : "left",
    })

    // Customer Tax / Contact on Right side of Box
    doc.font("AppFont").fontSize(8).fillColor("#475569")
    doc.text(`Tax ID / CR: ${cust.taxCardNumber || cust.commercialRegisterNumber || "N/A"}`, 320, 138)
    doc.text(`Email: ${cust.contactEmail || "N/A"}`, 320, 150)
    doc.text(`Phone: ${cust.contactPhone || "N/A"}`, 320, 162)

    // 3. Financial Summary KPI Ribbon (4 Boxes)
    const kpiY = 188
    const boxW = 126
    const boxGap = 7
    const summary = statement.summary

    // Box 1: Opening Balance
    doc.rect(35, kpiY, boxW, 40).fill("#f1f5f9")
    doc.font("AppFont").fontSize(7.5).fillColor("#64748b").text("OPENING BALANCE", 42, kpiY + 6)
    const arOp = formatTextForPdf("الرصيد الافتتاحي")
    doc.font("AppFont").fontSize(7).fillColor("#94a3b8").text(arOp.text, 42, kpiY + 16, { width: boxW - 14, align: "right" })
    doc.font("AppFontBold").fontSize(10).fillColor("#0f172a").text(`${Number(summary.openingBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${summary.currency}`, 42, kpiY + 26)

    // Box 2: Total Charges / Debit
    const box2X = 35 + boxW + boxGap
    doc.rect(box2X, kpiY, boxW, 40).fill("#f8fafc")
    doc.font("AppFont").fontSize(7.5).fillColor("#64748b").text("TOTAL CHARGES (DEBIT)", box2X + 7, kpiY + 6)
    const arDeb = formatTextForPdf("إجمالي الفواتير")
    doc.font("AppFont").fontSize(7).fillColor("#94a3b8").text(arDeb.text, box2X + 7, kpiY + 16, { width: boxW - 14, align: "right" })
    doc.font("AppFontBold").fontSize(10).fillColor("#e11d48").text(`+${Number(summary.totalDebit).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${summary.currency}`, box2X + 7, kpiY + 26)

    // Box 3: Total Payments / Credit
    const box3X = box2X + boxW + boxGap
    doc.rect(box3X, kpiY, boxW, 40).fill("#f0fdf4")
    doc.font("AppFont").fontSize(7.5).fillColor("#166534").text("TOTAL PAYMENTS (CREDIT)", box3X + 7, kpiY + 6)
    const arCred = formatTextForPdf("إجمالي السدادات")
    doc.font("AppFont").fontSize(7).fillColor("#86efac").text(arCred.text, box3X + 7, kpiY + 16, { width: boxW - 14, align: "right" })
    doc.font("AppFontBold").fontSize(10).fillColor("#16a34a").text(`-${Number(summary.totalCredit).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${summary.currency}`, box3X + 7, kpiY + 26)

    // Box 4: Closing Balance
    const box4X = box3X + boxW + boxGap
    doc.rect(box4X, kpiY, boxW, 40).fill("#0f172a")
    doc.font("AppFont").fontSize(7.5).fillColor("#94a3b8").text("CLOSING BALANCE DUE", box4X + 7, kpiY + 6)
    const arClose = formatTextForPdf("الرصيد المستحق")
    doc.font("AppFont").fontSize(7).fillColor("#64748b").text(arClose.text, box4X + 7, kpiY + 16, { width: boxW - 14, align: "right" })
    doc.font("AppFontBold").fontSize(10).fillColor("#38bdf8").text(`${Number(summary.closingBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${summary.currency}`, box4X + 7, kpiY + 26)

    // 4. Chronological Ledger Table Header
    const renderTableHeader = (yPos: number) => {
      doc.rect(35, yPos, 525, 20).fill("#1e293b")
      doc.font("AppFontBold").fontSize(8).fillColor("#ffffff")
      doc.text("DATE", 42, yPos + 6, { width: 60 })
      doc.text("DESCRIPTION", 105, yPos + 6, { width: 170 })
      doc.text("REFERENCE", 280, yPos + 6, { width: 75 })
      doc.text("DEBIT (+)", 360, yPos + 6, { width: 60, align: "right" })
      doc.text("CREDIT (-)", 425, yPos + 6, { width: 60, align: "right" })
      doc.text("BALANCE", 490, yPos + 6, { width: 65, align: "right" })
    }

    let currentY = 240
    renderTableHeader(currentY)
    currentY += 22

    const entries = statement.entries || []
    if (entries.length === 0) {
      doc.font("AppFont").fontSize(9).fillColor("#94a3b8").text("No financial transactions recorded for this period.", 35, currentY + 15, { align: "center", width: 525 })
      currentY += 40
    } else {
      entries.forEach((entry, idx) => {
        // Page break management
        if (currentY > 730) {
          doc.addPage()
          currentY = 40
          renderTableHeader(currentY)
          currentY += 22
        }

        if (idx % 2 === 1) {
          doc.rect(35, currentY - 2, 525, 18).fill("#f8fafc")
        }

        const dateStr = entry.date ? entry.date.split("T")[0] : "-"
        const descFormatted = formatTextForPdf(entry.description)

        doc.font("AppFont").fontSize(7.5).fillColor("#334155")
        doc.text(dateStr, 42, currentY + 3, { width: 60 })
        doc.text(descFormatted.text, 105, currentY + 3, {
          width: 170,
          align: descFormatted.isRtl ? "right" : "left",
        })
        doc.text(entry.reference || "-", 280, currentY + 3, { width: 75 })

        // Debit
        if (entry.debit > 0) {
          doc.font("AppFontBold").fillColor("#e11d48").text(Number(entry.debit).toLocaleString("en-US", { minimumFractionDigits: 2 }), 360, currentY + 3, { width: 60, align: "right" })
        } else {
          doc.font("AppFont").fillColor("#94a3b8").text("-", 360, currentY + 3, { width: 60, align: "right" })
        }

        // Credit
        if (entry.credit > 0) {
          doc.font("AppFontBold").fillColor("#16a34a").text(Number(entry.credit).toLocaleString("en-US", { minimumFractionDigits: 2 }), 425, currentY + 3, { width: 60, align: "right" })
        } else {
          doc.font("AppFont").fillColor("#94a3b8").text("-", 425, currentY + 3, { width: 60, align: "right" })
        }

        // Running Balance
        doc.font("AppFontBold").fillColor("#0f172a").text(Number(entry.balance).toLocaleString("en-US", { minimumFractionDigits: 2 }), 490, currentY + 3, { width: 65, align: "right" })

        currentY += 18
      })
    }

    // 5. Bank Remittance Details & Footer Notice
    if (currentY > 680) {
      doc.addPage()
      currentY = 40
    } else {
      currentY += 15
    }

    doc.rect(35, currentY, 525, 45).fill("#f8fafc")
    doc.font("AppFontBold").fontSize(8).fillColor("#0f172a").text("PAYMENT SETTLEMENT & REMITTANCE:", 45, currentY + 6)
    doc.font("AppFont").fontSize(7.5).fillColor("#475569")
    doc.text("Beneficiary: Nile Link Logistics S.A.E | Bank: Commercial International Bank (CIB)", 45, currentY + 18)
    doc.text(`IBAN: EG3800100000000001234567890 | SWIFT: CIBEEGCX | Currency: ${summary.currency}`, 45, currentY + 30)

    // Footer signature notice
    doc.strokeColor("#f1f5f9").lineWidth(1).moveTo(35, 785).lineTo(560, 785).stroke()
    const disclaimer = formatTextForPdf("كشف حساب آلي معتمد صادر من شركة نايل لينك للخدمات اللوجستية • Nile Link Logistics S.A.E")
    doc
      .font("AppFont")
      .fillColor("#94a3b8")
      .fontSize(7.5)
      .text(
        disclaimer.text,
        35,
        792,
        { align: "center", width: 525 }
      )

    doc.end()
  })
}
