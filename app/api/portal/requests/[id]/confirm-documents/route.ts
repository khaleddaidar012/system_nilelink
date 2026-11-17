import { NextRequest, NextResponse } from "next/server"
import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { connectDB } from "@/lib/mongodb"
import { CustomerRequest, Document as DocumentModel, User } from "@/lib/models"
import { usableAccountDocument } from "@/lib/account-documents"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSessionFromRequest(req)
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (getDatabaseProvider() === "d1") return handleD1Workflow({ action: "request-confirm-documents", request: req, id })
  try {
    await connectDB()
    const customerId = session.customerId || (await User.findById(session.userId))?.customerId
    if (!customerId) return NextResponse.json({ error: "Customer not found" }, { status: 403 })
    const request = await CustomerRequest.findOne({ _id: id, customerId })
    if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 })
    if (request.details?.accountDocumentsConfirmedAt) return NextResponse.json({ success: true })
    if (request.status !== "document_required") return NextResponse.json({ error: "Request no longer requires documents" }, { status: 409 })
    const documents = (await DocumentModel.find({ customerId, isArchived: false, entityType: { $ne: "CustomerRequest" } })).filter(usableAccountDocument)
    if (!documents.length) return NextResponse.json({ error: "No valid verified account documents" }, { status: 400 })
    const updated = await CustomerRequest.updateOne({ _id: id, customerId, status: "document_required" }, {
      $set: { status: "document_under_review", "details.accountDocumentIds": documents.map(doc => doc._id.toString()), "details.accountDocumentsConfirmedAt": new Date().toISOString() },
      $push: { timeline: { status: "document_under_review", title: "Account Documents Confirmed", comment: "Customer confirmed use of verified account documents for this request.", updatedBy: session.userId, createdAt: new Date() } },
    })
    if (!updated.modifiedCount) return NextResponse.json({ error: "Request changed; refresh and retry" }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Unable to confirm documents" }, { status: 500 })
  }
}
