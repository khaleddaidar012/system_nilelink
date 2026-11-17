import mongoose from "mongoose"
import { Customer, Document as DocumentModel } from "@/lib/models"
import { logDocumentActivity } from "@/lib/services/activity-log-service"

export async function recalculateCustomerAccountStatus(
  customerId?: string | mongoose.Types.ObjectId | null,
  triggerActorId?: string | mongoose.Types.ObjectId | null
): Promise<{ status: "active" | "warning" | "inactive" | "under_review" | "unverified"; reason: string }> {
  if (!customerId || !mongoose.Types.ObjectId.isValid(customerId.toString())) {
    return { status: "inactive", reason: "Valid customer ID required" }
  }

  const customer = await Customer.findById(customerId)
  if (!customer) {
    return { status: "inactive", reason: "Customer record not found" }
  }

  const activeDocuments = await DocumentModel.find({
    customerId: customer._id,
    isArchived: false,
    entityType: { $ne: "CustomerRequest" },
  })

  const now = new Date()
  let hasExpired = false
  let hasRejected = false
  let hasExpiringSoon = false
  let expiredDocTitle = ""
  let expiringSoonDocTitle = ""
  let daysUntilExpiryMin = 9999

  for (const doc of activeDocuments) {
    if (doc.status === "rejected") {
      hasRejected = true
      expiredDocTitle = doc.title
    }

    if (doc.status === "expired") {
      hasExpired = true
      expiredDocTitle = doc.title
    }

    if (doc.expiryDate) {
      const diffTime = new Date(doc.expiryDate).getTime() - now.getTime()
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      if (daysLeft < 0) {
        hasExpired = true
        expiredDocTitle = doc.title
      } else if (daysLeft <= 10) {
        hasExpiringSoon = true
        if (daysLeft < daysUntilExpiryMin) {
          daysUntilExpiryMin = daysLeft
          expiringSoonDocTitle = doc.title
        }
      }
    }
  }

  let newStatus: "active" | "warning" | "inactive" | "under_review" | "unverified" = "active"
  let newReason = "All company documents are verified and up to date."

  if (activeDocuments.length === 0 && customer.accountStatus !== "active") {
    newStatus = "unverified"
    newReason = "Account is not verified yet. Please upload required documents to begin verification."
  } else if (hasExpired || hasRejected) {
    newStatus = "inactive"
    newReason = hasExpired
      ? `Mandatory document (${expiredDocTitle}) has expired.`
      : `Mandatory document (${expiredDocTitle}) was rejected.`
  } else if (hasExpiringSoon) {
    newStatus = "warning"
    newReason = `${expiringSoonDocTitle} will expire in ${daysUntilExpiryMin} days.`
  } else {
    const hasPending = activeDocuments.some((d) => d.status === "pending_review" || !d.status)
    if (hasPending && customer.accountStatus !== "active") {
      newStatus = "under_review"
      newReason = "Documents submitted and currently under review by compliance team."
    } else {
      newStatus = "active"
      newReason = "All company documents are verified and up to date."
    }
  }

  const previousStatus = customer.accountStatus
  if (previousStatus !== newStatus || customer.statusReason !== newReason) {
    customer.accountStatus = newStatus
    customer.statusReason = newReason
    await customer.save()

    try {
      if (activeDocuments[0]?._id) {
        await logDocumentActivity({
          documentId: activeDocuments[0]._id,
          customerId: customer._id,
          actorId: triggerActorId || null,
          actorType: triggerActorId ? "staff" : "system",
          action: "status_transition",
          previousState: { accountStatus: previousStatus },
          newState: { accountStatus: newStatus, reason: newReason },
          notes: `Automated Account Health recalculated: ${previousStatus} -> ${newStatus}`,
        })
      }
    } catch (logErr) {
      console.warn("Could not log status transition activity:", logErr)
    }
  }

  return { status: newStatus, reason: newReason }
}
