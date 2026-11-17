import mongoose, { Schema, Document, Model } from "mongoose"

export interface IInvoiceSequence {
  _id: string // Format: "INV_YYYY" e.g. "INV_2026"
  seq: number
  updatedAt?: Date
}

const InvoiceSequenceSchema = new Schema<IInvoiceSequence>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
)

export const InvoiceSequence: Model<IInvoiceSequence> =
  mongoose.models.InvoiceSequence ||
  mongoose.model<IInvoiceSequence>("InvoiceSequence", InvoiceSequenceSchema)

export default InvoiceSequence
