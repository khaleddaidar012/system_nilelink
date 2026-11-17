/**
 * One-time cleanup script: Remove phantom "document_rejected" notifications
 * caused by the now-fixed notification query bug (recipientCustomerId without targetAudience filter).
 *
 * Safe to run multiple times (idempotent).
 * Usage: npx tsx scripts/cleanup-phantom-rejection-notifications.ts
 */

import mongoose from "mongoose"
import { connectDB } from "../lib/mongodb"

async function cleanup() {
  await connectDB()
  console.log("Connected to MongoDB.")

  // 1. Remove all staff-targeted upload notifications that leaked into customer feeds.
  // Staff notifications with title "New Documents Awaiting Review" or
  // "Request Document Uploaded" should never be visible to customers.
  const staffResult = await mongoose.model("Notification").deleteMany({
    targetAudience: "staff",
    title: {
      $in: [
        "New Documents Awaiting Review",
        "Request Document Uploaded",
      ],
    },
  })
  console.log(`Deleted ${staffResult.deletedCount} leaked staff notification(s).`)

  // 2. Remove erroneous document_rejected notifications where the actual document
  // still has status "pending_review" — meaning the rejection was phantom, not real.
  const Notification = mongoose.model("Notification")
  const Document = mongoose.model("Document")

  const phantomRejections = await Notification.find({
    type: "document_rejected",
    relatedDocumentId: { $ne: null },
  }).lean() as any[]

  let phantomCount = 0
  for (const notif of phantomRejections) {
    const doc = await Document.findById(notif.relatedDocumentId).lean() as any
    if (doc && doc.status === "pending_review") {
      await Notification.deleteOne({ _id: notif._id })
      phantomCount++
      console.log(`  Deleted phantom rejection for document: "${doc.title}"`)
    }
  }

  console.log(`Deleted ${phantomCount} phantom rejection notification(s).`)
  console.log("Cleanup complete.")
  process.exit(0)
}

cleanup().catch((err) => {
  console.error("Cleanup failed:", err)
  process.exit(1)
})
