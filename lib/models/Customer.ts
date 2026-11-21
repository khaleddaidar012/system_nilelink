import mongoose, { Schema, Document, Model } from "mongoose"

export type AccountStatus = "active" | "warning" | "inactive" | "under_review" | "unverified"

export interface ICustomer extends Document {
  companyName: string
  commercialRegisterNumber: string
  taxCardNumber: string
  industry?: string
  country: string
  city?: string
  address?: string
  contactPhone: string
  contactEmail: string
  administrativeHold?: boolean
  accountStatusSource?: "documents" | "administrative"
  accountStatus: AccountStatus
  statusReason?: string
  assignedStaffId?: mongoose.Types.ObjectId
  maxAllowedDocuments: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const CustomerSchema = new Schema<ICustomer>(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    commercialRegisterNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    taxCardNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    industry: {
      type: String,
      default: "Logistics & Trade",
    },
    country: {
      type: String,
      default: "Egypt",
    },
    city: {
      type: String,
      default: "Cairo",
    },
    address: {
      type: String,
      default: "",
    },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },
    contactEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    administrativeHold:{type:Boolean,default:false},
    accountStatusSource:{type:String,enum:["documents","administrative"],default:undefined},
    accountStatus: {
      type: String,
      enum: ["active", "warning", "inactive", "under_review", "unverified"],
      default: "unverified",
      index: true,
    },
    statusReason: {
      type: String,
      default: "Account is not verified yet. Please upload required documents to begin verification.",
    },
    assignedStaffId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    maxAllowedDocuments: {
      type: Number,
      default: 20,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
)

if (mongoose.models && mongoose.models.Customer) {
  delete (mongoose.models as Record<string, unknown>).Customer
}

export const Customer: Model<ICustomer> =
  mongoose.models.Customer || mongoose.model<ICustomer>("Customer", CustomerSchema)
export default Customer

