import mongoose, { Schema, Document as MongooseDoc, Model } from "mongoose"
import crypto from "crypto"

export type InvoiceStatus =
  | "draft"
  | "confirmed"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled"

export type FinancialDocumentType = "statement" | "invoice" | "tax_invoice"

export interface IInvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface ICustomerSnapshot {
  companyName: string
  commercialRegisterNumber: string
  taxCardNumber: string
  address: string
  city: string
  country: string
  contactPhone: string
  contactEmail: string
}

export interface IShipmentSnapshot {
  requestId: string
  trackingNumber: string
  serviceType: string
  origin?: string
  destination?: string
  complianceType?: "ACID" | "UCR" | null
  complianceNumber?: string
}

export interface IIssuerSnapshot {
  legalName: string
  address: string
  taxId: string
  phone: string
  email: string
  bankName?: string
  bankAccountName?: string
  bankIban?: string
  bankSwift?: string
}

export interface IInvoice extends MongooseDoc {
  referenceNumber?: string
  customerCode?: string
  groups?: import("../shipments/accounting").InvoiceGroup[]
  customerId?: mongoose.Types.ObjectId
  invoiceNumber: string
  relatedQuoteId?: mongoose.Types.ObjectId
  relatedRequestId?: mongoose.Types.ObjectId
  
  // Amounts
  subtotal: number
  taxRate: number
  tax: number
  discount: number
  additionalCharges: number
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  currency: string
  
  items: IInvoiceItem[]
  
  status: InvoiceStatus
  documentType?: FinancialDocumentType
  issueDate: Date
  dueDate: Date
  
  notes?: string
  internalNotes?: string
  token: string // Secure public URL token
  pdfUrl?: string

  // Immutable Snapshots
  customerSnapshot?: ICustomerSnapshot
  shipmentSnapshot?: IShipmentSnapshot
  issuerSnapshot?: IIssuerSnapshot

  // Personnel Tracking
  createdBy?: mongoose.Types.ObjectId
  updatedBy?: mongoose.Types.ObjectId
  confirmedBy?: mongoose.Types.ObjectId
  confirmedAt?: Date
  sentBy?: mongoose.Types.ObjectId
  sentAt?: Date
  recipientEmail?: string
  
  createdAt: Date
  updatedAt: Date
}

const InvoiceItemSchema = new Schema<IInvoiceItem>({
  description: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  unitPrice: { type: Number, required: true },
  total: { type: Number, required: true },
}, { _id: false })

const CustomerSnapshotSchema = new Schema<ICustomerSnapshot>({
  companyName: { type: String, required: true },
  commercialRegisterNumber: { type: String, default: "" },
  taxCardNumber: { type: String, default: "" },
  address: { type: String, default: "" },
  city: { type: String, default: "" },
  country: { type: String, default: "Egypt" },
  contactPhone: { type: String, default: "" },
  contactEmail: { type: String, default: "" },
}, { _id: false })

const ShipmentSnapshotSchema = new Schema<IShipmentSnapshot>({
  requestId: { type: String, required: true },
  trackingNumber: { type: String, required: true },
  serviceType: { type: String, default: "Freight Logistics" },
  origin: { type: String, default: "" },
  destination: { type: String, default: "" },
  complianceType: { type: String, default: null },
  complianceNumber: { type: String, default: "" },
}, { _id: false })

const IssuerSnapshotSchema = new Schema<IIssuerSnapshot>({
  legalName: { type: String, required: true },
  address: { type: String, required: true },
  taxId: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  bankName: { type: String, default: "" },
  bankAccountName: { type: String, default: "" },
  bankIban: { type: String, default: "" },
  bankSwift: { type: String, default: "" },
}, { _id: false })

const InvoiceSchema = new Schema<IInvoice>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
      default: null,
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    relatedQuoteId: {
      type: Schema.Types.ObjectId,
      ref: "Quote",
      default: null,
    },
    relatedRequestId: {
      type: Schema.Types.ObjectId,
      ref: "CustomerRequest",
      default: null,
      index: true,
    },
    
    // Financials
    subtotal: { type: Number, required: true, default: 0 },
    taxRate: { type: Number, required: true, default: 14 },
    tax: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    additionalCharges: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, required: true, default: 0 },
    remainingAmount: { type: Number, required: true },
    currency: { type: String, default: "EGP" },
    
    items: { type: [InvoiceItemSchema], default: [] },
    
    status: {
      type: String,
      enum: ["draft", "confirmed", "sent", "partially_paid", "paid", "overdue", "cancelled"],
      default: "draft",
      index: true,
    },
    documentType: {
      type: String,
      enum: ["statement", "invoice", "tax_invoice"],
      default: "statement",
      index: true,
    },
    issueDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    
    notes: { type: String, default: "" },
    internalNotes: { type: String, default: "" },
    token: { 
      type: String, 
      required: true, 
      unique: true, 
      default: () => crypto.randomUUID(),
      index: true
    },
    pdfUrl: { type: String, default: null },

    // Snapshots
    customerSnapshot: { type: CustomerSnapshotSchema, default: null },
    shipmentSnapshot: { type: ShipmentSnapshotSchema, default: null },
    issuerSnapshot: { type: IssuerSnapshotSchema, default: null },

    // Personnel Tracking
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    confirmedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    confirmedAt: { type: Date, default: null },
    sentBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sentAt: { type: Date, default: null },
    recipientEmail: { type: String, default: null },
  },
  {
    timestamps: true,
  }
)

// Pre-save hook to calculate remaining amount
InvoiceSchema.pre("save", async function() {
  this.remainingAmount = Math.max(0, this.totalAmount - this.paidAmount)
  
  // Auto-update status based on payments (if not cancelled/draft)
  if (this.status !== "cancelled" && this.status !== "draft") {
    if (this.remainingAmount <= 0) {
      this.status = "paid"
    } else if (this.paidAmount > 0 && this.remainingAmount > 0) {
      this.status = "partially_paid"
    } else if (this.dueDate && new Date(this.dueDate) < new Date() && this.status !== "paid") {
      this.status = "overdue"
    }
  }
})

InvoiceSchema.index({ customerId: 1, status: 1, createdAt: -1 })
InvoiceSchema.index({ customerId: 1, issueDate: 1, status: 1 })
InvoiceSchema.index({ status: 1, issueDate: -1 })

if (process.env.NODE_ENV !== "production") {
  delete mongoose.models.Invoice
}

export const Invoice: Model<IInvoice> =
  mongoose.models.Invoice || mongoose.model<IInvoice>("Invoice", InvoiceSchema)
export default Invoice
