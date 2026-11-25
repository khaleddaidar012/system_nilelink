import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1AccountAction } from "@/lib/accounts/d1-handlers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { connectDB } from "@/lib/mongodb"
import { User } from "@/lib/models/User"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { hashPassword } from "@/lib/auth/password"
import { sanitizeStaffPermissions } from "@/lib/auth/staff-categories"

const createStaffSchema = z.object({
  firstName: z.string().min(2, "First name is required").trim(),
  lastName: z.string().min(2, "Last name is required").trim(),
  jobTitle: z.string().optional().or(z.literal("")),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Valid email required")]).optional(),
  username: z.union([z.literal(""), z.string().trim().toLowerCase().regex(/^[a-z0-9_][a-z0-9_.-]{2,49}$/, "Username must be 3-50 letters, numbers, dots, underscores or hyphens")]).optional(),
  phone: z.string().optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  role: z.enum(["staff", "super_admin"]).default("staff"),
  staffPermissions: z.object({
    canAccessAccounts: z.boolean().optional(),
    canViewShipmentData: z.boolean().optional(),
    staffCategory: z.enum(["operations", "accounts"]).optional(),
    canMarkReadyForAccounts: z.boolean().optional(),
    canSendAlerts: z.boolean().default(true),
    canReviewDocuments: z.boolean().default(true),
    canManageCustomers: z.boolean().default(false),
    issueTaxInvoice: z.boolean().default(false),
    createInvoice: z.boolean().default(true),
    editInvoice: z.boolean().default(true),
    viewCustomerStatements: z.boolean().default(true),
    exportCustomerStatements: z.boolean().default(true),
    sendFinancialDocuments: z.boolean().default(false),
  }),
}).refine(value => value.email || value.username, {
  message: "Email or username is required", path: ["username"],
}).transform(value => ({
  ...value,
  // Reserved, non-deliverable identity for the existing required email column.
  email: value.email || `${value.username}@staff.nilelink.invalid`,
  username: value.username || undefined,
  staffPermissions: value.role === "super_admin" ? value.staffPermissions : sanitizeStaffPermissions(value.staffPermissions),
}))

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || (session.role !== "staff" && session.role !== "super_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (getDatabaseProvider() === "d1") {
      return handleD1AccountAction({ action: "staff-list", request: req })
    }

    await connectDB()

    const staffList = await User.find({
      role: { $in: ["staff", "super_admin"] },
    })
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .lean()

    const formattedStaff = staffList.map((s) => ({
      id: s._id.toString(),
      firstName: s.firstName,
      lastName: s.lastName,
      jobTitle: s.jobTitle || "",
      email: s.email,
      username: s.username,
      phone: s.phone || "",
      role: s.role,
      status: s.status,
      staffPermissions: {
        canAccessAccounts: s.staffPermissions?.canAccessAccounts,
        canSendAlerts: s.staffPermissions?.canSendAlerts ?? true,
        canReviewDocuments: s.staffPermissions?.canReviewDocuments ?? true,
        canManageCustomers: s.staffPermissions?.canManageCustomers ?? false,
        issueTaxInvoice: s.staffPermissions?.issueTaxInvoice ?? false,
        createInvoice: s.staffPermissions?.createInvoice ?? true,
        editInvoice: s.staffPermissions?.editInvoice ?? true,
        canViewShipmentData: s.staffPermissions?.canViewShipmentData,
        viewCustomerStatements: s.staffPermissions?.viewCustomerStatements ?? true,
        exportCustomerStatements: s.staffPermissions?.exportCustomerStatements ?? true,
        sendFinancialDocuments: s.staffPermissions?.sendFinancialDocuments ?? false,
      },
      lastLoginAt: s.lastLoginAt,
      createdAt: s.createdAt,
    }))

    return NextResponse.json({
      success: true,
      staff: formattedStaff,
      totalCount: formattedStaff.length,
    })
  } catch (error: unknown) {
    console.error("GET /api/admin/staff error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session || session.role !== "super_admin") {
      return NextResponse.json(
        { error: "Access denied. Only managers can create employee accounts." },
        { status: 403 }
      )
    }

    const body = await req.json()
    const parsed = createStaffSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      )
    }

    const { firstName, lastName, jobTitle, email, username, phone, password, role, staffPermissions } = parsed.data

    if (getDatabaseProvider() === "d1") {
      return handleD1AccountAction({ action: "staff-create", request: req, input: parsed.data })
    }

    await connectDB()

    if (username && await User.exists({ username })) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 })
    }
    const existingUser = await User.findOne({ email })
    if (existingUser && email.endsWith("@staff.nilelink.invalid")) {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 })
    }
    let newStaff;

    if (existingUser) {
      // Upgrade existing customer to staff/admin
      existingUser.role = role
      existingUser.staffPermissions = staffPermissions
      existingUser.status = "active" // Ensure they are active
      // Update basic info if provided (optional)
      existingUser.firstName = firstName
      existingUser.lastName = lastName
      existingUser.jobTitle = jobTitle
      existingUser.phone = phone
      if (username) existingUser.username = username
      if (password) {
        existingUser.passwordHash = await hashPassword(password)
      }
      await existingUser.save()
      newStaff = existingUser
    } else {
      // Create entirely new user
      if (!password) {
        return NextResponse.json({ error: "Password is required for new accounts" }, { status: 400 })
      }
      const passwordHash = await hashPassword(password)
      newStaff = await User.create({
        firstName,
        lastName,
        jobTitle,
        email,
        ...(username ? { username } : {}),
        phone,
        passwordHash,
        role,
        status: "active",
        emailVerified: true,
        whatsappVerified: true,
        staffPermissions,
      })
    }

    return NextResponse.json({
      success: true,
      message: `Staff member ${firstName} ${lastName} created successfully.`,
      staff: {
        id: newStaff._id.toString(),
        firstName: newStaff.firstName,
        lastName: newStaff.lastName,
        jobTitle: newStaff.jobTitle || "",
        email: newStaff.email,
        username: newStaff.username,
        phone: newStaff.phone,
        role: newStaff.role,
        status: newStaff.status,
        staffPermissions: newStaff.staffPermissions,
        createdAt: newStaff.createdAt,
      },
    })
  } catch (error: unknown) {
    console.error("POST /api/admin/staff error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
