import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Invoice, InvoiceActivityLog } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { generateInvoicePdfBuffer } from "@/lib/services/invoice-pdf-generator"
import { sendEmail } from "@/lib/email/send"
import { getInvoiceEmailTemplate } from "@/lib/email/templates/invoice-email"
import mongoose from "mongoose"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "invoice-send", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Invoice ID" }, { status: 400 })
    }

    await connectDB()

    const invoice = await Invoice.findById(id).populate("customerId")
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // STRICT SAFETY GATE: Drafts cannot be sent to customers
    if (invoice.status === "draft") {
      return NextResponse.json(
        { error: "Draft invoices cannot be sent to customers. The invoice must be reviewed and confirmed first." },
        { status: 400 }
      )
    }

    const customer = invoice.customerSnapshot || (invoice.customerId as any)
    const recipientEmail = customer?.contactEmail

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Customer does not have a registered contact email address." },
        { status: 400 }
      )
    }

    // 1. Generate A4 PDF Buffer
    const pdfBuffer = await generateInvoicePdfBuffer(invoice)

    // 2. Build Email HTML
    const emailHtml = getInvoiceEmailTemplate({
      customerName: customer.companyName || "Valued Client",
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      token: invoice.token,
    })

    // 3. Dispatch Email with PDF Attachment via existing Email Provider
    await sendEmail({
      to: recipientEmail,
      subject: `Commercial Invoice ${invoice.invoiceNumber} — Nile Link Logistics`,
      html: emailHtml,
      attachments: [
        {
          filename: `${invoice.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    })

    // 4. Update Invoice Record
    if (invoice.status === "confirmed") {
      invoice.status = "sent"
    }
    invoice.sentBy = session.userId as any
    invoice.sentAt = new Date()
    invoice.recipientEmail = recipientEmail
    await invoice.save()

    // 5. Record Activity Log
    await InvoiceActivityLog.create({
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      actorId: session.userId,
      actorName: `${session.firstName} ${session.lastName}`,
      actorRole: session.role,
      action: "send",
      notes: `Invoice PDF successfully emailed to ${recipientEmail}`,
      newState: { status: invoice.status, sentAt: invoice.sentAt },
    })

    return NextResponse.json({
      success: true,
      message: `Invoice successfully sent to ${recipientEmail}`,
    })
  } catch (error: any) {
    console.error("Send invoice email error:", error)
    return NextResponse.json({ error: error.message || "Failed to send invoice" }, { status: 500 })
  }
}
