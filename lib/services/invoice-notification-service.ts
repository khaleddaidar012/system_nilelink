import { Notification } from "@/lib/models"
import type { IInvoice } from "@/lib/models/Invoice"

export async function notifyInvoiceCreated(invoice: IInvoice, customerName: string, creatorName: string) {
  try {
    await Notification.create({
      targetAudience: "staff",
      title: "New Draft Invoice Awaiting Review",
      message: `Draft invoice ${invoice.invoiceNumber} for ${customerName} was created by ${creatorName} and requires internal review.`,
      channel: "in_app",
      type: "manual_staff_warning",
      severity: "normal",
      relatedInvoiceId: invoice._id,
      actionUrl: `/admin/invoices`,
    })
  } catch (error) {
    console.error("notifyInvoiceCreated error:", error)
  }
}

export async function notifyInvoiceConfirmed(invoice: IInvoice, customerName: string) {
  void customerName
  try {
    await Notification.create({
      targetAudience: "customer",
      recipientCustomerId: invoice.customerId,
      title: "New Commercial Invoice Available",
      message: `Commercial invoice ${invoice.invoiceNumber} for ${invoice.totalAmount.toLocaleString()} ${invoice.currency} is now available in your portal.`,
      channel: "in_app",
      type: "account_status_change",
      severity: "normal",
      relatedInvoiceId: invoice._id,
      actionUrl: `/portal/financials`,
    })
  } catch (error) {
    console.error("notifyInvoiceConfirmed error:", error)
  }
}
