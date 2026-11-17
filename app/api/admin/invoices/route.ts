import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Invoice, Customer, InvoiceActivityLog } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { assertStaffPermission } from "@/lib/auth/require-permission"
import { CreateInvoiceSchema } from "@/lib/validations/invoice-validation"
import { calculateInvoiceTotals } from "@/lib/engine/invoice-calculator"
import { generateNextInvoiceNumber } from "@/lib/services/invoice-number-service"
import { buildInvoiceMongoQuery } from "@/lib/services/invoice-query-builder"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

export async function GET(req: NextRequest) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "invoices-list", request: req })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDB()

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)))
    const skip = (page - 1) * limit

    const search = searchParams.get("search") || undefined
    const status = searchParams.get("status") || undefined
    const documentType = searchParams.get("documentType") || undefined
    const customerId = searchParams.get("customerId") || undefined
    const requestId = searchParams.get("requestId") || undefined
    const currency = searchParams.get("currency") || undefined
    const startDate = searchParams.get("startDate") || undefined
    const endDate = searchParams.get("endDate") || undefined

    const query = buildInvoiceMongoQuery({
      search,
      status,
      documentType,
      customerId,
      requestId,
      currency,
      startDate,
      endDate,
      isCustomerPortal: false,
    })

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customerId", "companyName commercialRegisterNumber contactEmail contactPhone")
        .populate("relatedRequestId", "trackingNumber serviceType status")
        .populate("createdBy", "firstName lastName email")
        .lean(),
      Invoice.countDocuments(query),
    ])

    // Calculate summary metrics across all matching or overall invoices
    const allMatching = await Invoice.find(customerId ? { customerId } : {}).lean()
    const metrics = allMatching.reduce(
      (acc, inv) => {
        if (inv.status === "draft") {
          acc.totalDraftCount += 1
        }
        if (inv.status === "confirmed") {
          acc.totalConfirmedCount += 1
        }
        if (inv.status !== "cancelled") {
          acc.totalInvoicedAmount += inv.totalAmount || 0
          acc.totalPaidAmount += inv.paidAmount || 0
          acc.totalRemainingAmount += inv.remainingAmount || 0
        }
        return acc
      },
      {
        totalDraftCount: 0,
        totalConfirmedCount: 0,
        totalInvoicedAmount: 0,
        totalPaidAmount: 0,
        totalRemainingAmount: 0,
      }
    )

    return NextResponse.json({
      success: true,
      invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      metrics,
    })
  } catch (error: any) {
    console.error("Admin fetch invoices error:", error)
    return NextResponse.json({ error: error.message || "Failed to fetch invoices" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "invoice-create", request: req })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validation = CreateInvoiceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      )
    }

    const data = validation.data

    // Check base invoice creation permission
    const createAuth = await assertStaffPermission(req, "createInvoice")
    if (!createAuth.authorized) return createAuth.response

    // Strict server-side verification: Tax Invoices require dedicated permission
    if (data.documentType === "tax_invoice") {
      const taxAuth = await assertStaffPermission(req, "issueTaxInvoice")
      if (!taxAuth.authorized) return taxAuth.response
    }

    await connectDB()

    // 1. Resolve Customer (Registered or External)
    let customerSnapshot: any = undefined
    let resolvedCustomerId: any = undefined

    if (data.customerId) {
      const customer = (await Customer.findById(data.customerId).lean()) as any
      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 })
      }
      resolvedCustomerId = customer._id
      customerSnapshot = {
        companyName: customer.companyName,
        commercialRegisterNumber: customer.commercialRegisterNumber || "",
        taxCardNumber: customer.taxCardNumber || "",
        address: `${customer.city || ""}, ${customer.country || "Egypt"}`.trim(),
        contactEmail: customer.contactEmail || customer.billingEmail || "",
        contactPhone: customer.phone || "",
      }
    } else if (data.externalCustomer) {
      customerSnapshot = {
        companyName: data.externalCustomer.companyName.trim(),
        commercialRegisterNumber: "",
        taxCardNumber: data.externalCustomer.taxCardNumber?.trim() || "",
        address: data.externalCustomer.address?.trim() || "Egypt",
        contactEmail: data.externalCustomer.contactEmail?.trim() || "",
        contactPhone: data.externalCustomer.contactPhone?.trim() || "",
      }
    }

    // 2. Perform server-side financial calculations
    const calcResult = calculateInvoiceTotals({
      items: data.items,
      taxRate: data.taxRate,
      discount: data.discount,
      additionalCharges: data.additionalCharges,
    })

    if (!calcResult.isValid) {
      return NextResponse.json({ error: "Calculation errors", details: calcResult.errors }, { status: 400 })
    }

    // 3. Atomically generate sequential invoice number
    const issueDateObj = new Date(data.issueDate)
    const invoiceNumber = await generateNextInvoiceNumber({
      year: issueDateObj.getFullYear(),
    })

    // 4. Create Draft Invoice
    const newInvoice = new Invoice({
      customerId: resolvedCustomerId || undefined,
      customerSnapshot,
      invoiceNumber,
      documentType: data.documentType || "statement",
      relatedRequestId: data.relatedRequestId || undefined,
      relatedQuoteId: data.relatedQuoteId || undefined,
      currency: data.currency,
      issueDate: issueDateObj,
      dueDate: new Date(data.dueDate),
      items: calcResult.items,
      subtotal: calcResult.subtotal,
      taxRate: calcResult.taxRate,
      tax: calcResult.tax,
      discount: calcResult.discount,
      additionalCharges: calcResult.additionalCharges,
      totalAmount: calcResult.totalAmount,
      paidAmount: 0,
      remainingAmount: calcResult.totalAmount,
      status: "draft",
      notes: data.notes || "",
      internalNotes: data.internalNotes || "",
      createdBy: session.userId,
    })
    await newInvoice.save()

    // 5. Record activity audit log
    await InvoiceActivityLog.create({
      invoiceId: newInvoice._id,
      customerId: resolvedCustomerId || null,
      actorId: session.userId,
      actorName: `${session.firstName} ${session.lastName}`,
      actorRole: session.role,
      action: "create",
      notes: `Draft invoice ${invoiceNumber} created for ${customerSnapshot?.companyName || "External Client"}.`,
      newState: {
        invoiceNumber,
        status: "draft",
        totalAmount: calcResult.totalAmount,
        itemsCount: calcResult.items.length,
        isExternal: !resolvedCustomerId,
      },
    })

    return NextResponse.json({
      success: true,
      invoice: newInvoice,
    }, { status: 201 })
  } catch (error: any) {
    console.error("Admin create invoice error:", error)
    return NextResponse.json({ error: error.message || "Failed to create invoice" }, { status: 500 })
  }
}
