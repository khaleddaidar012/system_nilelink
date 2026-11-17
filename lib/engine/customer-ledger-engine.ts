import { connectDB } from "@/lib/mongodb"
import { Customer, Invoice, Payment } from "@/lib/models"
import type {
  ICustomerStatement,
  ICustomerLedgerEntry,
  ICustomerStatementSummary,
} from "@/types/customer-statement"
import { getDocumentTitle } from "@/lib/services/document-type-helper"
import mongoose from "mongoose"

export interface ComputeLedgerOptions {
  customerId: string
  fromDate?: string | Date | null
  toDate?: string | Date | null
  filterType?: "all" | "shipments" | "invoices" | "payments"
  currency?: string
  actorSession?: {
    userId: string
    name: string
    email: string
  }
}

export interface ComputeLedgerFromRecordsOptions {
  customer: any
  invoices: any[]
  payments: any[]
  priorInvoices?: any[]
  priorPayments?: any[]
  fromDate?: string | Date | null
  toDate?: string | Date | null
  filterType?: "all" | "shipments" | "invoices" | "payments"
  currency?: string
  actorSession?: {
    userId: string
    name: string
    email: string
  }
}

export function computeLedgerFromRecords(
  options: ComputeLedgerFromRecordsOptions
): ICustomerStatement {
  const {
    customer,
    invoices,
    payments,
    priorInvoices: explicitPriorInvoices,
    priorPayments: explicitPriorPayments,
    fromDate,
    toDate,
    filterType = "all",
    currency = "EGP",
    actorSession,
  } = options

  // Parse boundary dates
  let fromDateObj: Date | null = null
  let toDateObj: Date | null = null

  if (fromDate) {
    const parsed = new Date(fromDate)
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(0, 0, 0, 0)
      fromDateObj = parsed
    }
  }

  if (toDate) {
    const parsed = new Date(toDate)
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999)
      toDateObj = parsed
    }
  }

  // 1. Calculate Opening Balance prior to fromDateObj
  let openingBalance = 0
  if (fromDateObj) {
    const priorInvs = explicitPriorInvoices || invoices.filter((inv) => {
      const d = new Date(inv.issueDate || inv.createdAt)
      return inv.status !== "draft" && inv.status !== "cancelled" && d < fromDateObj!
    })

    const priorPays = explicitPriorPayments || payments.filter((pay) => {
      const d = new Date(pay.paymentDate || pay.createdAt)
      return pay.status !== "cancelled" && d < fromDateObj!
    })

    const priorDebit = priorInvs.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0)
    const priorCredit = priorPays.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0)
    openingBalance = Math.round((priorDebit - priorCredit) * 100) / 100
  }

  // Filter in-period records if not already segregated
  const inPeriodInvoices = explicitPriorInvoices
    ? invoices
    : invoices.filter((inv) => {
        if (inv.status === "draft" || inv.status === "cancelled") return false
        const d = new Date(inv.issueDate || inv.createdAt)
        if (fromDateObj && d < fromDateObj) return false
        if (toDateObj && d > toDateObj) return false
        return true
      })

  const inPeriodPayments = explicitPriorPayments
    ? payments
    : payments.filter((pay) => {
        if (pay.status === "cancelled") return false
        const d = new Date(pay.paymentDate || pay.createdAt)
        if (fromDateObj && d < fromDateObj) return false
        if (toDateObj && d > toDateObj) return false
        return true
      })

  // 2. Map records into unified ledger entries
  const rawEntries: ICustomerLedgerEntry[] = []

  // Add Invoices as Debits
  for (const inv of inPeriodInvoices) {
    const trackingNo =
      inv.shipmentSnapshot?.trackingNumber ||
      inv.relatedRequestId?.trackingNumber ||
      undefined

    const docTypeLabel = getDocumentTitle(inv.documentType, true)
    const desc = trackingNo
      ? `${docTypeLabel} - شحنة (${trackingNo})`
      : `${docTypeLabel} - خدمات لوجستية`

    rawEntries.push({
      id: (inv._id || inv.id || "").toString(),
      date: new Date(inv.issueDate || inv.createdAt).toISOString(),
      type: "invoice",
      description: desc,
      reference: inv.invoiceNumber,
      relatedShipmentTracking: trackingNo,
      relatedInvoiceNumber: inv.invoiceNumber,
      debit: Number(inv.totalAmount || 0),
      credit: 0,
      balance: 0, // Calculated after sort
      currency: inv.currency || currency,
      status: inv.status,
      notes: inv.notes,
    })
  }

  // Add Payments as Credits
  for (const pay of inPeriodPayments) {
    const linkedInvoiceNumber = pay.invoiceId?.invoiceNumber || pay.relatedInvoiceNumber || undefined
    const methodLabels: Record<string, string> = {
      bank_transfer: "تحويل بنكي",
      credit_card: "بطاقة ائتمان",
      cash: "نقدي",
      cheque: "شيك بنكي",
      other: "سداد",
    }
    const methodStr = methodLabels[pay.paymentMethod || pay.method] || "سداد"
    const desc = linkedInvoiceNumber
      ? `سداد دفعة نقدية (${methodStr}) للفاتورة ${linkedInvoiceNumber}`
      : `سداد دفعة نقدية (${methodStr})`

    rawEntries.push({
      id: (pay._id || pay.id || "").toString(),
      date: new Date(pay.paymentDate || pay.createdAt).toISOString(),
      type: "payment",
      description: desc,
      reference: pay.referenceNumber || linkedInvoiceNumber || "PAY-REF",
      relatedInvoiceNumber: linkedInvoiceNumber,
      debit: 0,
      credit: Number(pay.amount || 0),
      balance: 0, // Calculated after sort
      currency: pay.currency || currency,
      notes: pay.notes,
    })
  }

  // 3. Chronological sort (ascending)
  rawEntries.sort((a, b) => {
    const timeA = new Date(a.date).getTime()
    const timeB = new Date(b.date).getTime()
    if (timeA === timeB) {
      // Invoices precede payments on same exact timestamp
      return a.type === "invoice" ? -1 : 1
    }
    return timeA - timeB
  })

  // 4. Compute running balance across all chronological entries
  let running = openingBalance
  for (const entry of rawEntries) {
    running = Math.round((running + entry.debit - entry.credit) * 100) / 100
    entry.balance = running
  }

  // 5. Apply category filtering if requested
  let filteredEntries = rawEntries
  if (filterType === "shipments") {
    filteredEntries = rawEntries.filter((e) => Boolean(e.relatedShipmentTracking))
  } else if (filterType === "invoices") {
    filteredEntries = rawEntries.filter((e) => e.type === "invoice")
  } else if (filterType === "payments") {
    filteredEntries = rawEntries.filter((e) => e.type === "payment")
  }

  const totalDebit = rawEntries.reduce((sum, e) => sum + e.debit, 0)
  const totalCredit = rawEntries.reduce((sum, e) => sum + e.credit, 0)
  const closingBalance = Math.round((openingBalance + totalDebit - totalCredit) * 100) / 100

  const summary: ICustomerStatementSummary = {
    openingBalance,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    closingBalance,
    currency,
    periodStart: fromDateObj ? fromDateObj.toISOString().split("T")[0] : undefined,
    periodEnd: toDateObj ? toDateObj.toISOString().split("T")[0] : undefined,
    totalTransactions: filteredEntries.length,
  }

  const customerIdStr = (customer._id || customer.id || "").toString()

  return {
    customer: {
      id: customerIdStr,
      companyName: customer.companyName,
      commercialRegisterNumber: customer.commercialRegisterNumber,
      taxCardNumber: customer.taxCardNumber,
      contactEmail: customer.contactEmail,
      contactPhone: customer.contactPhone,
      address: customer.address,
      city: customer.city,
      country: customer.country,
    },
    period: {
      from: fromDateObj ? fromDateObj.toISOString().split("T")[0] : undefined,
      to: toDateObj ? toDateObj.toISOString().split("T")[0] : undefined,
    },
    generatedAt: new Date().toISOString(),
    generatedBy: {
      id: actorSession?.userId || "system",
      name: actorSession?.name || "Nile Link Finance Department",
      email: actorSession?.email || "finance@nilelinklogistics.com",
    },
    summary,
    entries: filteredEntries,
  }
}

export async function generateCustomerLedger(
  options: ComputeLedgerOptions
): Promise<ICustomerStatement> {
  await connectDB()

  const { customerId, fromDate, toDate, filterType = "all", currency = "EGP", actorSession } = options

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new Error("Invalid Customer ID")
  }

  const customer = await Customer.findById(customerId).lean() as any
  if (!customer) {
    throw new Error("Customer not found")
  }

  // Parse boundary dates
  let fromDateObj: Date | null = null
  let toDateObj: Date | null = null

  if (fromDate) {
    const parsed = new Date(fromDate)
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(0, 0, 0, 0)
      fromDateObj = parsed
    }
  }

  if (toDate) {
    const parsed = new Date(toDate)
    if (!isNaN(parsed.getTime())) {
      parsed.setHours(23, 59, 59, 999)
      toDateObj = parsed
    }
  }

  // 1. Calculate Opening Balance prior to fromDateObj
  let priorInvoices: any[] = []
  let priorPayments: any[] = []

  if (fromDateObj) {
    const [pInvs, pPays] = await Promise.all([
      Invoice.find({
        customerId,
        status: { $nin: ["draft", "cancelled"] },
        issueDate: { $lt: fromDateObj },
      })
        .select("totalAmount issueDate createdAt")
        .lean(),
      Payment.find({
        customerId,
        paymentDate: { $lt: fromDateObj },
      })
        .select("amount paymentDate createdAt")
        .lean(),
    ])
    priorInvoices = pInvs
    priorPayments = pPays
  }

  // 2. Query in-period Invoices
  const invoiceDateFilter: Record<string, any> = {}
  if (fromDateObj && toDateObj) {
    invoiceDateFilter.$gte = fromDateObj
    invoiceDateFilter.$lte = toDateObj
  } else if (fromDateObj) {
    invoiceDateFilter.$gte = fromDateObj
  } else if (toDateObj) {
    invoiceDateFilter.$lte = toDateObj
  }

  const invoiceQuery: Record<string, any> = {
    customerId,
    status: { $nin: ["draft", "cancelled"] },
  }
  if (Object.keys(invoiceDateFilter).length > 0) {
    invoiceQuery.issueDate = invoiceDateFilter
  }

  // 3. Query in-period Payments
  const paymentDateFilter: Record<string, any> = {}
  if (fromDateObj && toDateObj) {
    paymentDateFilter.$gte = fromDateObj
    paymentDateFilter.$lte = toDateObj
  } else if (fromDateObj) {
    paymentDateFilter.$gte = fromDateObj
  } else if (toDateObj) {
    paymentDateFilter.$lte = toDateObj
  }

  const paymentQuery: Record<string, any> = { customerId }
  if (Object.keys(paymentDateFilter).length > 0) {
    paymentQuery.paymentDate = paymentDateFilter
  }

  const [invoices, payments] = await Promise.all([
    Invoice.find(invoiceQuery)
      .populate("relatedRequestId", "trackingNumber serviceType")
      .lean(),
    Payment.find(paymentQuery)
      .populate("invoiceId", "invoiceNumber")
      .lean(),
  ])

  return computeLedgerFromRecords({
    customer,
    invoices,
    payments,
    priorInvoices,
    priorPayments,
    fromDate,
    toDate,
    filterType,
    currency,
    actorSession,
  })
}
