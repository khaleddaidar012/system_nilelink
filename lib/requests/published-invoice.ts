import {isAccountingInvoice} from "../shipments/invoice-kind"
import type { WorkflowStore } from "../workflows/runtime"
export async function publishedRequestInvoice(store:WorkflowStore,requestId:string,customerId:string) {
  const invoice=(await store.list("invoices","relatedRequestId=? AND customerId=? AND status IN ('confirmed','sent','paid','partially_paid','overdue') AND json_extract(data,'$.archivedAt') IS NULL",[requestId,customerId]))[0]
  if(!invoice)return null
  const latest=invoice.data.shipmentAccounting?.publications?.at(-1)
  if(isAccountingInvoice(invoice.data)&&!latest)return null
  return {id:invoice.id,invoiceNumber:invoice.data.invoiceNumber,referenceNumber:invoice.data.referenceNumber,token:invoice.data.token,currency:invoice.data.currency,total:latest?.total??String(invoice.data.totalAmount)}
}
