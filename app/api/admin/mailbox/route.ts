import { handleMailboxRequest } from "@/lib/mailbox/handler"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const GET = (request: Request) => handleMailboxRequest(request)
export const POST = (request: Request) => handleMailboxRequest(request)
