import { getDatabaseProvider } from "@/lib/db/provider"
import { handleD1Workflow } from "@/lib/workflows/d1-handlers"
import { DEFAULT_CATEGORIES } from "@/lib/workflows/default-categories"
import { NextResponse } from "next/server"
import { connectDB } from "@/lib/mongodb"
import { SystemSetting } from "@/lib/models/SystemSetting"

export async function GET(req: Request) {
  try {
    if (getDatabaseProvider() === "d1") {
      return handleD1Workflow({ action: "categories-public", request: req })
    }

    await connectDB()

    let settings = await SystemSetting.findOne({ settingKey: "global_system_settings" })
    if (!settings) {
      settings = await SystemSetting.create({ settingKey: "global_system_settings" })
    }

    const rawCategories = settings.documentCategories || []

    // If DB is missing any core default categories (e.g. import_card, export_card), backfill them
    let modified = false
    const existingKeys = new Set(rawCategories.map((c: { key: string }) => c.key))
    for (const def of DEFAULT_CATEGORIES) {
      if (!existingKeys.has(def.key)) {
        rawCategories.push(def)
        modified = true
      }
    }

    if (modified && settings.save) {
      settings.documentCategories = rawCategories
      await settings.save().catch(() => {})
    }

    const activeCategories = (rawCategories.length > 0 ? rawCategories : DEFAULT_CATEGORIES)
      .filter((cat: { isActive?: boolean }) => cat.isActive !== false)
      .map((cat: { key: string; nameEn: string; nameAr: string; description?: string; defaultValidityDays?: number; isMandatory?: boolean }) => ({
        key: cat.key,
        nameEn: cat.nameEn,
        nameAr: cat.nameAr,
        description: cat.description || "",
        defaultValidityDays: cat.defaultValidityDays || 365,
        isMandatory: cat.isMandatory || false,
      }))

    return NextResponse.json({
      success: true,
      categories: activeCategories,
    })
  } catch (error: unknown) {
    console.error("GET /api/settings/document-categories error:", error)
    return NextResponse.json({
      success: true,
      categories: DEFAULT_CATEGORIES,
    })
  }
}
