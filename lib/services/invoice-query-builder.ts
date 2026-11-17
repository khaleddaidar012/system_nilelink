
export function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
}

export interface InvoiceFilterParams {
  search?: string
  status?: string
  documentType?: string
  customerId?: string
  requestId?: string
  currency?: string
  startDate?: string
  endDate?: string
  isCustomerPortal?: boolean
}

export function buildInvoiceMongoQuery(params: InvoiceFilterParams): Record<string, any> {
  const query: Record<string, any> = {}

  // 1. Customer Portal Draft Guard
  if (params.isCustomerPortal) {
    query.status = { $ne: "draft" }
  }

  // 2. Customer ID Filter
  if (params.customerId) {
    query.customerId = params.customerId
  }

  // 3. Request / Shipment ID Filter
  if (params.requestId) {
    query.relatedRequestId = params.requestId
  }

  // 4. Currency
  if (params.currency && params.currency !== "all") {
    query.currency = params.currency
  }

  // 4b. Document Type Filter
  if (params.documentType && params.documentType !== "all") {
    query.documentType = params.documentType
  }

  // 5. Status Filter
  if (params.status && params.status !== "all") {
    if (params.status === "unpaid") {
      query.status = { $in: ["confirmed", "sent", "partially_paid", "overdue"] }
    } else {
      query.status = params.status
    }
  }

  // 6. Date Range Filtering
  if (params.startDate || params.endDate) {
    const dateQuery: Record<string, any> = {}
    if (params.startDate) {
      dateQuery.$gte = new Date(params.startDate)
    }
    if (params.endDate) {
      const end = new Date(params.endDate)
      end.setHours(23, 59, 59, 999)
      dateQuery.$lte = end
    }
    query.issueDate = dateQuery
  }

  // 7. Text Search across invoiceNumber, customer company name, and tracking number
  if (params.search && params.search.trim().length > 0) {
    const cleanSearch = escapeRegex(params.search.trim())
    const searchRegex = new RegExp(cleanSearch, "i")

    query.$or = [
      { invoiceNumber: searchRegex },
      { "customerSnapshot.companyName": searchRegex },
      { "shipmentSnapshot.trackingNumber": searchRegex },
    ]
  }

  return query
}
