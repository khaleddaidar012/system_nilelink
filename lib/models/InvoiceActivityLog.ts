import mongoose, { Schema, Document as MongooseDoc, Model } from "mongoose"

export type InvoiceAction =
  | "create"
  | "edit"
  | "confirm"
  | "send"
  | "payment_recorded"
  | "status_change"
  | "cancel"
  | "delete"

export interface IInvoiceActivityLog extends MongooseDoc {
  invoiceId: mongoose.Types.ObjectId
  customerId?: mongoose.Types.ObjectId | null
  actorId?: mongoose.Types.ObjectId
  actorName: string
  actorRole: string
  action: InvoiceAction
  previousState?: Record<string, unknown>
  newState?: Record<string, unknown>
  notes?: string
  ipAddress?: string
  createdAt: Date
}

const InvoiceActivityLogSchema = new Schema<IInvoiceActivityLog>(
  {
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
      default: null,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorName: {
      type: String,
      required: true,
      default: "System",
    },
    actorRole: {
      type: String,
      required: true,
      default: "system",
    },
    action: {
      type: String,
      enum: ["create", "edit", "confirm", "send", "payment_recorded", "status_change", "cancel", "delete"],
      required: true,
      index: true,
    },
    previousState: {
      type: Schema.Types.Mixed,
      default: null,
    },
    newState: {
      type: Schema.Types.Mixed,
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

InvoiceActivityLogSchema.index({ invoiceId: 1, createdAt: -1 })
InvoiceActivityLogSchema.index({ customerId: 1, createdAt: -1 })

if (process.env.NODE_ENV !== "production") {
  delete mongoose.models.InvoiceActivityLog
}

export const InvoiceActivityLog: Model<IInvoiceActivityLog> =
  mongoose.models.InvoiceActivityLog ||
  mongoose.model<IInvoiceActivityLog>("InvoiceActivityLog", InvoiceActivityLogSchema)

export default InvoiceActivityLog
