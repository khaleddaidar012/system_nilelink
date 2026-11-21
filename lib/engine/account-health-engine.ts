import {accountHealth} from "../compliance/account-health"
import {SystemSetting} from "@/lib/models"
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

  const settings=await SystemSetting.findOne({settingKey:"global_system_settings"}).lean() as any
  const health=accountHealth(activeDocuments.map(doc=>doc.toObject()),customer.toObject(),Date.now(),settings?.documentCategories?.filter((c:any)=>c.isMandatory&&c.isActive!==false).map((c:any)=>c.key))
  const newStatus=health.status,newReason=health.reason
  const previousStatus = customer.accountStatus
  if (previousStatus !== newStatus || customer.statusReason !== newReason) {
    customer.accountStatus = newStatus
    customer.statusReason = newReason
    customer.set("accountStatusSource",health.source)
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
