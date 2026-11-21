import {handleFinalDocuments} from "./final-documents"
import type { D1Binding } from "../db/d1"
import { WorkflowStore, WorkflowError, actorFor, response } from "./runtime"
import type { WorkflowInput } from "./runtime"
import { handleRequests } from "./requests"
import { handleDocuments, defaultStorage } from "./documents"
import type { WorkflowStorage } from "./documents"
import { handleCategories, handleNotifications } from "./settings"
import { handleFinance } from "./finance"
import { handleInvoices } from "./invoices"
import { handleFinancialViews, publicInvoice } from "./financial-views"
import { queueFinancialDelivery } from "./delivery"
import { handleExpiry } from "./expiry"
import { trackAnalytics, analyticsAccess, websiteAnalytics, accountAnalytics, systemOverview } from "./analytics"

const documentActions = new Set(["document-upload", "document-download", "documents-list", "admin-documents-review", "admin-documents-expiring", "admin-request-documents", "admin-document-verify", "admin-document-delete", "admin-document-warning"])
export function createD1WorkflowHandler(db: D1Binding, options: { storage?: WorkflowStorage } = {}) {
  return async (args: WorkflowInput): Promise<Response> => {
    const store = new WorkflowStore(db)
    try {
      if (args.action === "categories-public") return await handleCategories(store, null, args)
      if (args.action === "public-invoice") return await publicInvoice(store, args)
      if (args.action === "expiry-evaluate") return await handleExpiry(store, args)
      if (args.action === "analytics-track") return await trackAnalytics(store, args)
      if (args.action === "analytics-dashboard") { await analyticsAccess(store, args.request); return await websiteAnalytics(store) }
      const actor = await actorFor(store, args.request)
      store.activity = { user: actor.user, action: args.action }
      if (args.action === "admin-analytics-overview") return await accountAnalytics(store, actor)
      if (args.action === "admin-system-overview") return await systemOverview(store, actor)
      if (["invoice-send", "statement-send"].includes(args.action)) return await queueFinancialDelivery(store, actor, args)
      if (["portal-financials", "admin-invoice-pdf", "portal-invoice-pdf", "statement-view", "statement-pdf"].includes(args.action)) return await handleFinancialViews(store, actor, args)
      if (args.action === "payment-record") return await handleFinance(store, actor, args)
      if (args.action.startsWith("invoice")) return await handleInvoices(store, actor, args)
      if(args.action==="admin-request-final-documents"||args.action==="request-final-documents")return await handleFinalDocuments(store,actor,args,options.storage??defaultStorage)
      if (documentActions.has(args.action)) return await handleDocuments(store, actor, args, options.storage ?? defaultStorage)
      if (args.action.startsWith("categor")) return await handleCategories(store, actor, args)
      if (args.action.includes("notification")) return await handleNotifications(store, actor, args)
      return await handleRequests(store, actor, args)
    } catch (error) {
      if (error instanceof WorkflowError) return response({ error: error.message }, error.status)
      return response({ error: "Workflow operation failed", code: "D1_WORKFLOW_ERROR" }, 500)
    }
  }
}
export async function handleD1Workflow(args: WorkflowInput): Promise<Response> {
  try {
    const { getD1 } = await import("../db/d1")
    return await createD1WorkflowHandler(await getD1())(args)
  } catch { return response({ error: "D1 workflow preview is unavailable", code: "D1_UNAVAILABLE" }, 503) }
}
