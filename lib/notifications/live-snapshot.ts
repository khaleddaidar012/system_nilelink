import { WorkflowStore, actorFor, requireCustomer } from "../workflows/runtime"
export async function portalLiveSnapshot(store: WorkflowStore, request: Request) {
  const actor = await actorFor(store, request), customer = requireCustomer(actor)
  const scopes = [
    ["document_updated", "SELECT id,revision FROM documents WHERE customerId=? ORDER BY id", [customer.id]],
    ["quote_updated", "SELECT id,revision FROM quotes WHERE customerId=? UNION ALL SELECT id,revision FROM quote_items WHERE quoteId IN (SELECT id FROM quotes WHERE customerId=?) ORDER BY id", [customer.id,customer.id]],
    ["request_updated", "SELECT id,revision FROM customer_requests WHERE customerId=? UNION ALL SELECT id,revision FROM request_services WHERE requestId IN (SELECT id FROM customer_requests WHERE customerId=?) UNION ALL SELECT id,revision FROM invoices WHERE customerId=? AND relatedRequestId IS NOT NULL AND status!='draft' ORDER BY id", [customer.id, customer.id,customer.id]],
    ["notification", "SELECT id,revision FROM notifications WHERE recipientUserId=? OR (recipientUserId IS NULL AND targetAudience='customer' AND (recipientCustomerId IS NULL OR recipientCustomerId=?)) ORDER BY id", [actor.user._id,customer.id]],
  ] as const
  const result: Record<string,string> = { account_updated: `${actor.snapshot.revision}:${customer.id}:${customer.revision}` }
  const rows = await store.db.batch(scopes.map(([,sql,values])=>store.db.prepare(sql).bind(...values)))
  scopes.forEach(([type],index)=>{ if(!rows[index].success)throw new Error("Live query failed");result[type]=JSON.stringify(rows[index].results) })
  return result
}
