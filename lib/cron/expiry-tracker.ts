import {isAccountDocument,effectiveAccountDocuments,expiryInstant} from "../compliance/account-health"
import {recalculateCustomerAccountStatus} from "../engine/account-health-engine"
import mongoose from "mongoose"
import { connectDB } from "@/lib/mongodb"
import { Document as DocumentModel, Customer, Notification } from "@/lib/models"
import { expiryNotification } from "./expiry-notification"

export interface ExpiryCheckResult {
  totalEvaluated: number; tier30Alerts: number; tier20Alerts: number; tier10Alerts: number; tier5Alerts: number; expiredCount: number; notificationsCreated: number
}

export async function runExpiryEvaluation(): Promise<ExpiryCheckResult> {
  await connectDB()
  const now = new Date(), day = 86400000
  const result: ExpiryCheckResult = { totalEvaluated: 0, tier30Alerts: 0, tier20Alerts: 0, tier10Alerts: 0, tier5Alerts: 0, expiredCount: 0, notificationsCreated: 0 }
  const documents = await DocumentModel.find({ isArchived: false, expiryDate: { $ne: null }, status: { $in: ["approved", "expiring_soon", "expired"] } })
  result.totalEvaluated = documents.length
  const effectiveIds=new Set<string>()
  for(const id of new Set(documents.map(doc=>String(doc.customerId))))for(const doc of effectiveAccountDocuments(documents.filter(d=>String(d.customerId)===id).map(d=>d.toObject())))effectiveIds.add(String(doc._id))
  for (const original of documents.filter(doc=>effectiveIds.has(String(doc._id))&&isAccountDocument(doc.toObject()))) {
    const session = await mongoose.startSession()
    let sentTier: number | null = null
    try {
      await session.withTransaction(async () => {
        sentTier = null
        const doc = await DocumentModel.findById(original._id).session(session)
        if (!doc || doc.isArchived || !["approved", "expiring_soon", "expired"].includes(doc.status) || !doc.expiryDate) return
        const expiry = expiryInstant(doc.toObject())!
        if (!Number.isFinite(expiry)||new Date(expiry).getUTCFullYear()>now.getUTCFullYear()+100) return
        const left = Math.ceil((expiry - now.getTime()) / day)
        const tier = left <= 0 ? 0 : left <= 5 ? 5 : left <= 10 ? 10 : left <= 20 ? 20 : left <= 30 ? 30 : null
        if (doc.status === "expired" && tier !== 0) return
        const customer = await Customer.findById(doc.customerId).session(session)
        if (!customer) return
        const key = String(expiry) + ":" + tier
        const alert = tier !== null && doc.lastExpiryAlertKey !== key
        doc.status = tier === 0 ? "expired" : tier !== null ? "expiring_soon" : "approved"
        doc.warningEscalationTier = tier === 0 ? "expired" : tier === 5 || tier === 10 ? "critical" : tier === 20 ? "urgent" : tier === 30 ? "warning" : "none"
        if (alert) {
          doc.lastExpiryAlertKey = key
          doc.lastNotificationSentAt = now
          const detail = expiryNotification(doc.title, doc.category, customer.companyName, doc.expiryDate, left)
          const base = { ...detail, recipientCustomerId: customer._id, relatedDocumentId: doc._id, channel: "in_app" as const, type: tier === 0 ? "document_expired" as const : "document_expiring_10d" as const, severity: tier === 0 || tier === 5 ? "critical" as const : tier === 10 ? "urgent" as const : tier === 20 ? "warning" as const : "normal" as const }
          await Notification.create([
            { ...base, targetAudience: "customer", actionUrl: "/portal/documents" },
            { ...base, targetAudience: "all_staff", actionUrl: "/admin/customers/" + customer._id },
          ], { session })
          sentTier = tier
        }
        await doc.save({ session })
      })
      if (sentTier !== null) {
        result.notificationsCreated += 2
        if (sentTier === 0) result.expiredCount++
        else result[("tier" + sentTier + "Alerts") as "tier5Alerts" | "tier10Alerts" | "tier20Alerts" | "tier30Alerts"]++
      }
    } finally { await session.endSession() }
  }
  for(const customerId of new Set(documents.map(doc=>String(doc.customerId))))await recalculateCustomerAccountStatus(customerId)
  return result
}
