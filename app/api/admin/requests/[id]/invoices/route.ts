import { requestInvoicesRoute } from "@/lib/shipments/request-invoices"
type Context = { params: Promise<{ id: string }> }
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: Context) { return requestInvoicesRoute(request, (await context.params).id) }
export async function POST(request: Request, context: Context) { return requestInvoicesRoute(request, (await context.params).id) }
