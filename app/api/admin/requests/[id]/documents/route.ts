import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { Document as DocumentModel, CustomerRequest } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import mongoose from "mongoose"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Forbidden: Staff access required" }, { status: 403 })
    }

    const resolvedParams = await params
    const id = resolvedParams.id

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid Request ID" }, { status: 400 })
    }

    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "admin-request-documents", request: req, id: id })
    }

    await connectDB()

    const parent = await CustomerRequest.findById(id)
    if (!parent) return NextResponse.json({ error: "Request not found" }, { status: 404 })
    const documents = await DocumentModel.find({
      customerId: parent.customerId,
      $or: [{ entityId: id, entityType: "CustomerRequest" }, { _id: { $in: parent.details?.accountDocumentIds || [] } }],
      isArchived: false,
    }).sort({ createdAt: -1 }).lean()

    return NextResponse.json({
      success: true,
      documents: documents.map((doc: any) => ({
        id: doc._id.toString(),
        title: doc.title,
        category: doc.category,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        status: doc.status,
        createdAt: doc.createdAt,
      })),
    })
  } catch (error: unknown) {
    console.error("Fetch request documents error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
