import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { assertStaffPermission } from "@/lib/auth/require-permission"
import { generateCustomerLedger } from "@/lib/engine/customer-ledger-engine"
import { generateCustomerStatementPdfBuffer } from "@/lib/services/statement-pdf-generator"
import { sendEmail } from "@/lib/email/send"
import { getStatementEmailTemplate } from "@/lib/email/templates/statement-email"
import mongoose from "mongoose"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "statement-send", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Permission check: sendFinancialDocuments
    const auth = await assertStaffPermission(req, "sendFinancialDocuments")
    if (!auth.authorized) {
      return auth.response
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Customer ID" }, { status: 400 })
    }

    const body = await req.json()
    const { fromDate, toDate, recipientEmail: customRecipient, customMessage, currency = "EGP" } = body

    // 1. Calculate Statement
    const statement = await generateCustomerLedger({
      customerId: id,
      fromDate,
      toDate,
      filterType: "all",
      currency,
      actorSession: {
        userId: session.userId,
        name: `${session.firstName} ${session.lastName}`.trim(),
        email: session.email,
      },
    })

    const targetEmail = customRecipient?.trim() || statement.customer.contactEmail
    if (!targetEmail || !targetEmail.includes("@")) {
      return NextResponse.json(
        { error: "Customer does not have a valid contact email address. Please specify a recipient email." },
        { status: 400 }
      )
    }

    // 2. Generate PDF Buffer
    const pdfBuffer = await generateCustomerStatementPdfBuffer(statement)

    // 3. Build Email Template
    const periodStr = statement.period.from && statement.period.to
      ? `${statement.period.from} إلى ${statement.period.to}`
      : statement.period.from
        ? `من ${statement.period.from}`
        : "كامل السجل المالي"

    const emailHtml = getStatementEmailTemplate({
      customerName: statement.customer.companyName || "العميل المحترم",
      periodStr,
      openingBalance: statement.summary.openingBalance,
      totalDebit: statement.summary.totalDebit,
      totalCredit: statement.summary.totalCredit,
      closingBalance: statement.summary.closingBalance,
      currency: statement.summary.currency,
      customMessage: customMessage?.trim() || undefined,
    })

    // 4. Send Email with Attached PDF
    await sendEmail({
      to: targetEmail,
      subject: `كشف حساب مالي — ${statement.customer.companyName} — نايل لينك اللوجستية`,
      html: emailHtml,
      attachments: [
        {
          filename: `Statement-${statement.customer.companyName}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    })

    return NextResponse.json({
      success: true,
      message: `Statement PDF successfully emailed to ${targetEmail}`,
      recipient: targetEmail,
    })
  } catch (error: any) {
    console.error("Send statement email error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to send statement email" },
      { status: 500 }
    )
  }
}
