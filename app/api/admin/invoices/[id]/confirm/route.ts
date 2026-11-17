import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Invoice, Customer, CustomerRequest, InvoiceActivityLog } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { notifyInvoiceConfirmed } from "@/lib/services/invoice-notification-service"
import mongoose from "mongoose"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "invoice-confirm", request: req, id: (await params).id })
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Invoice ID" }, { status: 400 })
    }

    await connectDB()

    const invoice = await Invoice.findById(id)
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // STRICT GATE: Only drafts can be confirmed
    if (invoice.status !== "draft") {
      return NextResponse.json(
        { error: `Invoice is already in '${invoice.status}' status and cannot be re-confirmed.` },
        { status: 400 }
      )
    }

    // Fetch customer data for snapshot if registered customer, otherwise preserve external customer snapshot
    let customerSnapshot = invoice.customerSnapshot
    let companyNameForNotify = invoice.customerSnapshot?.companyName || "External Client"

    if (invoice.customerId) {
      const customer = (await Customer.findById(invoice.customerId).lean()) as any
      if (!customer) {
        return NextResponse.json({ error: "Associated customer not found" }, { status: 400 })
      }
      companyNameForNotify = customer.companyName
      customerSnapshot = {
        companyName: customer.companyName,
        commercialRegisterNumber: customer.commercialRegisterNumber || "",
        taxCardNumber: customer.taxCardNumber || "",
        address: customer.address || "",
        city: customer.city || "Cairo",
        country: customer.country || "Egypt",
        contactPhone: customer.contactPhone || "",
        contactEmail: customer.contactEmail || "",
      }
    } else if (!customerSnapshot || !customerSnapshot.companyName) {
      return NextResponse.json({ error: "Customer details missing on invoice" }, { status: 400 })
    }

    // Fetch shipment data for snapshot if bound
    let shipmentSnapshot = undefined
    if (invoice.relatedRequestId) {
      const request = await CustomerRequest.findById(invoice.relatedRequestId).lean() as any
      if (request) {
        shipmentSnapshot = {
          requestId: request._id.toString(),
          trackingNumber: request.trackingNumber,
          serviceType: request.serviceType || "Freight Logistics",
          complianceType: request.complianceType || null,
          complianceNumber: request.complianceNumber || "",
          origin: request.details?.originPort || request.details?.pickupAddress || "",
          destination: request.details?.destinationPort || request.details?.deliveryAddress || "",
        }
      }
    }

    const issuerSnapshot = {
      legalName: "Nile Link Logistics S.A.E",
      address: "Awal Tareeq Al-Anania - Opposite the Ice Factory, Damietta, Egypt",
      taxId: "",
      phone: "01000018549",
      email: "info@nilelinklogistics.com",
      bankName: "Commercial International Bank (CIB)",
      bankAccountName: "Nile Link Logistics SAE",
      bankIban: "EG3800100000000001234567890",
      bankSwift: "CIBEEGCX",
    }

    // Update Invoice atomically
    invoice.status = "confirmed"
    invoice.confirmedBy = session.userId as any
    invoice.confirmedAt = new Date()
    invoice.customerSnapshot = customerSnapshot
    invoice.shipmentSnapshot = shipmentSnapshot
    invoice.issuerSnapshot = issuerSnapshot

    await invoice.save()

    // Record audit event
    await InvoiceActivityLog.create({
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      actorId: session.userId,
      actorName: `${session.firstName} ${session.lastName}`,
      actorRole: session.role,
      action: "confirm",
      notes: "Invoice reviewed and officially confirmed for billing.",
      newState: { status: "confirmed", confirmedAt: invoice.confirmedAt },
    })

    // Dispatch customer notification if customer has an in-app portal account
    if (invoice.customerId) {
      await notifyInvoiceConfirmed(invoice, companyNameForNotify)
    }

    return NextResponse.json({
      success: true,
      invoice,
    })
  } catch (error: any) {
    console.error("Confirm invoice error:", error)
    return NextResponse.json({ error: error.message || "Failed to confirm invoice" }, { status: 500 })
  }
}
