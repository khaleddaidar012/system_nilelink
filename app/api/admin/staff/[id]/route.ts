import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1AccountAction } from "@/lib/accounts/d1-handlers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { connectDB } from "@/lib/mongodb"
import { User } from "@/lib/models/User"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { hashPassword } from "@/lib/auth/password"
import { sanitizeStaffPermissions } from "@/lib/auth/staff-categories"

const updateStaffSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  phone: z.string().min(6).optional(),
  status: z.enum(["active", "suspended", "inactive"]).optional(),
  password: z.string().min(8).optional(),
  staffPermissions: z
    .object({
      canAccessAccounts: z.boolean().optional(),
      staffCategory: z.enum(["operations", "accounts"]).optional(),
      canMarkReadyForAccounts: z.boolean().optional(),
      canViewShipmentData: z.boolean().optional(),
      canSendAlerts: z.boolean().optional(),
      canReviewDocuments: z.boolean().optional(),
      canManageCustomers: z.boolean().optional(),
      canUseTieredPricing: z.boolean().optional(),
      issueTaxInvoice: z.boolean().optional(),
      createInvoice: z.boolean().optional(),
      editInvoice: z.boolean().optional(),
      viewCustomerStatements: z.boolean().optional(),
      exportCustomerStatements: z.boolean().optional(),
      sendFinancialDocuments: z.boolean().optional(),
    })
    .optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || session.role !== "super_admin") {
      return NextResponse.json(
        { error: "Access denied. Only managers can update employee permissions." },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await req.json()
    const parsed = updateStaffSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      )
    }

    if (getDatabaseProvider() === "d1") {
      return handleD1AccountAction({ action: "staff-update", request: req, input: parsed.data, id: id })
    }

    await connectDB()

    const targetStaff = await User.findById(id)
    if (!targetStaff) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    // Prevent manager from suspending or demoting themselves
    if (targetStaff._id.toString() === session.userId && parsed.data.status === "suspended") {
      return NextResponse.json(
        { error: "You cannot suspend your own manager account." },
        { status: 400 }
      )
    }

    if (parsed.data.firstName) targetStaff.firstName = parsed.data.firstName
    if (parsed.data.lastName) targetStaff.lastName = parsed.data.lastName
    if (parsed.data.phone) targetStaff.phone = parsed.data.phone
    if (parsed.data.status) targetStaff.status = parsed.data.status

    if (parsed.data.password) {
      targetStaff.passwordHash = await hashPassword(parsed.data.password)
    }

    if (parsed.data.staffPermissions) {
      targetStaff.staffPermissions = {
        canUseTieredPricing: parsed.data.staffPermissions.canUseTieredPricing ?? targetStaff.staffPermissions?.canUseTieredPricing ?? false,
        staffCategory: parsed.data.staffPermissions.staffCategory ?? targetStaff.staffPermissions?.staffCategory,
        canMarkReadyForAccounts: parsed.data.staffPermissions.canMarkReadyForAccounts ?? targetStaff.staffPermissions?.canMarkReadyForAccounts,
        canAccessAccounts: parsed.data.staffPermissions.canAccessAccounts ?? targetStaff.staffPermissions?.canAccessAccounts,
        canViewShipmentData: parsed.data.staffPermissions.canViewShipmentData ?? targetStaff.staffPermissions?.canViewShipmentData,
        canSendAlerts:
          parsed.data.staffPermissions.canSendAlerts ?? targetStaff.staffPermissions?.canSendAlerts ?? true,
        canReviewDocuments:
          parsed.data.staffPermissions.canReviewDocuments ?? targetStaff.staffPermissions?.canReviewDocuments ?? true,
        canManageCustomers:
          parsed.data.staffPermissions.canManageCustomers ?? targetStaff.staffPermissions?.canManageCustomers ?? false,
        issueTaxInvoice:
          parsed.data.staffPermissions.issueTaxInvoice ?? targetStaff.staffPermissions?.issueTaxInvoice ?? false,
        createInvoice:
          parsed.data.staffPermissions.createInvoice ?? targetStaff.staffPermissions?.createInvoice ?? true,
        editInvoice:
          parsed.data.staffPermissions.editInvoice ?? targetStaff.staffPermissions?.editInvoice ?? true,
        viewCustomerStatements:
          parsed.data.staffPermissions.viewCustomerStatements ?? targetStaff.staffPermissions?.viewCustomerStatements ?? true,
        exportCustomerStatements:
          parsed.data.staffPermissions.exportCustomerStatements ?? targetStaff.staffPermissions?.exportCustomerStatements ?? true,
        sendFinancialDocuments:
          parsed.data.staffPermissions.sendFinancialDocuments ?? targetStaff.staffPermissions?.sendFinancialDocuments ?? false,
      }
    }

    await targetStaff.save()

    return NextResponse.json({
      success: true,
      message: "Staff member updated successfully.",
      staff: {
        id: targetStaff._id.toString(),
        firstName: targetStaff.firstName,
        lastName: targetStaff.lastName,
        email: targetStaff.email,
        phone: targetStaff.phone,
        role: targetStaff.role,
        status: targetStaff.status,
        staffPermissions: targetStaff.staffPermissions,
      },
    })
  } catch (error: unknown) {
    console.error("PATCH /api/admin/staff/[id] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || session.role !== "super_admin") {
      return NextResponse.json(
        { error: "Access denied. Only managers can deactivate staff accounts." },
        { status: 403 }
      )
    }

    const { id } = await params

    if (id === session.userId) {
      return NextResponse.json(
        { error: "You cannot delete or deactivate your own account." },
        { status: 400 }
      )
    }

    if (getDatabaseProvider() === "d1") {
      return handleD1AccountAction({ action: "staff-suspend", request: req, id: id })
    }

    await connectDB()

    const targetStaff = await User.findById(id)
    if (!targetStaff) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    targetStaff.status = "suspended"
    await targetStaff.save()

    return NextResponse.json({
      success: true,
      message: `Staff member ${targetStaff.firstName} ${targetStaff.lastName} has been suspended.`,
    })
  } catch (error: unknown) {
    console.error("DELETE /api/admin/staff/[id] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
