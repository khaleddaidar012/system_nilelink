import { z } from "zod"

export const InvoiceItemSchema = z.object({
  description: z.string().min(1, "Description is required").max(500),
  quantity: z.number().positive("Quantity must be greater than zero"),
  unitPrice: z.number().nonnegative("Unit price cannot be negative"),
})

export const ExternalCustomerSchema = z.object({
  companyName: z.string().min(1, "Client or company name is required").max(200),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(50).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  taxCardNumber: z.string().max(100).optional().or(z.literal("")),
})

export const CreateInvoiceSchema = z
  .object({
    customerId: z.string().min(24).optional().nullable(),
    externalCustomer: ExternalCustomerSchema.optional().nullable(),
    relatedRequestId: z.string().optional().nullable(),
    relatedQuoteId: z.string().optional().nullable(),
    currency: z.enum(["EGP", "USD", "EUR"]).default("EGP"),
    documentType: z.enum(["statement", "invoice", "tax_invoice"]).default("statement"),
    issueDate: z.string(),
    dueDate: z.string(),
    taxRate: z.number().min(0).max(100).default(14),
    discount: z.number().min(0).default(0),
    additionalCharges: z.number().min(0).default(0),
    notes: z.string().max(2000).optional().default(""),
    internalNotes: z.string().max(2000).optional().default(""),
    items: z.array(InvoiceItemSchema).min(1, "At least one line item is required"),
  })
  .refine(
    (data) =>
      Boolean(data.customerId) ||
      Boolean(data.externalCustomer && data.externalCustomer.companyName?.trim()),
    {
      message: "Please select a registered customer or provide an external client name",
      path: ["customerId"],
    }
  )

export const UpdateInvoiceSchema = z.object({
  customerId: z.string().min(24).optional().nullable(),
  externalCustomer: ExternalCustomerSchema.optional().nullable(),
  relatedRequestId: z.string().optional().nullable(),
  relatedQuoteId: z.string().optional().nullable(),
  currency: z.enum(["EGP", "USD", "EUR"]).optional(),
  documentType: z.enum(["statement", "invoice", "tax_invoice"]).optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  discount: z.number().min(0).optional(),
  additionalCharges: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
  internalNotes: z.string().max(2000).optional(),
  items: z.array(InvoiceItemSchema).min(1).optional(),
})
