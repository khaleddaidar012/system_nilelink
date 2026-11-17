import { requestInvoicesRoute } from "@/lib/shipments/request-invoices"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return requestInvoicesRoute(request, (await context.params).id, true) }
