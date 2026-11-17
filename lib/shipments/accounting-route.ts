import { getD1 } from "../db/d1"
import { WorkflowStore, actorFor } from "../workflows/runtime"
import { handleShipmentInvoices, shipmentInvoiceError } from "../workflows/shipment-invoices"

export async function shipmentAccountingRoute(request: Request, action: string, id?: string) {
  let result: Response
  try {
    const store = new WorkflowStore(await getD1())
    const actor = await actorFor(store, request)
    store.activity = { user: actor.user, action }
    result = await handleShipmentInvoices(store, actor, { action, request, id })
  } catch (error) { result = shipmentInvoiceError(error) }
  result.headers.set("Cache-Control", "private, no-store")
  return result
}
