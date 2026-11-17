import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { getSessionFromRequest } from "@/lib/auth/token-service"
import { getDatabaseProvider } from "@/lib/db/provider"
import { getD1 } from "@/lib/db/d1"
import { D1UsersRepository } from "@/lib/db/repositories/users"
import { D1AccountsRepository } from "@/lib/db/repositories/accounts"
import { connectDB } from "@/lib/mongodb"
import { User } from "@/lib/models"
import { avatarExtension } from "@/lib/accounts/avatar"
import { putPreviewFile, readPreviewOrSourceFile, removePreviewFile } from "@/lib/storage/d1-preview-storage"

async function owner(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return null
  if (getDatabaseProvider() === "d1") {
    const db = await getD1(), loaded = await new D1UsersRepository(db).findById(session.userId)
    if (!loaded || !["active", "pending_verification"].includes(loaded.user.status)) return null
    return { id: loaded.user._id, key: loaded.user.avatarKey as string | undefined, update: (patch: Record<string, unknown>) => new D1AccountsRepository(db).patchUser(loaded, patch) }
  }
  await connectDB()
  const user = await User.findById(session.userId)
  if (!user || !["active", "pending_verification"].includes(user.status)) return null
  return { id: String(user._id), key: user.avatarKey as string | undefined, update: async (patch: Record<string, unknown>) => { await User.updateOne({ _id: user._id }, { $set: patch }) } }
}
export async function GET(request: NextRequest) {
  try {
    const user = await owner(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!user.key?.startsWith(`_nilelink_d1_preview/avatars/${user.id}/`)) return new NextResponse(null, { status: 404 })
    const file = await readPreviewOrSourceFile(user.key)
    const mime = user.key.endsWith(".png") ? "image/png" : user.key.endsWith(".webp") ? "image/webp" : "image/jpeg"
    return new NextResponse(file.body as BodyInit, { headers: { "content-type": mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } })
  } catch { return NextResponse.json({ error: "Unable to load avatar" }, { status: 500 }) }
}
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 })
    const user = await owner(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (Number(request.headers.get("content-length") || 0) > 2 * 1024 * 1024 + 65536) return NextResponse.json({ error: "Maximum avatar size is 2MB" }, { status: 413 })
    const form = await request.formData(), file = form.get("file")
    if (!(file instanceof File) || file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Choose JPG, PNG or WEBP up to 2MB" }, { status: 400 })
    const bytes = Buffer.from(await file.arrayBuffer()), extension = avatarExtension(bytes, file.type)
    if (!extension) return NextResponse.json({ error: "Invalid image format" }, { status: 400 })
    const token = randomUUID(), key = `_nilelink_d1_preview/avatars/${user.id}/${token}.${extension}`, avatarUrl = `/api/portal/profile/avatar?v=${token}`
    await putPreviewFile(bytes, key, file.type)
    try { await user.update({ avatarKey: key, avatarUrl }) } catch { await removePreviewFile(key); return NextResponse.json({ error: "Profile changed; try again" }, { status: 409 }) }
    if (user.key?.startsWith(`_nilelink_d1_preview/avatars/${user.id}/`)) await removePreviewFile(user.key).catch(() => {})
    return NextResponse.json({ avatarUrl })
  } catch { return NextResponse.json({ error: "Unable to upload avatar" }, { status: 500 }) }
}
